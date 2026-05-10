/**
 * /api/admin — operator endpoints, gated by an X-Admin-Token header.
 *
 * The token is set via env var ADMIN_TOKEN. If unset, all admin routes
 * return 503 (intentionally fail-closed).
 *
 * Routes:
 *   POST /api/admin/ingest/greenhouse   { orgs?: string[] }   — run Greenhouse ingest synchronously
 *   GET  /api/admin/stats                                       — DB + queue summary
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';
import { ingestAllOrgs, GREENHOUSE_ORGS } from '../../services/greenhouseIngest.js';

export const adminRouter: Router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(503).json({ error: 'admin_disabled', message: 'ADMIN_TOKEN env var not set on the server' });
    return;
  }
  const sent = req.header('X-Admin-Token');
  if (sent !== expected) {
    res.status(401).json({ error: 'invalid_admin_token' });
    return;
  }
  next();
}

const ingestSchema = z.object({
  orgs: z.array(z.string().min(1).max(50)).max(100).optional(),
});

adminRouter.post('/api/admin/ingest/greenhouse', requireAdmin, async (req, res) => {
  const parsed = ingestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    return;
  }
  const orgs = parsed.data.orgs ?? GREENHOUSE_ORGS;

  // Run synchronously and stream back the totals. ~5min for full set; client should set
  // a long timeout if hitting all orgs.
  const t0 = Date.now();
  try {
    const results = await ingestAllOrgs(orgs);
    const totals = results.reduce(
      (a, r) => ({
        fetched: a.fetched + r.fetched,
        inserted: a.inserted + r.inserted,
        updated: a.updated + r.updated,
        skipped: a.skipped + r.skipped,
        errors: a.errors + r.errors,
      }),
      { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 }
    );
    res.json({ ok: true, ms: Date.now() - t0, orgs, totals, perOrg: results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? 'ingest failed' });
  }
});

adminRouter.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  const [users, jobs, interactions, applications] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS n FROM users`),
    db.execute(sql`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE sponsors_visa)::int AS visa FROM jobs`),
    db.execute(sql`SELECT action, COUNT(*)::int AS n FROM user_job_interactions GROUP BY action`),
    db.execute(sql`SELECT status, COUNT(*)::int AS n FROM applications GROUP BY status`),
  ]);

  const interactionsByAction: Record<string, number> = {};
  for (const r of (interactions.rows ?? []) as any[]) interactionsByAction[r.action] = r.n;
  const applicationsByStatus: Record<string, number> = {};
  for (const r of (applications.rows ?? []) as any[]) applicationsByStatus[r.status] = r.n;

  res.json({
    users: (users.rows[0] as any)?.n ?? 0,
    jobs: {
      total: (jobs.rows[0] as any)?.n ?? 0,
      sponsorsVisa: (jobs.rows[0] as any)?.visa ?? 0,
    },
    interactionsByAction,
    applicationsByStatus,
  });
});
