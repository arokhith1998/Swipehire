/**
 * /api/profile — update logged-in user's profile fields.
 *
 * The onboarding flow PATCHes here at each step (basic info → preferences →
 * visa status → skills). All fields are optional; only provided ones update.
 *
 * The profile page also POSTs here (legacy alias kept for compatibility).
 *
 * Routes:
 *   PATCH /api/profile          partial update
 *   POST  /api/profile          partial update (alias)
 *   POST  /api/resume/upload    501 for beta — resume upload deferred
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';

export const profileRouter: Router = Router();

const profilePatchSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  phone: z.string().max(40).optional(),
  location: z.string().max(200).optional(),
  targetJobTitle: z.string().max(200).optional(),
  preferredLocation: z.string().max(200).optional(),
  visaStatus: z.string().max(40).optional(),
  jobTitle: z.string().max(200).optional(),
  experience: z.string().max(40).optional(),
  expectedSalary: z.string().max(80).optional(),
  bio: z.string().max(2000).optional(),
  education: z.string().max(2000).optional(),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  skills: z.array(z.string().max(80)).max(200).optional(),
  isProfileComplete: z.boolean().optional(),
});

async function updateProfile(req: Request, res: Response): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  const parsed = profilePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  if (Object.keys(p).length === 0) {
    res.status(400).json({ error: 'no_fields_provided' });
    return;
  }

  // Build dynamic UPDATE — only set the columns the caller actually sent.
  await db.execute(sql`
    UPDATE users SET
      first_name           = COALESCE(${p.firstName ?? null}, first_name),
      last_name            = COALESCE(${p.lastName ?? null}, last_name),
      phone                = COALESCE(${p.phone ?? null}, phone),
      location             = COALESCE(${p.location ?? null}, location),
      target_job_title     = COALESCE(${p.targetJobTitle ?? null}, target_job_title),
      preferred_location   = COALESCE(${p.preferredLocation ?? null}, preferred_location),
      visa_status          = COALESCE(${p.visaStatus ?? null}, visa_status),
      job_title            = COALESCE(${p.jobTitle ?? null}, job_title),
      experience           = COALESCE(${p.experience ?? null}, experience),
      expected_salary      = COALESCE(${p.expectedSalary ?? null}, expected_salary),
      bio                  = COALESCE(${p.bio ?? null}, bio),
      education            = COALESCE(${p.education ?? null}, education),
      remote_preference    = COALESCE(${p.remotePreference ?? null}, remote_preference),
      skills               = COALESCE(${p.skills ?? null}, skills),
      is_profile_complete  = COALESCE(${p.isProfileComplete ?? null}, is_profile_complete)
    WHERE id = ${userId}
  `);

  const r = await db.execute(sql`
    SELECT id, email, first_name, last_name, target_job_title, preferred_location,
           visa_status, experience, expected_salary, remote_preference, skills,
           is_profile_complete
    FROM users WHERE id = ${userId} LIMIT 1
  `);
  const u = r.rows[0] as any;
  res.json({
    user: {
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      targetJobTitle: u.target_job_title,
      preferredLocation: u.preferred_location,
      visaStatus: u.visa_status,
      experience: u.experience,
      expectedSalary: u.expected_salary,
      remotePreference: u.remote_preference,
      skills: u.skills ?? [],
      isProfileComplete: u.is_profile_complete ?? false,
    },
  });
}

profileRouter.patch('/api/profile', updateProfile);
profileRouter.post('/api/profile', updateProfile);

profileRouter.post('/api/resume/upload', (_req, res) => {
  res.status(501).json({
    error: 'not_implemented',
    message: 'Resume upload not in v2 beta. Add skills + preferences directly via /api/profile.',
  });
});
