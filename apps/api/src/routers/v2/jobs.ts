/**
 * /api/jobs — calibrated, scored job feed for the logged-in user.
 *
 * Reads the v1 public.jobs table and maps fields into the v2 ScoringJob shape,
 * then runs the v2 matcher to attach a calibrated MatchResult per job.
 *
 * The response shape is "job + match merged" so the existing React UI
 * (built against v1) can render without changes:
 *   { id, title, ..., matchScore, visaScore, label, interviewProbability,
 *     confidenceInterval, subscores, explain, visaIntel }
 *
 * Routes:
 *   GET  /api/jobs                     scored feed (v2-clean)
 *   GET  /api/jobs/feed                same, returns { jobs: [...] } (UI alias)
 *   GET  /api/jobs/:id                 single scored job
 *   POST /api/jobs/:id/swipe           record swipe (v2-clean)
 *   POST /api/jobs/:id/interact        record interaction (UI alias for swipe)
 *   POST /api/jobs/:id/apply           record apply
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';
import {
  scoreFeedForUser,
  scoreJobForUser,
  type ScoringJob,
  type ScoringUser,
} from '../../scoring/matcher.js';
import type { MatchResult } from '@swipehire/shared';

export const jobsRouter: Router = Router();

function authedUserId(req: Request): number | null {
  return req.session?.userId ?? null;
}

async function loadScoringUser(userId: number): Promise<ScoringUser | null> {
  const r = await db.execute(sql`
    SELECT id, target_job_title, preferred_location, visa_status, experience,
           expected_salary, remote_preference, skills, resume_data,
           original_resume_content
    FROM users WHERE id = ${userId} LIMIT 1
  `);
  const u = r.rows[0] as any;
  if (!u) return null;

  const workAuthV2 = u.visa_status
    ? { status: u.visa_status, autoFillVisaQuestion: true }
    : null;

  return {
    id: u.id,
    workAuthV2,
    targetSocs: [],
    targetRoleFamilies: u.target_job_title ? [u.target_job_title] : [],
    preferredLocation: u.preferred_location,
    remotePreference: u.remote_preference,
    expectedSalary: u.expected_salary,
    experience: u.experience,
    skills: u.skills ?? [],
    resumeData: u.resume_data,
    originalResumeContent: u.original_resume_content,
  };
}

function rowToScoringJob(r: any): ScoringJob {
  return {
    id: r.id,
    title: r.title,
    company: r.company,
    description: r.description,
    requirements: r.requirements ?? [],
    location: r.location,
    isRemote: r.is_remote ?? false,
    isHybrid: r.is_hybrid ?? false,
    socCode: null,
    roleFamilyId: null,
    salaryMin: r.salary_min,
    salaryMax: r.salary_max,
    sponsorsVisa: r.sponsors_visa ?? false,
    createdAt: r.created_at ? new Date(r.created_at) : null,
  };
}

/**
 * Merge a job and its MatchResult into the flat shape the UI expects.
 * matchScore is 0-100 (UI display); interviewProbability is 0-1 (raw).
 */
function flattenForUi(job: ScoringJob, match: MatchResult, raw: any) {
  const matchScore = match.interviewProbability != null
    ? Math.round(match.interviewProbability * 100)
    : null;
  const visaScore = match.subscores.visaCompatibility?.value != null
    ? Math.round(match.subscores.visaCompatibility.value * 100)
    : null;
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    requirements: job.requirements ?? [],
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    type: raw.type,
    isRemote: job.isRemote,
    isHybrid: job.isHybrid,
    sponsorsVisa: job.sponsorsVisa,
    externalUrl: raw.external_url,
    createdAt: job.createdAt,
    // v2 calibrated fields
    matchScore,
    visaScore,
    label: match.label,
    interviewProbability: match.interviewProbability,
    confidenceInterval: match.confidenceInterval,
    subscores: match.subscores,
    visaIntel: match.visaIntel,
    explain: match.explain,
  };
}

const feedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  excludeSeen: z.coerce.boolean().default(true),
});

