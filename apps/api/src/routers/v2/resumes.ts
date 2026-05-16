/**
 * /api/resumes — persistent resume bank.
 *
 * One user can keep many resumes (one labelled "primary"). Each resume stores
 * the raw extracted text + a parsed_json blob ({ skills, experience, ... }).
 * The primary resume is what default tailoring/AI generation uses; the others
 * are pulled in as context to widen the candidate-skill graph.
 *
 * Routes:
 *   GET    /api/resumes                  list user's resumes (no raw_text)
 *   GET    /api/resumes/:id              full record incl. raw_text
 *   POST   /api/resumes                  upload (multipart 'resume') OR { label, text }
 *   PATCH  /api/resumes/:id              { label?, isPrimary? }
 *   DELETE /api/resumes/:id
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';

export const resumesRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  next();
}

// ---- Lightweight extraction (mirrors apps/api/src/routers/v2/resume.ts) ----
const COMMON_SKILLS = [
  'Python','JavaScript','TypeScript','Go','Rust','Java','Kotlin','Swift','Ruby','C++','C#','Scala','Elixir','PHP','R','MATLAB',
  'React','Next.js','Vue','Svelte','Angular','Node.js','Express','HTML','CSS','Tailwind','GraphQL','REST',
  'SQL','PostgreSQL','MySQL','MongoDB','Redis','Snowflake','BigQuery','PyTorch','TensorFlow','CUDA','Pandas','NumPy','Scikit-learn',
  'Spark','Kafka','Airflow','dbt','LLM','RAG',
  'AWS','GCP','Azure','Docker','Kubernetes','Terraform','Ansible','Linux','Bash',
  'Google Analytics','GA4','Google Ads','Meta Ads','HubSpot','Marketo','Salesforce','Mixpanel','Amplitude','Segment','Tableau','Looker',
  'A/B Testing','SEO','SEM','Figma','Sketch','Jira','Linear','Notion','Confluence',
];

function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function extract(text: string) {
  const skills: string[] = [];
  for (const s of COMMON_SKILLS) {
    if (new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegex(s)}(?=$|[^A-Za-z0-9_])`, 'i').test(text)) skills.push(s);
  }
  const t = text.toLowerCase();
  let experience: string | null = null;
  if (/\b(director|vp|vice president|head of)\b/.test(t)) experience = 'director';
  else if (/\b(principal|distinguished)\b/.test(t)) experience = 'principal';
  else if (/\bstaff\b/.test(t)) experience = 'staff';
  else if (/\b(senior|sr\.|lead)\b/.test(t)) experience = 'senior';
  else {
    const yoe = t.match(/(\d+)\+?\s*(years?|yrs?)\s+(of\s+)?(experience|exp)/);
    if (yoe) {
      const y = parseInt(yoe[1], 10);
      experience = y >= 10 ? 'staff' : y >= 6 ? 'senior' : y >= 3 ? 'mid' : y >= 1 ? 'junior' : null;
    } else if (/\b(junior|jr\.|associate)\b/.test(t)) experience = 'junior';
    else if (/\b(intern|internship)\b/.test(t)) experience = 'intern';
    else if (/\b(entry[-\s]?level|new grad|recent graduate)\b/.test(t)) experience = 'entry';
  }
  return { skills, experience };
}

async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') {
    // pdf-parse v2 exports a PDFParse class (not a callable default).
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: file.buffer });
    const r = await parser.getText();
    return r.text ?? '';
  }
  if (name.endsWith('.docx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = (await import('mammoth')) as any;
    const r = await mammoth.extractRawText({ buffer: file.buffer });
    return r.value ?? '';
  }
  if (name.endsWith('.txt') || file.mimetype === 'text/plain') {
    return file.buffer.toString('utf8');
  }
  throw new Error('unsupported_format');
}

// ---- Routes ----

resumesRouter.get('/api/resumes', requireUser, async (req: Request, res: Response) => {
  const userId = req.session!.userId!;
  const r = await db.execute(sql`
    SELECT id, label, mime_type, original_filename, parsed_json, is_primary, created_at,
           length(raw_text) AS chars
    FROM user_resumes WHERE user_id = ${userId}
    ORDER BY is_primary DESC, created_at DESC
  `);
  res.json({
    resumes: r.rows.map((row: any) => ({
      id: row.id,
      label: row.label,
      mimeType: row.mime_type,
      originalFilename: row.original_filename,
      parsed: row.parsed_json,
      isPrimary: row.is_primary,
      createdAt: row.created_at,
      chars: row.chars,
    })),
  });
});

resumesRouter.get('/api/resumes/:id', requireUser, async (req: Request, res: Response) => {
  const userId = req.session!.userId!;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const r = await db.execute(sql`
    SELECT id, label, mime_type, original_filename, raw_text, parsed_json, is_primary, created_at
    FROM user_resumes WHERE id = ${id} AND user_id = ${userId} LIMIT 1
  `);
  const row = r.rows[0] as any;
  if (!row) { res.status(404).json({ error: 'not_found' }); return; }
  res.json({
    resume: {
      id: row.id,
      label: row.label,
      mimeType: row.mime_type,
      originalFilename: row.original_filename,
      rawText: row.raw_text,
      parsed: row.parsed_json,
      isPrimary: row.is_primary,
      createdAt: row.created_at,
    },
  });
});

const pasteSchema = z.object({
  label: z.string().min(1).max(80),
  text: z.string().min(50).max(50000),
  isPrimary: z.boolean().optional(),
});

resumesRouter.post(
  '/api/resumes',
  requireUser,
  upload.single('resume'),
  async (req: Request, res: Response) => {
    const userId = req.session!.userId!;
    let label: string;
    let text: string;
    let mimeType: string | null = null;
    let originalFilename: string | null = null;
    let isPrimary = false;

    if (req.file) {
      try {
        text = await extractTextFromFile(req.file);
      } catch (err: any) {
        res.status(err.message === 'unsupported_format' ? 400 : 422).json({
          error: err.message === 'unsupported_format' ? 'unsupported_format' : 'parse_failed',
          message: err.message?.slice(0, 200),
        });
        return;
      }
      if (text.trim().length < 50) {
        res.status(422).json({ error: 'too_short', message: 'extracted < 50 chars (image-only PDF?)' });
        return;
      }
      label = (req.body.label || req.file.originalname.replace(/\.[^/.]+$/, '')).slice(0, 80);
      mimeType = req.file.mimetype;
      originalFilename = req.file.originalname;
      isPrimary = req.body.isPrimary === 'true' || req.body.isPrimary === true;
    } else {
      const parsed = pasteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
        return;
      }
      label = parsed.data.label;
      text = parsed.data.text;
      isPrimary = parsed.data.isPrimary ?? false;
    }

    const parsedJson = extract(text);

    if (isPrimary) {
      await db.execute(sql`UPDATE user_resumes SET is_primary = false WHERE user_id = ${userId}`);
    }

    // First resume becomes primary by default.
    const countR = await db.execute(sql`SELECT COUNT(*)::int AS n FROM user_resumes WHERE user_id = ${userId}`);
    const isFirst = ((countR.rows[0] as any)?.n ?? 0) === 0;

    const ins = await db.execute(sql`
      INSERT INTO user_resumes (user_id, label, mime_type, original_filename, raw_text, parsed_json, is_primary)
      VALUES (${userId}, ${label}, ${mimeType}, ${originalFilename}, ${text},
              ${JSON.stringify(parsedJson)}::jsonb, ${isPrimary || isFirst})
      RETURNING id, label, mime_type, original_filename, parsed_json, is_primary, created_at, length(raw_text) AS chars
    `);
    const row = ins.rows[0] as any;
    res.status(201).json({
      resume: {
        id: row.id,
        label: row.label,
        mimeType: row.mime_type,
        originalFilename: row.original_filename,
        parsed: row.parsed_json,
        isPrimary: row.is_primary,
        createdAt: row.created_at,
        chars: row.chars,
      },
    });
  }
);

const patchSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  isPrimary: z.boolean().optional(),
});

resumesRouter.patch('/api/resumes/:id', requireUser, async (req: Request, res: Response) => {
  const userId = req.session!.userId!;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }

  const owner = await db.execute(sql`SELECT id FROM user_resumes WHERE id = ${id} AND user_id = ${userId} LIMIT 1`);
  if (!owner.rows[0]) { res.status(404).json({ error: 'not_found' }); return; }

  if (parsed.data.isPrimary === true) {
    await db.execute(sql`UPDATE user_resumes SET is_primary = false WHERE user_id = ${userId}`);
  }
  if (parsed.data.label !== undefined) {
    await db.execute(sql`UPDATE user_resumes SET label = ${parsed.data.label} WHERE id = ${id}`);
  }
  if (parsed.data.isPrimary !== undefined) {
    await db.execute(sql`UPDATE user_resumes SET is_primary = ${parsed.data.isPrimary} WHERE id = ${id}`);
  }
  res.json({ ok: true });
});

resumesRouter.delete('/api/resumes/:id', requireUser, async (req: Request, res: Response) => {
  const userId = req.session!.userId!;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  await db.execute(sql`DELETE FROM user_resumes WHERE id = ${id} AND user_id = ${userId}`);
  res.json({ ok: true });
});
