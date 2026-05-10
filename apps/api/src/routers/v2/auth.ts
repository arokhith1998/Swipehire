/**
 * /api/auth — minimal email+password auth for beta.
 *
 * Uses bcrypt + express-session (the session middleware is wired in app.ts).
 * Reads/writes the v1 public.users table directly so the existing onboarding
 * UI keeps working.
 *
 * Routes:
 *   POST /api/auth/register   { email, password, firstName, lastName }
 *   POST /api/auth/login      { email, password }
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';

export const authRouter: Router = Router();

const BCRYPT_ROUNDS = 12;

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});

authRouter.post('/api/auth/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  }
  const { email, password, firstName, lastName } = parsed.data;
  const emailNorm = email.toLowerCase().trim();

  const existing = await db.execute(sql`SELECT id FROM users WHERE email = ${emailNorm} LIMIT 1`);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'email_taken' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await db.execute(sql`
    INSERT INTO users (email, password, first_name, last_name)
    VALUES (${emailNorm}, ${passwordHash}, ${firstName}, ${lastName})
    RETURNING id, email, first_name, last_name, is_profile_complete
  `);
  const user = result.rows[0] as any;

  req.session.userId = user.id;
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isProfileComplete: user.is_profile_complete ?? false,
    },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/api/auth/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const emailNorm = parsed.data.email.toLowerCase().trim();
  const r = await db.execute(sql`
    SELECT id, email, password, first_name, last_name, is_profile_complete
    FROM users WHERE email = ${emailNorm} LIMIT 1
  `);
  const user = r.rows[0] as any;
  if (!user || !user.password) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const ok = await bcrypt.compare(parsed.data.password, user.password);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  req.session.userId = user.id;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isProfileComplete: user.is_profile_complete ?? false,
    },
  });
});

authRouter.post('/api/auth/logout', (req: Request, res: Response) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'logout_failed' });
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/api/auth/me', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'not_authenticated' });

  const r = await db.execute(sql`
    SELECT id, email, first_name, last_name, is_profile_complete,
           target_job_title, preferred_location, visa_status, experience,
           expected_salary, remote_preference, skills
    FROM users WHERE id = ${userId} LIMIT 1
  `);
  const user = r.rows[0] as any;
  if (!user) {
    req.session.destroy(() => undefined);
    return res.status(401).json({ error: 'not_authenticated' });
  }
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isProfileComplete: user.is_profile_complete ?? false,
      targetJobTitle: user.target_job_title,
      preferredLocation: user.preferred_location,
      visaStatus: user.visa_status,
      experience: user.experience,
      expectedSalary: user.expected_salary,
      remotePreference: user.remote_preference,
      skills: user.skills ?? [],
    },
  });
});

/**
 * Express middleware that attaches req.user when the session has a userId.
 * Other routers can `if (!req.user) return res.sendStatus(401)`.
 */
export function attachUserMiddleware(req: Request, _res: Response, next: any): void {
  const userId = req.session?.userId;
  if (userId) (req as any).user = { id: userId };
  next();
}
