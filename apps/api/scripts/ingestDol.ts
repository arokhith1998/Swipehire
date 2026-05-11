/**
 * One-shot CLI: ingest a DOL OFLC LCA disclosure XLSX into Neon.
 *
 * Usage (from workspace root):
 *   pnpm --filter @swipehire/api ingest:dol [URL] [QUARTER] [--dry-run] [--max=NNN]
 *
 * Defaults to the most recent FY2026 Q1 file at the time of writing.
 * The DOL convention: https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY{YYYY}_Q{N}.xlsx
 *
 * The CLI uses whatever DATABASE_URL is set — set it to your Neon URL to
 * populate prod, or leave the local one to test against docker-compose Postgres.
 *
 * Memory: the FY2026 Q1 file is ~150 MB. Use --max=50000 for a fast first run.
 */
import { ingestDolLca } from '../src/visa/ingest/dolLca.js';

function parseArgs(argv: string[]) {
  const out: { url?: string; quarter?: string; dryRun: boolean; maxRows?: number } = {
    dryRun: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--max=')) out.maxRows = parseInt(a.slice(6), 10);
    else if (a.startsWith('http')) out.url = a;
    else if (a.startsWith('FY') || /^Q[1-4]$/.test(a) || /^[\dQ]+$/.test(a)) {
      // crude quarter detection; user can pass things like 'FY2026Q1' or 'FY26Q1'
      out.quarter = a;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.url ?? 'https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2026_Q1.xlsx';
  const quarter = args.quarter ?? 'FY2026Q1';

  console.log(`URL:      ${url}`);
  console.log(`Quarter:  ${quarter}`);
  console.log(`Dry run:  ${args.dryRun}`);
  console.log(`Max rows: ${args.maxRows ?? '(no limit)'}`);
  console.log('');
  console.log('Downloading + parsing — this takes 5–15 minutes for full files...');

  try {
    const result = await ingestDolLca({
      url,
      fiscalQuarter: quarter,
      dryRun: args.dryRun,
      maxRows: args.maxRows,
    });
    console.log('\n=== Result ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Ingest failed:', err.message ?? err);
    process.exit(1);
  }
}

main();
