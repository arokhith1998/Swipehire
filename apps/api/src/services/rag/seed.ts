/**
 * Reseed the RAG knowledge corpus into ml.knowledge_chunks.
 *
 * Idempotent: each chunk has a stable (kind, source_id) key. If the body hasn't
 * changed (sha256 match against content_hash) we skip the embed call — embeddings
 * cost money so we re-embed only when the underlying text changes.
 */
import { db } from '@swipehire/db';
import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { embed } from './index.js';
import { IMMIGRATION_CORPUS, statsRowToChunk } from './corpus.js';

const EMBED_MODEL = 'text-embedding-3-small';

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function ensureKnowledgeChunksTable(): Promise<void> {
  // Idempotent — table is also defined in Drizzle schema, but real prod
  // sometimes doesn't have it pushed yet. Create-if-missing.
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ml.knowledge_chunks (
      id              BIGSERIAL PRIMARY KEY,
      kind            TEXT NOT NULL,
      source_id       TEXT,
      title           TEXT,
      body            TEXT NOT NULL,
      metadata        JSONB,
      embedding       VECTOR(1536),
      embedding_model TEXT DEFAULT 'text-embedding-3-small',
      content_hash    TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_chunks_kind_idx ON ml.knowledge_chunks (kind)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_chunks_source_idx ON ml.knowledge_chunks (kind, source_id)`);
  // HNSW index for cosine retrieval. m=16/ef_construction=64 is a good
  // balance of build time vs. query speed for up to ~100k chunks.
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'knowledge_chunks_emb_idx') THEN
        CREATE INDEX knowledge_chunks_emb_idx ON ml.knowledge_chunks
          USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
      END IF;
    END $$;
  `);
}

/**
 * Upsert a single chunk. Re-embeds only if the content_hash differs from
 * what's stored, so re-seeding is cheap on the second run.
 */
async function upsertChunk(args: {
  kind: string;
  sourceId: string | null;
  title: string | null;
  body: string;
  metadata?: any;
}): Promise<'inserted' | 'updated' | 'unchanged'> {
  const hash = sha256(args.body);
  const existing = await db.execute(sql`
    SELECT id, content_hash FROM ml.knowledge_chunks
    WHERE kind = ${args.kind} AND source_id = ${args.sourceId}
    LIMIT 1
  `);
  const row = existing.rows[0] as any;
  if (row && row.content_hash === hash) return 'unchanged';

  const vec = await embed(args.body);
  const vecLit = `[${vec.join(',')}]`;
  const metaJson = JSON.stringify(args.metadata ?? {});

  if (row) {
    await db.execute(sql`
      UPDATE ml.knowledge_chunks
      SET title = ${args.title}, body = ${args.body}, metadata = ${metaJson}::jsonb,
          embedding = ${vecLit}::vector, embedding_model = ${EMBED_MODEL},
          content_hash = ${hash}, updated_at = NOW()
      WHERE id = ${row.id}
    `);
    return 'updated';
  }
  await db.execute(sql`
    INSERT INTO ml.knowledge_chunks (kind, source_id, title, body, metadata, embedding, embedding_model, content_hash)
    VALUES (${args.kind}, ${args.sourceId}, ${args.title}, ${args.body}, ${metaJson}::jsonb,
            ${vecLit}::vector, ${EMBED_MODEL}, ${hash})
  `);
  return 'inserted';
}

export interface SeedResult {
  ms: number;
  totals: { inserted: number; updated: number; unchanged: number; errors: number };
  byKind: Record<string, { inserted: number; updated: number; unchanged: number; errors: number }>;
}

/**
 * Seed the immigration explainers + per-employer visa stats. Reads from
 * visa.employer_visa_stats which is populated by the DOL LCA ingest.
 */
export async function reseedKnowledgeBase(opts: { kinds?: string[]; limit?: number } = {}): Promise<SeedResult> {
  const t0 = Date.now();
  await ensureKnowledgeChunksTable();

  const totals = { inserted: 0, updated: 0, unchanged: 0, errors: 0 };
  const byKind: Record<string, typeof totals> = {};
  const bump = (kind: string, key: keyof typeof totals) => {
    totals[key]++;
    byKind[kind] ??= { inserted: 0, updated: 0, unchanged: 0, errors: 0 };
    byKind[kind][key]++;
  };

  const wants = (k: string) => !opts.kinds?.length || opts.kinds.includes(k);

  // 1) Immigration explainers (small, hand-written set)
  if (wants('immigration_rule')) {
    for (const doc of IMMIGRATION_CORPUS) {
      try {
        const result = await upsertChunk({
          kind: 'immigration_rule',
          sourceId: doc.slug,
          title: doc.title,
          body: doc.body,
        });
        bump('immigration_rule', result);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[rag.seed] immigration_rule', doc.slug, 'failed:', err.message);
        bump('immigration_rule', 'errors');
      }
    }
  }

  // 2) Per-(FEIN, SOC) employer visa stats — limited by `limit` if provided.
  if (wants('company_visa')) {
    const r = await db.execute(sql`
      SELECT evs.fein, evs.soc_code, evs.total_lcas_24mo, evs.certified_count,
             evs.denied_count, evs.withdrawn_count,
             evs.median_wage_offered::text AS median_wage_offered,
             evs.p25_wage_offered::text AS p25_wage_offered,
             evs.p75_wage_offered::text AS p75_wage_offered,
             evs.last_sponsored_at,
             (SELECT employer_name FROM visa.lca_records lr
              WHERE lr.fein = evs.fein LIMIT 1) AS employer_name
      FROM visa.employer_visa_stats evs
      WHERE evs.total_lcas_24mo >= 5         -- skip companies with negligible volume
      ORDER BY evs.total_lcas_24mo DESC
      ${opts.limit ? sql`LIMIT ${opts.limit}` : sql``}
    `);
    for (const row of (r.rows as any[])) {
      try {
        if (!row.employer_name) { bump('company_visa', 'errors'); continue; }
        const chunk = statsRowToChunk(row);
        const result = await upsertChunk({
          kind: 'company_visa',
          sourceId: chunk.sourceId,
          title: chunk.title,
          body: chunk.body,
          metadata: chunk.metadata,
        });
        bump('company_visa', result);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[rag.seed] company_visa', row.fein, row.soc_code, 'failed:', err.message);
        bump('company_visa', 'errors');
      }
    }
  }

  return { ms: Date.now() - t0, totals, byKind };
}
