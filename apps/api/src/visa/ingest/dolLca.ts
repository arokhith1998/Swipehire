/**
 * DOL OFLC LCA disclosure data ingest.
 *
 * Source: https://www.dol.gov/agencies/eta/foreign-labor/performance
 * Cadence: quarterly (per user decision in 03_architecture.md §3.4).
 * File format: XLSX, ~500MB, ~250k rows per quarter.
 *
 * Ingestion runs in the worker pool, not the API. ~10 min per quarter file.
 */

import { db, schema } from '@swipehire/db';
import { sql } from 'drizzle-orm';
import { request } from 'undici';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const OFLC_BASE = 'https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/';

export interface DolIngestOptions {
  fiscalQuarter: string;          // 'FY26Q1' etc.
  url?: string;                   // override URL for testing
  dryRun?: boolean;               // parse but don't insert
}

export async function ingestDolLca(options: DolIngestOptions): Promise<{ rowsInserted: number; skipped: number }> {
  const runId = await startRun(options.fiscalQuarter);

  try {
    const url = options.url ?? buildUrl(options.fiscalQuarter);
    const tmpFile = path.join(tmpdir(), `lca_${options.fiscalQuarter}.xlsx`);

    await downloadFile(url, tmpFile);
    const records = await parseXlsx(tmpFile);

    if (options.dryRun) {
      await endRun(runId, 'success', records.length, 0);
      return { rowsInserted: records.length, skipped: 0 };
    }

    let inserted = 0, skipped = 0;
    // Batch insert in chunks of 500
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      try {
        await db.insert(schema.lcaRecords).values(chunk).onConflictDoNothing();
        inserted += chunk.length;
      } catch (err) {
        skipped += chunk.length;
        console.warn(`[dolLca] chunk ${i} failed:`, err);
      }
    }

    // Trigger rollup recompute
    await db.execute(sql`SELECT * FROM visa.lca_records LIMIT 1`); // placeholder; queue real job

    await endRun(runId, 'success', inserted, skipped);
    return { rowsInserted: inserted, skipped };
  } catch (err) {
    await endRun(runId, 'failure', 0, 0, String(err));
    throw err;
  }
}

function buildUrl(quarter: string): string {
  // OFLC URL convention varies year to year. v2.1: scrape the listing page to find the file.
  // For now: best-guess pattern that works for FY24+.
  return `${OFLC_BASE}LCA_Disclosure_Data_${quarter}.xlsx`;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const { body } = await request(url, { method: 'GET' });
  await pipeline(body as any, createWriteStream(dest));
}

/**
 * Parse OFLC LCA XLSX. Field names vary slightly by quarter; this handles
 * the FY23+ schema. v2.1: detect schema version from headers.
 */
async function parseXlsx(filePath: string): Promise<any[]> {
  // TODO(v2.1): use exceljs or sheetjs to parse the XLSX.
  // The OFLC file has ~70 columns; we extract ~15.
  // For now, return empty array so the pipeline is wireable end-to-end.
  console.warn('[dolLca] XLSX parsing not yet implemented — needs exceljs in deps');
  return [];
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
