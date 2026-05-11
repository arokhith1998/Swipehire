/**
 * DOL OFLC LCA disclosure data ingest.
 *
 * Source: https://www.dol.gov/agencies/eta/foreign-labor/performance
 * Cadence: quarterly. File format: XLSX, 100–500 MB, ~250k rows per quarter.
 *
 * Run via:
 *   POST /api/admin/ingest/dol  { url, fiscalQuarter, dryRun? }
 *
 * The worker process should run this — it's slow (5–15 min) and memory-hungry
 * on the parsing step. The api can also call it directly for small/test files.
 *
 * After ingest, runs the employer_visa_stats rollup so the visa subsystem has
 * fast per-employer lookups.
 */

import { db, schema } from '@swipehire/db';
import { sql } from 'drizzle-orm';
import { request } from 'undici';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export interface DolIngestOptions {
  url: string;                       // direct URL to the .xlsx file
  fiscalQuarter: string;             // 'FY26Q1' label for tracking
  dryRun?: boolean;
  /** Limit rows ingested for testing. */
  maxRows?: number;
}

export interface DolIngestResult {
  rowsParsed: number;
  rowsInserted: number;
  rowsSkipped: number;
  uniqueEmployers: number;
  employerStatsUpserted: number;
  durationMs: number;
}

export async function ingestDolLca(options: DolIngestOptions): Promise<DolIngestResult> {
  const t0 = Date.now();
  const runId = await startRun(options.fiscalQuarter);

  try {
    const tmpFile = path.join(tmpdir(), `lca_${options.fiscalQuarter}_${Date.now()}.xlsx`);
    console.log(`[dolLca] downloading ${options.url} → ${tmpFile}`);
    await downloadFile(options.url, tmpFile);

    console.log(`[dolLca] parsing XLSX...`);
    const records = await parseXlsx(tmpFile, options.maxRows);
    console.log(`[dolLca] parsed ${records.length} rows`);

    if (options.dryRun) {
      await endRun(runId, 'success', records.length, 0);
      return {
        rowsParsed: records.length,
        rowsInserted: 0,
        rowsSkipped: 0,
        uniqueEmployers: countDistinct(records, r => r.fein),
        employerStatsUpserted: 0,
        durationMs: Date.now() - t0,
      };
    }

    let inserted = 0, skipped = 0;
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      try {
        await db.insert(schema.lcaRecords).values(chunk).onConflictDoNothing();
        inserted += chunk.length;
      } catch (err) {
        skipped += chunk.length;
        console.warn(`[dolLca] chunk ${i} failed:`, (err as any).message?.slice(0, 200));
      }
    }
    console.log(`[dolLca] inserted ${inserted} rows (skipped ${skipped})`);

    console.log(`[dolLca] rolling up employer_visa_stats...`);
    const statsCount = await rollupEmployerStats();
    console.log(`[dolLca] upserted stats for ${statsCount} (employer, soc) groups`);

    await endRun(runId, 'success', inserted, skipped);
    return {
      rowsParsed: records.length,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      uniqueEmployers: countDistinct(records, r => r.fein),
      employerStatsUpserted: statsCount,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    await endRun(runId, 'failure', 0, 0, err.message?.slice(0, 500) ?? String(err));
    throw err;
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  // DOL.gov rejects requests without a real-looking User-Agent (403 otherwise).
  const { body, statusCode } = await request(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SwipeHireBot/2.0; +https://swipehire.io)',
      'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
    },
  });
  if (statusCode >= 400) throw new Error(`HTTP ${statusCode} fetching ${url}`);
  await pipeline(body as any, createWriteStream(dest));
}

/**
 * Parse OFLC LCA XLSX via exceljs streaming reader.
 * Avoids the V8 ~512MB string limit that breaks workbook.xlsx.readFile() on
 * large files. Iterates rows without holding the full sheet in memory.
 */
