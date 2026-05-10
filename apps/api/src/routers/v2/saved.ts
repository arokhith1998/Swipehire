/**
 * /api/v2/saved — Save-for-later library.
 *
 * The "keep it" idea: jobs we couldn't auto-apply to, the user wants
 * to come back to. Distinct from interactions.bookmark — this is the
 * curated pile of "I want to act on this later, manually."
 *
 * GET    /api/v2/saved              list user's saved jobs
 * POST   /api/v2/saved              { jobId, note?, reminderAt? } — save
 * DELETE /api/v2/saved/:jobId       remove from library
 * PATCH  /api/v2/saved/:jobId       { note?, reminderAt?, appliedExternally? }
 */

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';

export const savedRouter: RouterType = Router();

function authedUserId(req: Request): number | null {
  return (req as any).user?.id ?? null;
}

savedRouter.get('/api/v2/saved', async (req, res) => {
  const userId = authedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const r = await db.execute(sql`
    SELECT s.id AS saved_id, s.note, s.reminder_at, s.applied_externally, s.applied_at, s.created_at,
           j.id, j.title, j.company, j.location, j.description, j.requirements,
           j.salary_min, j.salary_max, j.is_remote, j.is_hybrid, j.sponsors_visa,
           j.ats_type, j.auto_apply_capability, j.external_url
    FROM app.saved_jobs s
    JOIN app.jobs j ON j.id = s.job_id
    WHERE s.user_id = ${userId}
    ORDER BY COALESCE(s.reminder_at, s.created_at + INTERVAL '7 days') ASC
  `);
  res.json({ saved: r.rows ?? [] });
});

const saveSchema = z.object({
  jobId: z.number().int().positive(),
  note: z.string().max(2000).optional(),
  reminderAt: z.string().datetime().optional(),
});

savedRouter.post('/api/v2/saved', async (req, res) => {
  const userId = authedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { jobId, note, reminderAt } = parsed.data;
  await db.execute(sql`
    INSERT INTO app.saved_jobs (user_id, job_id, note, reminder_at)
    VALUES (${userId}, ${jobId}, ${note ?? null}, ${reminderAt ?? null})
    ON CONFLICT (user_id, job_id) DO UPDATE
      SET note = EXCLUDED.note,
          reminder_at = EXCLUDED.reminder_at
  `);
  res.json({ ok: true });
});

savedRouter.delete('/api/v2/saved/:jobId', async (req, res) => {
  const userId = authedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const jobId = parseInt(req.params.jobId, 10);
  if (Number.isNaN(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

  await db.execute(sql`
    DELETE FROM app.saved_jobs WHERE user_id = ${userId} AND job_id = ${jobId}
  `);
  res.json({ ok: true });
});

const patchSchema = z.object({
  note: z.string().max(2000).optional(),
  reminderAt: z.string().datetime().nullable().optional(),
  appliedExternally: z.boolean().optional(),
});

savedRouter.patch('/api/v2/saved/:jobId', async (req, res) => {
  const userId = authedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const jobId = parseInt(req.params.jobId, 10);
  if (Number.isNaN(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { note, reminderAt, appliedExternally } = parsed.data;
  await db.execute(sql`
    UPDATE app.saved_jobs
    SET note = COALESCE(${note ?? null}, note),
        reminder_at = ${reminderAt ?? null},
        applied_externally = COALESCE(${appliedExternally ?? null}, applied_externally),
        applied_at = CASE
          WHEN ${appliedExternally ?? null}::boolean = true AND applied_at IS NULL THEN NOW()
          ELSE applied_at
        END
    WHERE user_id = ${userId} AND job_id = ${jobId}
  `);
  res.json({ ok: true });
});
