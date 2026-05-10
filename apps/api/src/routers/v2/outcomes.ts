/**
 * /api/applications — outcome capture, the data flywheel for calibration.
 *
 * When a user reports the actual outcome of an application (interview /
 * offer / rejected / no_response / withdrew), we record it AND the
 * scored MatchResult that was active when they applied. That joined
 * data is what trains the next calibration model.
 *
 * Without this loop the v2 matcher's "interview probability" stays a
 * theoretical claim; with it, calibration is empirically anchored.
 *
 * Routes:
 *   GET  /api/applications                      list user's applications
 *   POST /api/applications/:id/outcome          { outcome: 'interview'|'offer'|'rejected'|'no_response'|'withdrew' }
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { db, applications, jobs as jobsTable } from '@swipehire/db';
import { scoreJobForUser, type ScoringJob } from '../../scoring/matcher.js';

export const outcomesRouter: Router = Router();

const OUTCOME_VALUES = ['interview', 'offer', 'rejected', 'no_response', 'withdrew'] as const;
type Outcome = typeof OUTCOME_VALUES[number];

const outcomeSchema = z.object({
  outcome: z.enum(OUTCOME_VALUES),
});

outcomesRouter.get('/api/applications', async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  const rows = await db.execute(sql`
    SELECT a.id, a.job_id, a.status, a.applied_at, a.last_updated,
           j.title, j.company, j.location, j.external_url, j.sponsors_visa
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.user_id = ${userId}
    ORDER BY a.applied_at DESC
    LIMIT 200
  `);
  res.json({ applications: rows.rows ?? [] });
});

outcomesRouter.post('/api/applications/:id/outcome', async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  const appId = parseInt(req.params.id, 10);
  if (Number.isNaN(appId)) {
    res.status(400).json({ error: 'invalid_application_id' });
    return;
  }

  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    return;
  }
  const outcome = parsed.data.outcome;

  // 1. Confirm the application is the user's.
  const owned = await db
    .select({ id: applications.id, jobId: applications.jobId })
    .from(applications)
    .where(and(eq(applications.id, appId), eq(applications.userId, userId)))
    .limit(1);
  if (owned.length === 0) {
    res.status(404).json({ error: 'application_not_found' });
    return;
  }
  const jobId = owned[0].jobId;

  // 2. Update applications.status with the outcome.
  await db
    .update(applications)
    .set({ status: outcome, lastUpdated: new Date() })
    .where(eq(applications.id, appId));

  // 3. Re-score the job for this user RIGHT NOW and persist the (matchResult, outcome)
  //    pair to ml.score_outcomes. This is the training row for next calibration retrain.
  //    We re-score (vs. capturing at apply-time) to keep the architecture simple — the
  //    user's profile is roughly the same as when they applied, and the matcher is
  //    deterministic given inputs.
  let calibrationLogged = false;
  let calibrationError: string | null = null;
  try {
    const jobRows = await db.execute(sql`SELECT * FROM jobs WHERE id = ${jobId} LIMIT 1`);
    const jrow = jobRows.rows[0] as any;
    if (jrow) {
      // Load the scoring user view.
      const ur = await db.execute(sql`
        SELECT id, target_job_title, preferred_location, visa_status, experience,
               expected_salary, remote_preference, skills, resume_data, original_resume_content
        FROM users WHERE id = ${userId} LIMIT 1
      `);
      const u = ur.rows[0] as any;
      const scoringUser = {
        id: u.id,
        workAuthV2: u.visa_status ? { status: u.visa_status, autoFillVisaQuestion: true } : null,
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
      const scoringJob: ScoringJob = {
        id: jrow.id,
        title: jrow.title,
        company: jrow.company,
        description: jrow.description,
        requirements: jrow.requirements ?? [],
        location: jrow.location,
        isRemote: jrow.is_remote ?? false,
        isHybrid: jrow.is_hybrid ?? false,
        socCode: null,
        roleFamilyId: null,
        salaryMin: jrow.salary_min,
        salaryMax: jrow.salary_max,
        sponsorsVisa: jrow.sponsors_visa ?? false,
        createdAt: jrow.created_at ? new Date(jrow.created_at) : null,
      };
      const match = await scoreJobForUser(scoringUser, scoringJob, { skipAuthenticity: true });

      await db.execute(sql`
        INSERT INTO ml.score_outcomes (user_id, job_id, match_result, model_version, outcome, outcome_at, outcome_source)
        VALUES (${userId}, ${jobId}, ${JSON.stringify(match)}::jsonb, ${match.explain.modelVersion},
                ${outcome}, NOW(), 'user')
      `);
      calibrationLogged = true;
    }
  } catch (err: any) {
    calibrationError = err.message?.slice(0, 200) ?? 'unknown';
    console.warn('[outcomes] failed to persist score_outcomes:', err.message);
  }

  res.json({ ok: true, applicationId: appId, outcome, calibrationLogged, calibrationError });
});
