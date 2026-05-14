/**
 * SwipeHire worker — BullMQ consumer for long-running and Playwright tasks.
 *
 * IMPORTANT — Redis cost notes:
 *   Each Worker(...) maintains a long-running blocking call (BLMOVE/BZPOPMIN)
 *   plus periodic stalled-job checks. Per BullMQ docs that's roughly 1 cmd/sec
 *   when idle, plus the lock-renewal on active jobs. Five idle workers cost
 *   ~430k commands/day on Upstash for nothing.
 *
 *   So: every Worker is gated behind an env flag. Default is to run ONLY
 *   `ats-ingest` (the daily ingest cron). Flip flags ON when you actually
 *   start using a queue.
 *
 *   To enable a queue, set the corresponding env var to "true":
 *     ENABLE_LIVENESS_WORKER=true
 *     ENABLE_DOL_WORKER=true
 *     ENABLE_APPLY_WORKER=true
 *     ENABLE_CALIBRATION_WORKER=true
 *     ENABLE_GREENHOUSE_WORKER=true   (legacy; ats-ingest covers it)
 *     ENABLE_ATS_INGEST_WORKER=true   (default ON)
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

/** Env-flag check. Empty/missing → false unless `defaultOn` is true. */
function enabled(envName: string, defaultOn = false): boolean {
  const v = process.env[envName];
  if (v == null || v === '') return defaultOn;
  return v.toLowerCase() === 'true' || v === '1';
}

const enabledQueues: string[] = [];

// ---------------------------------------------------------------------
// Liveness queue — sequential within a process (Playwright rule)
// ---------------------------------------------------------------------
if (enabled('ENABLE_LIVENESS_WORKER')) {
  enabledQueues.push('liveness');
  new Worker('liveness', async (job: Job) => {
    log.info({ jobId: job.id, data: job.data }, 'liveness check');
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
  }, { connection, concurrency: 1 });
}

// ---------------------------------------------------------------------
// DOL ingest queue — disabled by default (use the CLI directly)
// ---------------------------------------------------------------------
if (enabled('ENABLE_DOL_WORKER')) {
  enabledQueues.push('dol-ingest');
  new Worker('dol-ingest', async (job: Job) => {
    log.info({ jobId: job.id, data: job.data }, 'DOL ingest');
    const { ingestDolLca } = await import('../../api/src/visa/ingest/dolLca.js');
    return await ingestDolLca({
      url: job.data.url,
      fiscalQuarter: job.data.fiscalQuarter,
      dryRun: job.data.dryRun,
      maxRows: job.data.maxRows,
    });
  }, { connection, concurrency: 1 });
}

// ---------------------------------------------------------------------
// Apply queue — disabled until Tier-1 auto-submit ships
// ---------------------------------------------------------------------
if (enabled('ENABLE_APPLY_WORKER')) {
  enabledQueues.push('apply-tier1');
  new Worker('apply-tier1', async (job: Job) => {
    log.info({ jobId: job.id }, 'tier-1 apply');
    const { applyForUser } = await import('../../api/src/applier/orchestrator.js');
    return await applyForUser(job.data.context, job.data.plan ?? 'free');
  }, { connection, concurrency: 1 });
}

// ---------------------------------------------------------------------
// Calibration retrain — weekly trigger; off until score_outcomes has volume
// ---------------------------------------------------------------------
if (enabled('ENABLE_CALIBRATION_WORKER')) {
  enabledQueues.push('calibration');
  new Worker('calibration', async (job: Job) => {
    log.info({ jobId: job.id }, 'calibration retrain trigger');
    return { triggered: true };
  }, { connection, concurrency: 1 });
}

// ---------------------------------------------------------------------
// Greenhouse-only ingest (legacy) — replaced by ats-ingest. OFF by default.
// ---------------------------------------------------------------------
if (enabled('ENABLE_GREENHOUSE_WORKER')) {
  enabledQueues.push('greenhouse-ingest');
  new Worker('greenhouse-ingest', async (job: Job) => {
    log.info({ jobId: job.id, data: job.data }, 'greenhouse ingest');
    const { ingestAllOrgs, GREENHOUSE_ORGS } = await import('../../api/src/services/greenhouseIngest.js');
    const orgs = (job.data?.orgs as string[]) ?? GREENHOUSE_ORGS;
    return await ingestAllOrgs(orgs);
  }, { connection, concurrency: 1 });
}

// ---------------------------------------------------------------------
// All-ATS ingest queue — default ON; the only worker we actually use
// ---------------------------------------------------------------------
if (enabled('ENABLE_ATS_INGEST_WORKER', /* defaultOn */ true)) {
  enabledQueues.push('ats-ingest');
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
    const { ingestWorkdayOrg } = await import('../../api/src/services/workdayIngest.js');

    const totals = { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
    for (const entry of entries as any[]) {
      try {
        const r = entry.ats === 'greenhouse' && entry.slug ? await ingestGh(entry.slug)
                : entry.ats === 'lever' && entry.slug      ? await ingestLeverOrg(entry.slug, entry.company)
                : entry.ats === 'ashby' && entry.slug      ? await ingestAshbyOrg(entry.slug, entry.company)
                : entry.ats === 'workday' && entry.host && entry.tenant && entry.site
                    ? await ingestWorkdayOrg({ host: entry.host, tenant: entry.tenant, site: entry.site }, entry.company)
                : null;
        if (!r) continue;
        totals.fetched += r.fetched; totals.inserted += r.inserted;
        totals.updated += r.updated; totals.skipped += r.skipped; totals.errors += r.errors;
      } catch (err: any) {
        log.warn({ org: `${entry.ats}/${entry.slug ?? entry.tenant}`, err: err.message }, 'ats ingest error');
        totals.errors++;
      }
    }
    log.info({ totals }, 'ats-ingest complete');
    return totals;
  }, { connection, concurrency: 1 });
}

// ---------------------------------------------------------------------
// Cron schedules — only registered for queues that are enabled
// ---------------------------------------------------------------------
if (enabled('ENABLE_LIVENESS_WORKER')) {
  const livenessIntervalH = parseInt(process.env.LIVENESS_CHECK_INTERVAL_HOURS ?? '24', 10);
  cron.schedule(`0 */${livenessIntervalH} * * *`, async () => {
    log.info('Cron: enqueueing liveness checks');
    // TODO: query jobs with stale liveness + enqueue them
  });
}

if (enabled('ENABLE_CALIBRATION_WORKER')) {
  cron.schedule('0 3 * * 0', async () => {  // Sundays 3am
    log.info('Cron: enqueueing weekly calibration retrain');
    // TODO: enqueue
  });
}

if (enabled('ENABLE_ATS_INGEST_WORKER', true)) {
  cron.schedule('0 4 * * *', async () => {     // Daily 04:00
    log.info('Cron: enqueueing daily all-ATS ingest');
    const { Queue } = await import('bullmq');
    const q = new Queue('ats-ingest', { connection });
    await q.add('daily', {});
    await q.close();
  });
}

log.info({ concurrency, enabledQueues }, '✅ SwipeHire worker started — listening on queues');

process.on('SIGTERM', async () => {
  log.info('SIGTERM — closing resources');
  if (enabled('ENABLE_LIVENESS_WORKER')) {
    const { closeBrowser } = await import('../../api/src/authenticity/livenessChecker.js');
    await closeBrowser();
  }
  process.exit(0);
});
