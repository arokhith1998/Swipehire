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
import { eq } from 'drizzle-orm';
import { db, users } from '@swipehire/db';

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
  // Accepts a single value ('remote') or comma-separated multi ('remote,hybrid').
  remotePreference: z.string()
    .max(40)
    .refine(
      (s) => s.split(',').every(p => ['remote', 'hybrid', 'onsite'].includes(p.trim())),
      { message: "Each value must be one of: remote, hybrid, onsite" }
    )
    .optional(),
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

  // Build a partial update object — only set the columns the caller actually
  // sent. Drizzle's typed update knows how to bind text[] (skills) to Postgres,
  // unlike the raw `sql` template which crashes on JS arrays.
  const updates: Record<string, any> = {};
  if (p.firstName !== undefined) updates.firstName = p.firstName;
  if (p.lastName !== undefined) updates.lastName = p.lastName;
  if (p.phone !== undefined) updates.phone = p.phone;
  if (p.location !== undefined) updates.location = p.location;
  if (p.targetJobTitle !== undefined) updates.targetJobTitle = p.targetJobTitle;
  if (p.preferredLocation !== undefined) updates.preferredLocation = p.preferredLocation;
  if (p.visaStatus !== undefined) updates.visaStatus = p.visaStatus;
  if (p.jobTitle !== undefined) updates.jobTitle = p.jobTitle;
  if (p.experience !== undefined) updates.experience = p.experience;
  if (p.expectedSalary !== undefined) updates.expectedSalary = p.expectedSalary;
  if (p.bio !== undefined) updates.bio = p.bio;
  if (p.education !== undefined) updates.education = p.education;
  if (p.remotePreference !== undefined) updates.remotePreference = p.remotePreference;
  if (p.skills !== undefined) updates.skills = p.skills;
  if (p.isProfileComplete !== undefined) updates.isProfileComplete = p.isProfileComplete;

  await db.update(users).set(updates).where(eq(users.id, userId));

  const updated = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      targetJobTitle: users.targetJobTitle,
      preferredLocation: users.preferredLocation,
      visaStatus: users.visaStatus,
      experience: users.experience,
      expectedSalary: users.expectedSalary,
      remotePreference: users.remotePreference,
      skills: users.skills,
      isProfileComplete: users.isProfileComplete,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const u = updated[0];
  res.json({
    user: {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      targetJobTitle: u.targetJobTitle,
      preferredLocation: u.preferredLocation,
      visaStatus: u.visaStatus,
      experience: u.experience,
      expectedSalary: u.expectedSalary,
      remotePreference: u.remotePreference,
      skills: u.skills ?? [],
      isProfileComplete: u.isProfileComplete ?? false,
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
