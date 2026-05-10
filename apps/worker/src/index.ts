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
  return await ingestDolLca({ fiscalQuarter: job.data.fiscalQuarter });
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

// Daily 4am — refresh Greenhouse boards.
cron.schedule('0 4 * * *', async () => {
  log.info('Cron: enqueueing daily Greenhouse ingest');
  const { Queue } = await import('bullmq');
  const q = new Queue('greenhouse-ingest', { connection });
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
