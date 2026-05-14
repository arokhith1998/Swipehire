/**
 * SwipeHire worker — node-cron only. No Redis, no BullMQ.
 *
 * Why: BullMQ Workers each held a long-running blocking Redis call
 *   (~1 cmd/sec idle each), which on Upstash burned ~430k commands/day
 *   for nothing useful. We don't need retries, dead-letter queues, or
 *   distributed workers — the only real workload is a daily ATS ingest.
 *
 * What runs:
 *   - Daily 04:00 UTC: iterate ats-registry.json and pull jobs from
 *     Greenhouse / Lever / Ashby / Workday inline.
 *
 * Future work that previously implied Redis (liveness checks, tier-1
 * apply, calibration retrain) can be re-added as additional cron jobs
 * or moved to a Postgres-backed queue (pg-boss) if real concurrency
 * becomes necessary.
 */

import 'dotenv/config';
import cron from 'node-cron';
import { pino } from 'pino';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },
});

async function runAtsIngest() {
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
  const entries = Object.values(registry) as Array<{
    company: string; ats: string; slug?: string;
    host?: string; tenant?: string; site?: string;
  }>;

  const { ingestOrg: ingestGh } = await import('../../api/src/services/greenhouseIngest.js');
  const { ingestLeverOrg } = await import('../../api/src/services/leverIngest.js');
  const { ingestAshbyOrg } = await import('../../api/src/services/ashbyIngest.js');
  const { ingestWorkdayOrg } = await import('../../api/src/services/workdayIngest.js');

  const totals = { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  for (const entry of entries) {
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
}

// Daily 04:00 UTC
cron.schedule('0 4 * * *', () => {
  log.info('Cron: starting daily all-ATS ingest');
  runAtsIngest().catch((err) => log.error({ err: err.message }, 'ats-ingest failed'));
});

// Run once on boot if RUN_ON_BOOT=true (handy for manual kicks via Railway redeploy)
if ((process.env.RUN_ON_BOOT ?? '').toLowerCase() === 'true') {
  log.info('RUN_ON_BOOT=true — running ATS ingest immediately');
  runAtsIngest().catch((err) => log.error({ err: err.message }, 'boot ingest failed'));
}

log.info('SwipeHire worker started — node-cron mode (no Redis). Daily ATS ingest at 04:00 UTC.');

process.on('SIGTERM', () => {
  log.info('SIGTERM — exiting');
  process.exit(0);
});