async function buildFeed(req: Request, res: Response) {
  const userId = authedUserId(req);
  if (!userId) return res.status(401).json({ error: 'not_authenticated' });

  const parsed = feedQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { limit, excludeSeen } = parsed.data;

  const user = await loadScoringUser(userId);
  if (!user) return res.status(401).json({ error: 'user_not_found' });

  const seenFilter = excludeSeen
    ? sql`AND id NOT IN (SELECT job_id FROM user_job_interactions WHERE user_id = ${userId})`
    : sql``;
  const r = await db.execute(sql`
    SELECT id, title, company, location, description, requirements,
           salary_min, salary_max, type, is_remote, is_hybrid, sponsors_visa,
           h1b_approval_rate, recent_sponsorship_count, external_url, created_at
    FROM jobs
    WHERE 1=1 ${seenFilter}
    ORDER BY created_at DESC NULLS LAST
    LIMIT ${limit * 2}
  `);

  const rawRows = r.rows ?? [];
  const jobs = rawRows.map(rowToScoringJob);
  if (jobs.length === 0) {
    return res.json({ jobs: [], count: 0, hint: 'No jobs yet — run pnpm db:seed' });
  }

  const matches = await scoreFeedForUser(user, jobs, { skipAuthenticity: true });

  const merged = jobs
    .map((j, i) => flattenForUi(j, matches[i], rawRows[i]))
    .sort((a, b) => (b.interviewProbability ?? 0) - (a.interviewProbability ?? 0))
    .slice(0, limit);

  res.json({ jobs: merged, count: merged.length });
}

jobsRouter.get('/api/jobs', buildFeed);
jobsRouter.get('/api/jobs/feed', buildFeed);

jobsRouter.get('/api/jobs/:id', async (req: Request, res: Response) => {
  const userId = authedUserId(req);
  if (!userId) return res.status(401).json({ error: 'not_authenticated' });

  const jobId = parseInt(req.params.id, 10);
  if (Number.isNaN(jobId)) return res.status(400).json({ error: 'invalid_job_id' });

  const r = await db.execute(sql`SELECT * FROM jobs WHERE id = ${jobId} LIMIT 1`);
  const row = r.rows[0] as any;
  if (!row) return res.status(404).json({ error: 'job_not_found' });

  const user = await loadScoringUser(userId);
  if (!user) return res.status(401).json({ error: 'user_not_found' });

  const job = rowToScoringJob(row);
  const match = await scoreJobForUser(user, job, { skipAuthenticity: true });
  res.json(flattenForUi(job, match, row));
});

const swipeSchema = z.object({
  action: z.enum(['swipe_right', 'swipe_left', 'bookmark', 'apply']),
  // UI sends these as strings via .toString(); coerce.
  matchScore: z.coerce.number().min(0).max(100).optional(),
  visaScore: z.coerce.number().min(0).max(100).optional(),
});

async function recordInteraction(req: Request, res: Response) {
  const userId = authedUserId(req);
  if (!userId) return res.status(401).json({ error: 'not_authenticated' });

  const jobId = parseInt(req.params.id, 10);
  if (Number.isNaN(jobId)) return res.status(400).json({ error: 'invalid_job_id' });

  const parsed = swipeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { action, matchScore, visaScore } = parsed.data;

  const result = await db.execute(sql`
    INSERT INTO user_job_interactions (user_id, job_id, action, match_score, visa_score)
    VALUES (${userId}, ${jobId}, ${action}, ${matchScore ?? null}, ${visaScore ?? null})
    RETURNING id, user_id, job_id, action
  `);
  res.json({ ok: true, interaction: result.rows[0] });
}

jobsRouter.post('/api/jobs/:id/swipe', recordInteraction);
jobsRouter.post('/api/jobs/:id/interact', recordInteraction);

jobsRouter.post('/api/jobs/:id/apply', async (req: Request, res: Response) => {
  const userId = authedUserId(req);
  if (!userId) return res.status(401).json({ error: 'not_authenticated' });

  const jobId = parseInt(req.params.id, 10);
  if (Number.isNaN(jobId)) return res.status(400).json({ error: 'invalid_job_id' });

  // Insert interaction (idempotent-ish: an "apply" entry per click is fine).
  await db.execute(sql`
    INSERT INTO user_job_interactions (user_id, job_id, action)
    VALUES (${userId}, ${jobId}, 'apply')
  `);

  // Insert into applications table (one row per apply).
  await db.execute(sql`
    INSERT INTO applications (user_id, job_id, status)
    VALUES (${userId}, ${jobId}, 'pending')
  `);

  res.json({ ok: true });
});
