/**
 * /api/v2/feed — calibrated, gated, capability-filtered job feed.
 *
 * Query params:
 *   limit          1-100, default 50
 *   capability     'apply_ready' | 'all'   — apply_ready = tier1+tier2+extension_universal
 *   sort           'best_match' | 'apply_ready_first' | 'newest'
 *   cursor         opaque cursor for pagination (Phase 2)
 *
 * Uses the v2 matcher when USE_V2_MATCHER flag is enabled.
 */

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { scoreFeedForUser, type ScoringJob, type ScoringUser } from '../../scoring/matcher.js';
import { flags } from '../../config/flags.js';
import { db } from '@swipehire/db';

export const feedRouter: RouterType = Router();

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  capability: z.enum(['apply_ready', 'all']).default('all'),
  sort: z.enum(['best_match', 'apply_ready_first', 'newest']).default('best_match'),
  cursor: z.string().optional(),
});

const APPLY_READY_CAPABILITIES = ['tier1_server', 'tier2_assisted', 'extension_universal'];

feedRouter.get('/api/v2/feed', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const parsed = feedQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { limit, capability } = parsed.data;

  if (!flags.USE_V2_MATCHER) {
    return res.status(503).json({
      error: 'v2 matcher disabled',
      hint: 'Set USE_V2_MATCHER=true in .env to enable',
    });
  }

  // Load user
  const userRows = await db.execute(sql`
    SELECT id, work_auth_v2, target_socs, target_role_families, preferred_location,
           remote_preference, expected_salary, experience, skills, resume_data,
           original_resume_content, cip_code
    FROM app.users WHERE id = ${userId}
  `);
  const userRow = userRows.rows?.[0] as any;
  if (!userRow) return res.status(404).json({ error: 'User not found' });

  const user: ScoringUser = {
    id: userRow.id,
    workAuthV2: userRow.work_auth_v2,
    targetSocs: userRow.target_socs ?? [],
    targetRoleFamilies: userRow.target_role_families ?? [],
    preferredLocation: userRow.preferred_location,
    remotePreference: userRow.remote_preference,
    expectedSalary: userRow.expected_salary,
    experience: userRow.experience,
    skills: userRow.skills ?? [],
    resumeData: userRow.resume_data,
    originalResumeContent: userRow.original_resume_content,
    cipCode: userRow.cip_code,
  };

  // Build candidate query — capability filter is the core of Phase 1
  const capabilityFilter = capability === 'apply_ready'
    ? sql`AND auto_apply_capability = ANY(${APPLY_READY_CAPABILITIES})`
    : sql``;

  // Sort by capability first when requested
  const orderClause = parsed.data.sort === 'apply_ready_first'
    ? sql`ORDER BY (auto_apply_capability = 'tier1_server')::int DESC,
                   (auto_apply_capability = 'tier2_assisted')::int DESC,
                   created_at DESC`
    : parsed.data.sort === 'newest'
      ? sql`ORDER BY created_at DESC`
      : sql`ORDER BY created_at DESC`;   // best_match handled post-scoring

  const jobRows = await db.execute(sql`
    SELECT id, title, company, location, description, requirements,
           salary_min, salary_max, type, is_remote, is_hybrid, sponsors_visa,
           soc_code, role_family_id, ats_type, auto_apply_capability,
           liveness_probability, ghost_risk, created_at
    FROM app.jobs
    WHERE (expired_at IS NULL OR expired_at > NOW())
      AND (ghost_risk IS DISTINCT FROM 'high')
      ${capabilityFilter}
    ${orderClause}
    LIMIT ${limit * 3}                  -- over-fetch then re-rank by score
  `);

  const jobs: ScoringJob[] = (jobRows.rows ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    company: r.company,
    description: r.description,
    requirements: r.requirements ?? [],
    location: r.location,
    isRemote: r.is_remote ?? false,
    isHybrid: r.is_hybrid ?? false,
    socCode: r.soc_code,
    roleFamilyId: r.role_family_id,
    salaryMin: r.salary_min,
    salaryMax: r.salary_max,
    sponsorsVisa: r.sponsors_visa ?? false,
    createdAt: r.created_at,
    ats_type: r.ats_type,
  }));

  const scored = await scoreFeedForUser(user, jobs);

  // Combine job + score + capability badge for the UI
  const results = jobs.map((j, i) => ({
    job: j,
    capability: (jobRows.rows[i] as any).auto_apply_capability ?? 'manual_only',
    match: scored[i],
  }));

  // Final sort by interview probability if best_match
  if (parsed.data.sort === 'best_match') {
    results.sort((a, b) => (b.match.interviewProbability ?? 0) - (a.match.interviewProbability ?? 0));
  }

  res.json({
    results: results.slice(0, limit),
    count: results.length,
    capability,
    sort: parsed.data.sort,
  });
});
