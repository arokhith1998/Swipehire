/**
 * One-shot CLI: ingest jobs from all configured Greenhouse public boards.
 *
 * Usage:
 *   pnpm --filter @swipehire/api ingest:greenhouse           # all orgs
 *   pnpm --filter @swipehire/api ingest:greenhouse anthropic openai   # specific orgs
 *
 * Run from the workspace root with --env-file or pnpm picks up .env via
 * the script's --env-file flag.
 */
import { ingestAllOrgs, GREENHOUSE_ORGS } from '../src/services/greenhouseIngest.js';

async function main() {
  const argOrgs = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const orgs = argOrgs.length > 0 ? argOrgs : GREENHOUSE_ORGS;
  console.log(`Ingesting Greenhouse boards: ${orgs.join(', ')}`);

  const results = await ingestAllOrgs(orgs);
  const totals = results.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      inserted: acc.inserted + r.inserted,
      updated: acc.updated + r.updated,
      skipped: acc.skipped + r.skipped,
      errors: acc.errors + r.errors,
    }),
    { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 }
  );
  console.log('\n=== Totals ===');
  console.log(totals);
  process.exit(totals.errors > orgs.length / 2 ? 1 : 0);
}

main().catch(err => {
  console.error('Ingest failed:', err);
  process.exit(1);
});