async function parseXlsx(filePath: string, maxRows?: number): Promise<any[]> {
  const ExcelJSMod = await import('exceljs');
  const ExcelJS: any = (ExcelJSMod as any).default ?? ExcelJSMod;
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',     // cache to disk, don't keep in memory
    hyperlinks: 'ignore',
    worksheets: 'emit',
    styles: 'cache',
  });

  let cols: Record<string, number | null> = {};
  let headersFound = false;
  const records: any[] = [];
  let rowsSeen = 0;
  const cap = maxRows ?? Infinity;

  // Required header detection — match against the FY23+ schema.
  const need = (headers: Record<string, number>, variants: string[]): number | null => {
    for (const v of variants) if (headers[v] != null) return headers[v];
    return null;
  };

  for await (const worksheetReader of reader as any) {
    for await (const row of worksheetReader) {
      // Row indices in exceljs streaming: row.number (1-based)
      if (row.number === 1) {
        const headers: Record<string, number> = {};
        row.eachCell({ includeEmpty: false }, (cell: any, col: number) => {
          const v = String(cell.value ?? '').toUpperCase().trim();
          headers[v] = col;
        });
        cols = {
          fein: need(headers, ['EMPLOYER_FEIN', 'FEIN']),
          employer_name: need(headers, ['EMPLOYER_NAME']),
          soc_code: need(headers, ['SOC_CODE']),
          job_title: need(headers, ['JOB_TITLE']),
          visa_class: need(headers, ['VISA_CLASS']),
          case_status: need(headers, ['CASE_STATUS']),
          decision_date: need(headers, ['DECISION_DATE']),
          begin_date: need(headers, ['BEGIN_DATE', 'EMPLOYMENT_START_DATE']),
          end_date: need(headers, ['END_DATE', 'EMPLOYMENT_END_DATE']),
          wage_from: need(headers, ['WAGE_RATE_OF_PAY_FROM_1', 'WAGE_RATE_OF_PAY_FROM']),
          wage_unit: need(headers, ['WAGE_UNIT_OF_PAY_1', 'WAGE_UNIT_OF_PAY']),
          pw: need(headers, ['PREVAILING_WAGE_1', 'PREVAILING_WAGE']),
          pw_level: need(headers, ['PW_WAGE_LEVEL_1', 'PW_LEVEL_1', 'PW_LEVEL']),
          worksite_city: need(headers, ['WORKSITE_CITY_1', 'WORKSITE_CITY']),
          worksite_state: need(headers, ['WORKSITE_STATE_1', 'WORKSITE_STATE']),
          worksite_postal: need(headers, ['WORKSITE_POSTAL_CODE_1', 'WORKSITE_POSTAL_CODE']),
        };
        if (cols.fein == null || cols.employer_name == null || cols.soc_code == null || cols.case_status == null) {
          throw new Error(
            'XLSX missing required columns. Found: ' + Object.keys(headers).slice(0, 30).join(', ') + '...'
          );
        }
        headersFound = true;
        continue;
      }
      if (!headersFound) continue;
      if (records.length >= cap) break;

      const get = (c: number | null) => c == null ? null : cellValue(row.getCell(c));
      const fein = String(get(cols.fein) ?? '').trim();
      const employerName = String(get(cols.employer_name) ?? '').trim();
      rowsSeen++;
      if (!fein || !employerName) continue;

      const annualWage = annualizeWage(get(cols.wage_from), get(cols.wage_unit));
      const annualPw = annualizeWage(get(cols.pw), get(cols.wage_unit));

      records.push({
        fein,
        employerName,
        socCode: String(get(cols.soc_code) ?? '').trim(),
        jobTitle: get(cols.job_title) ? String(get(cols.job_title)).trim() : null,
        visaClass: get(cols.visa_class) ? String(get(cols.visa_class)).trim() : null,
        decision: String(get(cols.case_status) ?? 'Unknown').trim(),
        decisionDate: parseDate(get(cols.decision_date)),
        employmentStartDate: parseDate(get(cols.begin_date)),
        employmentEndDate: parseDate(get(cols.end_date)),
        wageOffered: annualWage as any,
        wageUnit: 'Year',
        prevailingWage: annualPw as any,
        pwLevel: get(cols.pw_level) ? String(get(cols.pw_level)).trim() : null,
        worksiteCity: get(cols.worksite_city) ? String(get(cols.worksite_city)).trim() : null,
        worksiteState: get(cols.worksite_state) ? String(get(cols.worksite_state)).trim() : null,
        worksitePostalCode: get(cols.worksite_postal) ? String(get(cols.worksite_postal)).trim() : null,
      });

      if (rowsSeen % 10000 === 0) {
        console.log(`[dolLca] parsed ${rowsSeen} rows so far (${records.length} valid)`);
      }
    }
    if (records.length >= cap) break;
  }
  return records;
}

