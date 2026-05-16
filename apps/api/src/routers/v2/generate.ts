/**
 * /api/generate — tailored CV + cover letter for a specific job.
 *
 * Two-step flow so the frontend can show a preview without paying for OpenAI twice:
 *   1) POST /api/generate/spec   { jobId, kind: 'cv'|'cover_letter' }
 *      → returns { spec } (the structured JSON)
 *   2) POST /api/generate/render { spec, kind, format: 'pdf'|'docx' }
 *      → streams the file
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';
import { generateCV, generateCoverLetter } from '../../services/generator/openai.js';
import { renderCvHtml } from '../../services/generator/cvHtml.js';
import { renderCoverLetterHtml } from '../../services/generator/coverLetterHtml.js';
import { htmlToPdf } from '../../services/generator/pdf.js';
import { cvToDocx, coverLetterToDocx } from '../../services/generator/docx.js';
import type { GeneratorContext, GeneratedCV, GeneratedCoverLetter } from '../../services/generator/types.js';

export const generateRouter: Router = Router();

function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) { res.status(401).json({ error: 'not_authenticated' }); return; }
  next();
}

async function loadContext(userId: number, jobId: number): Promise<GeneratorContext | null> {
  const u = (await db.execute(sql`
    SELECT first_name, last_name, email, phone, location, bio, education
    FROM users WHERE id = ${userId} LIMIT 1
  `)).rows[0] as any;
  if (!u) return null;

  const j = (await db.execute(sql`
    SELECT id, title, company, description, location FROM jobs WHERE id = ${jobId} LIMIT 1
  `)).rows[0] as any;
  if (!j) return null;

  const r = await db.execute(sql`
    SELECT label, raw_text, is_primary FROM user_resumes WHERE user_id = ${userId}
    ORDER BY is_primary DESC, created_at DESC
    LIMIT 6
  `);
  const resumes = r.rows.map((row: any) => ({
    label: row.label, isPrimary: row.is_primary, rawText: row.raw_text,
  }));

  return {
    user: {
      firstName: u.first_name ?? '',
      lastName: u.last_name ?? '',
      email: u.email,
      phone: u.phone,
      location: u.location,
      bio: u.bio,
      education: u.education,
    },
    job: {
      id: j.id,
      title: j.title ?? 'Role',
      company: j.company ?? 'Company',
      description: j.description ?? '',
      location: j.location,
    },
    resumes,
  };
}

const specSchema = z.object({
  jobId: z.number().int().positive(),
  kind: z.enum(['cv', 'cover_letter']),
});

generateRouter.post('/api/generate/spec', requireUser, async (req: Request, res: Response) => {
  const parsed = specSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() }); return; }
  const userId = req.session!.userId!;

  const ctx = await loadContext(userId, parsed.data.jobId);
  if (!ctx) { res.status(404).json({ error: 'job_or_user_not_found' }); return; }
  if (ctx.resumes.length === 0) {
    res.status(400).json({ error: 'no_resumes', message: 'Upload at least one resume on your Profile page first.' });
    return;
  }

  try {
    if (parsed.data.kind === 'cv') {
      const spec = await generateCV(ctx);
      res.json({ kind: 'cv', spec });
    } else {
      const spec = await generateCoverLetter(ctx);
      res.json({ kind: 'cover_letter', spec });
    }
  } catch (err: any) {
    if (err.message === 'OPENAI_API_KEY not configured') {
      res.status(503).json({ error: 'openai_not_configured' });
      return;
    }
    res.status(502).json({ error: 'generation_failed', message: err.message?.slice(0, 200) });
  }
});

const renderSchema = z.object({
  kind: z.enum(['cv', 'cover_letter']),
  format: z.enum(['pdf', 'docx']),
  spec: z.record(z.any()),
});

generateRouter.post('/api/generate/render', requireUser, async (req: Request, res: Response) => {
  const parsed = renderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
  const { kind, format, spec } = parsed.data;

  try {
    let buf: Buffer;
    let filename: string;
    if (kind === 'cv') {
      const cv = spec as unknown as GeneratedCV;
      const slug = (cv.name ?? 'resume').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
      if (format === 'pdf') {
        buf = await htmlToPdf(renderCvHtml(cv));
        filename = `${slug}_resume.pdf`;
      } else {
        buf = await cvToDocx(cv);
        filename = `${slug}_resume.docx`;
      }
    } else {
      const cl = spec as unknown as GeneratedCoverLetter;
      const slug = `${(cl.candidateName ?? 'candidate').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30)}_${(cl.company ?? 'company').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30)}`;
      if (format === 'pdf') {
        buf = await htmlToPdf(renderCoverLetterHtml(cl));
        filename = `${slug}_cover_letter.pdf`;
      } else {
        buf = await coverLetterToDocx(cl);
        filename = `${slug}_cover_letter.docx`;
      }
    }

    const mime = format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: 'render_failed', message: err.message?.slice(0, 200) });
  }
});
