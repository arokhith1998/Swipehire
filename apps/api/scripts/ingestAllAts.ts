/**
 * Unified ingester: iterate the discovered ATS registry and pull jobs
 * from Greenhouse / Lever / Ashby for every entry. Used for the daily
 * refresh + initial backfill after discovery.
 *
 * Usage:
 *   pnpm --filter @swipehire/api ingest:all-ats [--limit=N] [--ats=greenhouse|lever|ashby]
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ingestOrg as ingestGreenhouseOrg } from '../src/services/greenhouseIngest.js';
import { ingestLeverOrg } from '../src/services/leverIngest.js';
import { ingestAshbyOrg } from '../src/services/ashbyIngest.js';
import { ingestWorkdayOrg } from '../src/services/workdayIngest.js';

const here = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(here, '../../../packages/db/src/seeds/ats-registry.json');

interface RegistryEntry {
  company: string;
  ats: 'greenhouse' | 'lever' | 'ashby' | 'workday';
  slug?: string;                    // greenhouse/lever/ashby
  host?: string;                    // workday: e.g. 'nvidia.wd5.myworkdayjobs.com'
  tenant?: string;                  // workday
  site?: string;                    // workday
  fein?: string;
  totalLcas24mo?: number;
  discoveredAt: string;
}

async function main() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error(`Registry not found at ${REGISTRY_PATH}. Run 'pnpm discover:ats' first.`);
    process.exit(1);
  }

  const registry: Record<string, RegistryEntry> = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  let entries = Object.values(registry);

  const atsFilter = process.argv.find(a => a.startsWith('--ats='));
  if (atsFilter) {
    const ats = atsFilter.slice(6) as RegistryEntry['ats'];
    entries = entries.filter(e => e.ats === ats);
  }
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  if (limitArg) entries = entries.slice(0, parseInt(limitArg.slice(8), 10));

  // Sort by LCA volume desc — biggest sponsors first.
  entries.sort((a, b) => (b.totalLcas24mo ?? 0) - (a.totalLcas24mo ?? 0));

  console.log(`Ingesting ${entries.length} ATS-registered orgs (${atsFilter ?? 'all ATS'}).`);

  const totals = { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  let i = 0;
  for (const entry of entries) {
    i++;
    const t0 = Date.now();
    let r;
    try {
      if (entry.ats === 'greenhouse' && entry.slug) r = await ingestGreenhouseOrg(entry.slug);
      else if (entry.ats === 'lever' && entry.slug) r = await ingestLeverOrg(entry.slug, entry.company);
      else if (entry.ats === 'ashby' && entry.slug) r = await ingestAshbyOrg(entry.slug, entry.company);
      else if (entry.ats === 'workday' && entry.host && entry.tenant && entry.site) {
        r = await ingestWorkdayOrg({ host: entry.host, tenant: entry.tenant, site: entry.site }, entry.company);
      } else continue;
    } catch (err: any) {
      console.warn(`  [${i}/${entries.length}] ✗ ${entry.ats}/${entry.slug ?? entry.tenant}: ${err.message?.slice(0, 80)}`);
      totals.errors++;
      continue;
    }
    const ms = Date.now() - t0;
    const id = entry.slug ?? `${entry.tenant}/${entry.site}`;
    if (r.fetched > 0 || r.errors > 0) {
      console.log(
        `  [${i}/${entries.length}] ${entry.ats}/${id} (${entry.company.slice(0, 40)}): ` +
        `fetched=${r.fetched} +${r.inserted} ~${r.updated} skip=${r.skipped} err=${r.errors} (${ms}ms)`
      );
    }
    totals.fetched += r.fetched;
    totals.inserted += r.inserted;
    totals.updated += r.updated;
    totals.skipped += r.skipped;
    totals.errors += r.errors;
  }
  console.log('\n=== Totals ===');
  console.log(totals);
  process.exit(0);
}

main().catch(e => { console.error('ingest failed:', e); process.exit(1); });
