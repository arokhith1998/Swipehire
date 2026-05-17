/**
 * Match a job's company name to a DOL FEIN. The hardest data engineering
 * problem in the visa subsystem (per docs/03_architecture.md §9.3).
 *
 * Strategy:
 *   1. Normalize: uppercase, strip suffixes (INC, LLC, CORP, ...), strip punctuation.
 *   2. Exact match against companies.fein.
 *   3. Token Jaccard ≥ 0.8 against all known employer names (lca_records.employer_name).
 *   4. Trigram similarity (pg_trgm) for near-misses.
 *   5. Manual override table for known parent-subsidiary mappings.
 */

import { db } from '@swipehire/db';
import { sql } from 'drizzle-orm';

const SUFFIX_RE = /\b(INC|LLC|CORP|CORPORATION|COMPANY|LTD|LIMITED|CO|GROUP|HOLDINGS|PLC|PARTNERSHIP|LP|LLP)\.?\b/gi;
const PUNCT_RE = /[.,&'"]/g;

/** Manual parent-subsidiary mapping. Grow this list as edge cases surface. */
const PARENT_OVERRIDES: Record<string, string> = {
  alphabet: 'GOOGLE LLC',
  google: 'GOOGLE LLC',
  facebook: 'META PLATFORMS INC',
  meta: 'META PLATFORMS INC',
  twitter: 'X CORP',
  x: 'X CORP',
};

export function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(SUFFIX_RE, '')
    .replace(PUNCT_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Process-wide cache for company → FEIN matches. 30-minute TTL — DOL ingest is
 * nightly and company names don't change. Hot path in feed scoring (~150 jobs
 * across ~30 distinct companies fires 30 misses + 120 hits).
 */
const MATCH_CACHE_TTL_MS = 30 * 60_000;
const MATCH_CACHE_MAX = 5000;
const matchCache = new Map<string, { storedAt: number; fein: string | null }>();
function pruneMatchCache() {
  if (matchCache.size <= MATCH_CACHE_MAX) return;
  const drop = Math.ceil(matchCache.size * 0.25);
  const oldest = [...matchCache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  for (let i = 0; i < drop; i++) matchCache.delete(oldest[i][0]);
}

/**
 * Match a free-text company name to a FEIN.
 * Returns null if no high-confidence match found. Process-wide cached for 30 min.
 */
export async function matchEmployer(companyName: string): Promise<string | null> {
  if (!companyName) return null;
  const cacheKey = companyName.toLowerCase().trim();
  const hit = matchCache.get(cacheKey);
  if (hit && Date.now() - hit.storedAt < MATCH_CACHE_TTL_MS) return hit.fein;
  const fein = await matchEmployerUncached(companyName);
  matchCache.set(cacheKey, { storedAt: Date.now(), fein });
  pruneMatchCache();
  return fein;
}

async function matchEmployerUncached(companyName: string): Promise<string | null> {
  const norm = normalizeCompanyName(companyName);

  // Override check
  const lower = companyName.toLowerCase().split(/\s+/)[0];
  if (lower in PARENT_OVERRIDES) {
    const canon = PARENT_OVERRIDES[lower];
    return await feinForEmployerName(canon).catch(() => null);
  }

  // Try exact match against companies.aliases (curated). Wrapped in try/catch
  // because the `app.companies` table is part of the future schema migration
  // and may not exist yet — pre-DOL-ingest the visa subsystem returns "no data".
  try {
    const aliasMatch = await db.execute(sql`
      SELECT fein FROM app.companies
      WHERE fein IS NOT NULL
        AND (UPPER(name) = ${norm} OR ${norm} = ANY(SELECT UNNEST(aliases)))
      LIMIT 1
    `);
    const r1 = aliasMatch.rows?.[0] as { fein?: string } | undefined;
    if (r1?.fein) return r1.fein;
  } catch {
    // Table missing — fall through to lca_records lookup.
  }

  // Try trigram similarity against lca_records (live data).
  try {
    const trgm = await db.execute(sql`
      SELECT fein, employer_name, similarity(employer_name, ${norm}) AS sim
      FROM visa.lca_records
      WHERE employer_name % ${norm}        -- pg_trgm index hit
      ORDER BY sim DESC
      LIMIT 5
    `);
    const top = trgm.rows?.[0] as { fein?: string; sim?: number } | undefined;
    if (top?.fein && (top.sim ?? 0) >= 0.7) {
      return top.fein;
    }
  } catch {
    // Table or extension missing — return null so the visa scorer reports "no data".
  }

  return null;
}

async function feinForEmployerName(employerName: string): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT fein FROM visa.lca_records
    WHERE employer_name = ${employerName}
    LIMIT 1
  `);
  return (r.rows?.[0] as any)?.fein ?? null;
}
