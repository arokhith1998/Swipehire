/**
 * SwipeHire v2 API entry point.
 *
 * Wires Express, sessions, auth, v2 routers, and the Honesty Dashboard router.
 *
 * Production deployment notes:
 *   - SESSION_STORE=postgres in prod so sessions survive Railway restarts and
 *     work across multiple instances.
 *   - COOKIE_DOMAIN=.swipehire.io in prod so the session cookie set by
 *     api.swipehire.io is sent by the browser when the SPA at app.swipehire.io
 *     calls the API.
 *   - CORS_ORIGINS lists the SPAs allowed to call us (comma-separated).
 *   - trust proxy = 1 because Railway/Vercel terminate TLS upstream and
 *     forward via X-Forwarded-* headers.
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import passport from 'passport';
import cors from 'cors';
import { pino } from 'pino';
import { honestyRouter } from './honesty/routes.js';
import { flags } from './config/flags.js';
import { authRouter, attachUserMiddleware } from './routers/v2/auth.js';
import { googleRouter } from './routers/v2/google.js';
import { jobsRouter } from './routers/v2/jobs.js';
import { profileRouter } from './routers/v2/profile.js';
import { dashboardRouter } from './routers/v2/dashboard.js';
import { resumeRouter } from './routers/v2/resume.js';
import { resumesRouter } from './routers/v2/resumes.js';
import { generateRouter } from './routers/v2/generate.js';
import { adminRouter } from './routers/v2/admin.js';
import { outcomesRouter } from './routers/v2/outcomes.js';
import { companiesRouter } from './routers/v2/companies.js';
import { financialsRouter } from './routers/v2/financials.js';
import { db } from '@swipehire/db';
import { sql } from 'drizzle-orm';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },
});

function parseOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174,http://localhost:5175';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function createApp(): Express {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  // Behind Railway / Vercel / any TLS-terminating proxy.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: false }));

  // CORS — must come before session so preflights succeed without cookies.
  const allowedOrigins = parseOrigins();
  app.use(cors({
    origin: (origin, cb) => {
      // Same-origin requests have no Origin header; allow.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }));

  // Session — Postgres-backed in prod, memory in dev.
  const useStore = process.env.SESSION_STORE === 'postgres';
  const SessionStore = useStore ? connectPg(session) : null;

  if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me-in-production')) {
    throw new Error('SESSION_SECRET must be set to a real value in production');
  }

  app.use(session({
    secret: process.env.SESSION_SECRET ?? 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    store: SessionStore
      ? new SessionStore({
          conString: process.env.DATABASE_URL,
          tableName: 'session',
          createTableIfMissing: true,
        })
      : undefined,
    cookie: {
      // In prod the SPA at app.swipehire.io calls api.swipehire.io —
      // setting Domain=.swipehire.io makes the cookie shared across both.
      domain: process.env.COOKIE_DOMAIN || undefined,
      secure: isProd,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,   // 30 days
      sameSite: isProd ? 'none' : 'lax',
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());
  app.use(attachUserMiddleware);

  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api')) {
        log.info({
          method: req.method, path: req.path, status: res.statusCode,
          ms: Date.now() - t0,
        });
      }
    });
    next();
  });

  // Liveness — fast, no external deps.
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '2.0.0-dev',
      flags: {
        v2_matcher: flags.USE_V2_MATCHER,
        v2_tailoring: flags.USE_V2_TAILORING,
        v2_liveness: flags.USE_V2_LIVENESS,
        v2_visa: flags.USE_V2_VISA,
      },
    });
  });

  // Readiness — pings DB. Used by Railway to decide when to route traffic.
  app.get('/api/ready', async (_req: Request, res: Response) => {
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
    const t0 = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
      checks.db = { ok: true, ms: Date.now() - t0 };
    } catch (err: any) {
      checks.db = { ok: false, error: err.message?.slice(0, 200) };
    }
    const ok = Object.values(checks).every(c => c.ok);
    res.status(ok ? 200 : 503).json({ ok, checks });
  });

  // ---- v2 routers ----
  app.use(authRouter);
  app.use(googleRouter);
  app.use(jobsRouter);
  app.use(profileRouter);
  app.use(resumeRouter);
  app.use(resumesRouter);
  app.use(generateRouter);
  app.use(dashboardRouter);
  app.use(outcomesRouter);
  app.use(companiesRouter);
  app.use(financialsRouter);
  app.use(adminRouter);
  app.use(honestyRouter);

  // NOTE: routers/v2/feed.ts and routers/v2/saved.ts query the future
  // `app` schema with v2-only columns that don't exist in the DB yet.

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    log.error({ err: err.message, stack: err.stack, path: req.path }, 'unhandled');
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT ?? '5000', 10);
  createApp().listen(port, () => log.info(`✅ SwipeHire API listening on :${port}`));
}
