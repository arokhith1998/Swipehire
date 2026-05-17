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
import { ingestAllOrgs, GREENHOUSE_ORGS, ingestOrg as ingestGreenhouseOrg } from '../../services/greenhouseIngest.js';
import { ingestLeverOrg } from '../../services/leverIngest.js';
import { ingestAshbyOrg } from '../../services/ashbyIngest.js';
import { ingestWorkdayOrg } from '../../services/workdayIngest.js';
import { ingestDolLca } from '../../visa/ingest/dolLca.js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * POST /api/admin/ingest/all-ats — run the unified ATS ingest (all ATSes) optionally
 * filtered by --slugs. Body: { slugs?: string[] }. Pulls from registry baked into deploy.
 */
const allAtsSchema = z.object({
  slugs: z.array(z.string().min(1).max(80)).max(200).optional(),
});

adminRouter.post('/api/admin/ingest/all-ats', requireAdmin, async (req, res) => {
  const parsed = allAtsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    return;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const registryPath = path.resolve(here, '../../../../../packages/db/src/seeds/ats-registry.json');
  if (!existsSync(registryPath)) {
    res.status(500).json({ error: 'registry_missing', path: registryPath });
    return;
  }
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Record<string, any>;
  let entries = Object.values(registry).filter((e: any) => e && (e.slug || e.tenant));
  if (parsed.data.slugs?.length) {
    const wanted = new Set(parsed.data.slugs);
    entries = entries.filter((e: any) => wanted.has(e.slug ?? e.tenant ?? ''));
  }

  const t0 = Date.now();
  const totals = { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  const perOrg: any[] = [];
  for (const entry of entries as any[]) {
    const id = entry.slug ?? entry.tenant;
    const tEntry = Date.now();
    let r;
    try {
      r = entry.ats === 'greenhouse' && entry.slug ? await ingestGreenhouseOrg(entry.slug)
        : entry.ats === 'lever' && entry.slug      ? await ingestLeverOrg(entry.slug, entry.company)
        : entry.ats === 'ashby' && entry.slug      ? await ingestAshbyOrg(entry.slug, entry.company)
        : entry.ats === 'workday' && entry.host && entry.tenant && entry.site
            ? await ingestWorkdayOrg({ host: entry.host, tenant: entry.tenant, site: entry.site }, entry.company)
        : null;
    } catch (err: any) {
      perOrg.push({ ats: entry.ats, id, error: err.message?.slice(0, 200) });
      totals.errors++;
      continue;
    }
    if (!r) continue;
    perOrg.push({ ats: entry.ats, id, ms: Date.now() - tEntry, ...r });
    totals.fetched += r.fetched; totals.inserted += r.inserted;
    totals.updated += r.updated; totals.skipped += r.skipped; totals.errors += r.errors;
  }
  res.json({ ok: true, ms: Date.now() - t0, count: entries.length, totals, perOrg });
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

const dolSchema = z.object({
  url: z.string().url(),
  fiscalQuarter: z.string().min(2).max(20),
  dryRun: z.boolean().optional(),
  maxRows: z.number().int().positive().max(500_000).optional(),
});

adminRouter.post('/api/admin/ingest/dol', requireAdmin, async (req, res) => {
  const parsed = dolSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    return;
  }
  // This is slow (5–15 min). Railway may time out the HTTP call before it
  // finishes. The function still completes server-side and inserts data.
  const t0 = Date.now();
  try {
    const result = await ingestDolLca(parsed.data);
    res.json({ ok: true, ms: Date.now() - t0, ...result });
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
