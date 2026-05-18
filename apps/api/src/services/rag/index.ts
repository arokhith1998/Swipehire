/**
 * RAG (retrieval-augmented generation) — visa/company/role/salary/immigration Q&A.
 *
 * Pipeline:
 *   1. Embed the user question (text-embedding-3-small, 1536-dim).
 *   2. Cosine-similarity search against ml.knowledge_chunks. Optionally
 *      filter by kind (company_visa | immigration_rule | role_norms | salary_band).
 *   3. Pass top-K chunks as context to gpt-4o-mini for a grounded answer,
 *      explicitly instructing it to refuse to invent facts and to cite which
 *      chunk it used.
 *
 * Knowledge sources are seeded by services/rag/seed.ts (run via the admin
 * endpoint /api/admin/rag/reseed). For v1 we seed:
 *   - company_visa: one chunk per (FEIN, SOC) from visa.employer_visa_stats
 *   - immigration_rule: hand-written explainers in services/rag/corpus.ts
 *
 * Future kinds:
 *   - role_norms: typical responsibilities / requirements for each SOC,
 *     mined from past JD ingest
 *   - salary_band: per-(SOC, location) percentiles from DOL prevailing-wage data
 */
import OpenAI from 'openai';
import { db } from '@swipehire/db';
import { sql } from 'drizzle-orm';

const EMBED_MODEL = 'text-embedding-3-small';
const ANSWER_MODEL = process.env.RAG_ANSWER_MODEL ?? 'gpt-4o-mini';

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export async function embed(text: string): Promise<number[]> {
  const r = await openai().embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000),       // model accepts up to ~8k tokens; truncate defensively
  });
  return r.data[0].embedding;
}

export interface RetrievedChunk {
  id: number;
  kind: string;
  sourceId: string | null;
  title: string | null;
  body: string;
  metadata: any;
  similarity: number;                  // 0..1; higher = closer
}

/**
 * pgvector cosine-similarity retrieval. Filters by kind when provided.
 * Returns at most `k` chunks, sorted by similarity DESC.
 */
export async function retrieve(
  question: string,
  opts: { k?: number; kinds?: string[] } = {}
): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 6;
  const queryEmbedding = await embed(question);
  const vecLiteral = `[${queryEmbedding.join(',')}]`;     // pgvector literal

  const kindFilter = opts.kinds?.length
    ? sql`AND kind = ANY(${opts.kinds})`
    : sql``;

  // 1 - cosine_distance = cosine_similarity. Drizzle has no first-class
  // pgvector operator helpers yet, so we drop to raw SQL with the <=> operator.
  const r = await db.execute(sql`
    SELECT id, kind, source_id, title, body, metadata,
           1 - (embedding <=> ${vecLiteral}::vector) AS similarity
    FROM ml.knowledge_chunks
    WHERE embedding IS NOT NULL ${kindFilter}
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT ${k}
  `);
  return (r.rows as any[]).map(row => ({
    id: row.id,
    kind: row.kind,
    sourceId: row.source_id,
    title: row.title,
    body: row.body,
    metadata: row.metadata,
    similarity: Number(row.similarity),
  }));
}

export interface AskAnswer {
  answer: string;
  citations: Array<{ id: number; title: string | null; kind: string; similarity: number }>;
  retrievedChars: number;
  modelVersion: string;
}

const ASK_SYSTEM = `You are SwipeHire's visa and hiring Q&A assistant. You answer concisely and ONLY using the retrieved context provided. Rules:
- If the context doesn't answer the question, say so plainly: "I don't have that data yet" — do not guess.
- Pull specific numbers / dates / employer names from the context when relevant.
- Cite the chunk you used by its number in brackets, like [1], [3]. The user sees a numbered source list below your answer.
- Keep answers under 150 words unless the user asks for detail.
- Never invent metrics, FEINs, certification rates, or salary numbers.
- If the question is about a specific company / role that isn't in the context, say so and suggest the user check the company's actual DOL filings.`;

export async function ask(question: string, opts: { k?: number; kinds?: string[] } = {}): Promise<AskAnswer> {
  const chunks = await retrieve(question, opts);
  if (chunks.length === 0) {
    return {
      answer: "I don't have any knowledge indexed yet. Run the seeder (/api/admin/rag/reseed) to populate the corpus.",
      citations: [],
      retrievedChars: 0,
      modelVersion: ANSWER_MODEL,
    };
  }

  const contextBlock = chunks
    .map((c, i) => `[${i + 1}] ${c.title ? `${c.title}\n` : ''}${c.body}`)
    .join('\n\n---\n\n');

  const r = await openai().chat.completions.create({
    model: ANSWER_MODEL,
    messages: [
      { role: 'system', content: ASK_SYSTEM },
      { role: 'user', content: `RETRIEVED CONTEXT:\n\n${contextBlock}\n\nQUESTION: ${question}` },
    ],
    temperature: 0.2,
    max_tokens: 500,
  });

  return {
    answer: r.choices[0]?.message?.content ?? '(no response)',
    citations: chunks.map((c, i) => ({
      id: c.id,
      title: c.title ?? `Source ${i + 1}`,
      kind: c.kind,
      similarity: c.similarity,
    })),
    retrievedChars: contextBlock.length,
    modelVersion: ANSWER_MODEL,
  };
}