function cellValue(cell: any): any {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'object' && 'result' in v) return v.result;          // formula
  if (typeof v === 'object' && 'text' in v) return v.text;              // rich text
  return v;
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Convert hourly/weekly/etc. wages to annual. */
function annualizeWage(wage: any, unit: any): number | null {
  if (!wage) return null;
  const n = parseFloat(String(wage).replace(/[$,]/g, ''));
  if (!isFinite(n) || n <= 0) return null;
  const u = String(unit ?? 'year').toLowerCase();
  if (u.startsWith('hour')) return Math.round(n * 2080);
  if (u.startsWith('week')) return Math.round(n * 52);
  if (u.startsWith('bi-week') || u.startsWith('biweek')) return Math.round(n * 26);
  if (u.startsWith('month')) return Math.round(n * 12);
  return Math.round(n);
}

/**
 * Rollup raw lca_records into employer_visa_stats per (fein, soc_code).
 * The visa subsystem reads from this table; without it, lookups would
 * scan millions of rows.
 */
async function rollupEmployerStats(): Promise<number> {
  // Wipe + re-derive. Rollup is purely a function of lca_records.
  await db.execute(sql`TRUNCATE TABLE visa.employer_visa_stats RESTART IDENTITY`);

  // Per-(FEIN, SOC) rollup. Normalize SOC by stripping the '.00' suffix DOL
  // emits — our matcher (and most other sources) use the bare 6-digit form.
  const r1 = await db.execute(sql`
    INSERT INTO visa.employer_visa_stats (fein, soc_code, visa_class,
      total_lcas_24mo, certified_count, denied_count, withdrawn_count,
      median_wage_offered, p25_wage_offered, p75_wage_offered, last_sponsored_at)
    SELECT
      fein,
      regexp_replace(soc_code, '\.00$', '') AS soc_code,
      COALESCE(MAX(visa_class), 'H-1B') AS visa_class,
      COUNT(*)::int AS total_lcas_24mo,
      COUNT(*) FILTER (WHERE decision IN ('Certified', 'Certified - Withdrawn'))::int AS certified_count,
      COUNT(*) FILTER (WHERE decision = 'Denied')::int AS denied_count,
      COUNT(*) FILTER (WHERE decision = 'Withdrawn')::int AS withdrawn_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY wage_offered) AS median_wage_offered,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY wage_offered) AS p25_wage_offered,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY wage_offered) AS p75_wage_offered,
      MAX(decision_date) AS last_sponsored_at
    FROM visa.lca_records
    WHERE decision_date >= NOW() - INTERVAL '24 months'
      AND fein IS NOT NULL
      AND soc_code IS NOT NULL
    GROUP BY fein, regexp_replace(soc_code, '\.00$', '')
  `);

  // Per-FEIN aggregate (soc_code = NULL). The visa subsystem falls back to this
  // when the inferred SOC doesn't match any of the employer's filed SOCs —
  // common because companies file under a few SOCs but post jobs under many.
  const r2 = await db.execute(sql`
    INSERT INTO visa.employer_visa_stats (fein, soc_code, visa_class,
      total_lcas_24mo, certified_count, denied_count, withdrawn_count,
      median_wage_offered, p25_wage_offered, p75_wage_offered, last_sponsored_at)
    SELECT
      fein,
      NULL AS soc_code,
      COALESCE(MAX(visa_class), 'H-1B') AS visa_class,
      COUNT(*)::int AS total_lcas_24mo,
      COUNT(*) FILTER (WHERE decision IN ('Certified', 'Certified - Withdrawn'))::int AS certified_count,
      COUNT(*) FILTER (WHERE decision = 'Denied')::int AS denied_count,
      COUNT(*) FILTER (WHERE decision = 'Withdrawn')::int AS withdrawn_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY wage_offered) AS median_wage_offered,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY wage_offered) AS p25_wage_offered,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY wage_offered) AS p75_wage_offered,
      MAX(decision_date) AS last_sponsored_at
    FROM visa.lca_records
    WHERE decision_date >= NOW() - INTERVAL '24 months'
      AND fein IS NOT NULL
    GROUP BY fein
  `);

  return (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
}

function countDistinct<T>(arr: T[], key: (x: T) => any): number {
  return new Set(arr.map(key)).size;
}

async function startRun(quarter: string): Promise<number> {
  const r = await db.insert(schema.ingestionRuns).values({
    source: 'dol_lca',
    sourceRef: quarter,
    status: 'running',
  }).returning({ id: schema.ingestionRuns.id });
  return r[0].id;
}

async function endRun(
  id: number,
  status: 'success' | 'failure' | 'partial',
  rowsIngested: number,
  rowsSkipped: number,
  error?: string
): Promise<void> {
  await db.update(schema.ingestionRuns)
    .set({
      status,
      rowsIngested,
      rowsSkipped,
      error,
      endedAt: new Date(),
    })
    .where(sql`id = ${id}`);
}
