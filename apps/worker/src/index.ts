/**
 * SwipeHire worker — BullMQ consumer for long-running and Playwright tasks.
 *
 * Queues:
 *   - liveness         : check job URLs for expiration (Playwright, sequential per worker)
 *   - dol-ingest       : quarterly DOL OFLC LCA ingest
 *   - employer-match   : run after DOL ingest to match new employers to companies
 *   - apply-tier1      : Greenhouse/Lever/Ashby auto-submit
 *   - apply-tier2      : Workday/iCIMS/SmartRecruiters assisted
 *   - calibration      : weekly retrain trigger
 *   - employer-stats   : nightly rollup of visa.employer_visa_stats
 */

import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import cron from 'node-cron';
import { pino } from 'pino';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },
});

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const concurrency = parseInt(process.env.WORKER_CONCURRENCY ?? '2', 10);

// ---------------------------------------------------------------------
// Liveness queue — sequential within a process (Playwright rule)
// ---------------------------------------------------------------------
new Worker('liveness', async (job: Job) => {
  log.info({ jobId: job.id, data: job.data }, 'liveness check');
  // Lazy import to avoid loading playwright on workers that don't need it
  const { checkLiveness } = await import('../../api/src/authenticity/livenessChecker.js');
  const { db, schema } = await import('@swipehire/db');
  const result = await checkLiveness(job.data.url);
  await db.insert(schema.jobLivenessChecks).values({
    jobId: job.data.jobId,
    httpStatus: result.httpStatus,
    isLive: result.result === 'active',
    reason: result.reason,
    contentLength: result.contentLength,
    finalUrl: result.finalUrl,
    parserVersion: 'liveness-v1.0.0',
    durationMs: result.durationMs,
  });
  return result;
}, { connection, concurrency: 1 });   // SEQUENTIAL — career-ops rule

// ---------------------------------------------------------------------
// DOL ingest queue
// ---------------------------------------------------------------------
new Worker('dol-ingest', async (job: Job) => {
  log.info({ jobId: job.id, data: job.data }, 'DOL ingest');
  const { ingestDolLca } = await import('../../api/src/visa/ingest/dolLca.js');
  // Job payload must include { url, fiscalQuarter } — see ingestDolLca().
  return await ingestDolLca({
    url: job.data.url,
    fiscalQuarter: job.data.fiscalQuarter,
    dryRun: job.data.dryRun,
    maxRows: job.data.maxRows,
  });
}, { connection, concurrency: 1 });

// ---------------------------------------------------------------------
// Apply queue
// ---------------------------------------------------------------------
new Worker('apply-tier1', async (job: Job) => {
  log.info({ jobId: job.id }, 'tier-1 apply');
  const { applyForUser } = await import('../../api/src/applier/orchestrator.js');
  return await applyForUser(job.data.context, job.data.plan ?? 'free');
}, { connection, concurrency: 1 });

// ---------------------------------------------------------------------
// Calibration retrain — weekly trigger
// ---------------------------------------------------------------------
new Worker('calibration', async (job: Job) => {
  log.info({ jobId: job.id }, 'calibration retrain trigger');
  // TODO(v2.1): pull last 7d of score_outcomes, send to /calibrate-retrain.
  return { triggered: true };
}, { connection, concurrency: 1 });

// ---------------------------------------------------------------------
// Greenhouse ingest — fetches public boards and upserts into jobs table
// ---------------------------------------------------------------------
new Worker('greenhouse-ingest', async (job: Job) => {
  log.info({ jobId: job.id, data: job.data }, 'greenhouse ingest');
  const { ingestAllOrgs, GREENHOUSE_ORGS } = await import('../../api/src/services/greenhouseIngest.js');
  const orgs = (job.data?.orgs as string[]) ?? GREENHOUSE_ORGS;
  return await ingestAllOrgs(orgs);
}, { connection, concurrency: 1 });

// ---------------------------------------------------------------------
// All-ATS ingest queue — iterates the discovered registry across
// Greenhouse / Lever / Ashby. Replaces the older Greenhouse-only flow.
// ---------------------------------------------------------------------
new Worker('ats-ingest', async (job: Job) => {
  log.info({ jobId: job.id, data: job.data }, 'all-ATS ingest');
  const { readFileSync, existsSync } = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const registryPath = path.resolve(here, '../../../packages/db/src/seeds/ats-registry.json');
  if (!existsSync(registryPath)) {
    log.warn('ats-registry.json not found; skipping');
    return { skipped: true };
  }
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Record<string, any>;
  const entries = Object.values(registry) as Array<{ company: string; ats: string; slug: string }>;

  const { ingestOrg: ingestGh } = await import('../../api/src/services/greenhouseIngest.js');
  const { ingestLeverOrg } = await import('../../api/src/services/leverIngest.js');
  const { ingestAshbyOrg } = await import('../../api/src/services/ashbyIngest.js');

  const totals = { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  for (const entry of entries) {
    try {
      const r = entry.ats === 'greenhouse' ? await ingestGh(entry.slug)
              : entry.ats === 'lever'      ? await ingestLeverOrg(entry.slug, entry.company)
              : entry.ats === 'ashby'      ? await ingestAshbyOrg(entry.slug, entry.company)
              : null;
      if (!r) continue;
      totals.fetched += r.fetched; totals.inserted += r.inserted;
      totals.updated += r.updated; totals.skipped += r.skipped; totals.errors += r.errors;
    } catch (err: any) {
      log.warn({ org: `${entry.ats}/${entry.slug}`, err: err.message }, 'ats ingest error');
      totals.errors++;
    }
  }
  log.info({ totals }, 'ats-ingest complete');
  return totals;
}, { connection, concurrency: 1 });

// ---------------------------------------------------------------------
// Cron schedules — enqueue periodic work
// ---------------------------------------------------------------------
const livenessIntervalH = parseInt(process.env.LIVENESS_CHECK_INTERVAL_HOURS ?? '24', 10);
cron.schedule(`0 */${livenessIntervalH} * * *`, async () => {
  log.info('Cron: enqueueing liveness checks');
  // TODO: query jobs with stale liveness + enqueue them
});

cron.schedule('0 3 * * 0', async () => {  // Sundays 3am
  log.info('Cron: enqueueing weekly calibration retrain');
  // TODO: enqueue
});

// Daily 4am — refresh ALL configured ATS boards (Greenhouse + Lever + Ashby).
cron.schedule('0 4 * * *', async () => {
  log.info('Cron: enqueueing daily all-ATS ingest');
  const { Queue } = await import('bullmq');
  const q = new Queue('ats-ingest', { connection });
  await q.add('daily', {});
  await q.close();
});

log.info({ concurrency }, '✅ SwipeHire worker started — listening on queues');

process.on('SIGTERM', async () => {
  log.info('SIGTERM — closing browsers');
  const { closeBrowser } = await import('../../api/src/authenticity/livenessChecker.js');
  await closeBrowser();
  process.exit(0);
});
