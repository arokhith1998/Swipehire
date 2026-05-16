/**
 * Google OAuth — sign in / sign up with Google.
 *
 * Required env:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_CALLBACK_URL   e.g. https://api.swipehire.io/api/auth/google/callback
 *   APP_URL               e.g. https://app.swipehire.io  (where to redirect after auth)
 *
 * If creds are missing the routes simply 503 instead of crashing — keeps the
 * api bootable on local dev without Google configured.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';
import { sendWelcomeEmail } from '../../services/email.js';

export const googleRouter: Router = Router();

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackURL = process.env.GOOGLE_CALLBACK_URL ?? 'https://api.swipehire.io/api/auth/google/callback';

if (clientID && clientSecret) {
  passport.use(new GoogleStrategy(
    { clientID, clientSecret, callbackURL },
    async (_at, _rt, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase().trim();
        if (!email) return done(new Error('no_email_from_google'));

        const firstName = profile.name?.givenName ?? '';
        const lastName = profile.name?.familyName ?? '';

        // 1. Find by google_id.
        let r = await db.execute(sql`SELECT id, email, first_name FROM users WHERE google_id = ${profile.id} LIMIT 1`);
        let user = r.rows[0] as any;
        let isNew = false;

        if (!user) {
          // 2. Same email already registered (password auth) — link the Google ID.
          r = await db.execute(sql`SELECT id, email, first_name FROM users WHERE email = ${email} LIMIT 1`);
          user = r.rows[0] as any;
          if (user) {
            await db.execute(sql`UPDATE users SET google_id = ${profile.id} WHERE id = ${user.id}`);
          } else {
            // 3. New user.
            const ins = await db.execute(sql`
              INSERT INTO users (email, google_id, first_name, last_name)
              VALUES (${email}, ${profile.id}, ${firstName}, ${lastName})
              RETURNING id, email, first_name
            `);
            user = ins.rows[0] as any;
            isNew = true;
          }
        }

        if (isNew) {
          sendWelcomeEmail(user.email, user.first_name || firstName).catch(() => undefined);
        }
        return done(null, { id: user.id });
      } catch (err) {
        return done(err as Error);
      }
    }
  ));
}

googleRouter.get('/api/auth/google', (req: Request, res: Response, next: NextFunction) => {
  if (!clientID || !clientSecret) {
    return res.status(503).json({ error: 'google_oauth_not_configured' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

googleRouter.get('/api/auth/google/callback', (req: Request, res: Response, next: NextFunction) => {
  const appUrl = process.env.APP_URL ?? 'https://app.swipehire.io';
  if (!clientID || !clientSecret) {
    return res.redirect(`${appUrl}/login?error=google_not_configured`);
  }
  passport.authenticate('google', { session: false }, (err: any, user: { id: number } | false) => {
    if (err || !user) {
      return res.redirect(`${appUrl}/login?error=google_failed`);
    }
    req.session.userId = user.id;
    req.session.save(() => res.redirect(appUrl));
  })(req, res, next);
});
