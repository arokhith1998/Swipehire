/**
 * Visa compatibility scorer + intel fetcher.
 * Per docs/02_algorithm_v2.md §5.3 and docs/03_architecture.md §9.4.
 */

import type { Subscore, VisaIntel, WorkAuth } from '@swipehire/shared';
import { db } from '@swipehire/db';
import { sql } from 'drizzle-orm';
import { matchEmployer } from './employerMatcher.js';
import { inferSoc } from './socClassifier.js';
import type { ScoringUser, ScoringJob } from '../scoring/matcher.js';
import type { ExtractedFeatures } from '../scoring/featureExtractor.js';

interface EmployerStatsRow {
  fein: string;
  total_lcas_24mo: number;
  certified_count: number;
  denied_count: number;
  withdrawn_count: number;
  median_wage_offered: string | null;
  p25_wage_offered: string | null;
  p75_wage_offered: string | null;
  last_sponsored_at: string | null;
}

/**
 * Process-wide cache for employer_visa_stats lookups, keyed by (fein, socCode).
 * 5-minute TTL — stats only change when the DOL ingest reruns nightly. Without
 * this, scoring 150 jobs that share ~30 employers fired 600+ identical DB
 * queries and dominated feed latency (~25 sec cold load).
 */
const STATS_CACHE_TTL_MS = 5 * 60_000;
const STATS_CACHE_MAX = 2000;
const statsCache = new Map<string, { storedAt: number; row: EmployerStatsRow | null }>();
function statsCacheKey(fein: string, socCode: string | null): string {
  return `${fein}|${socCode ?? '_'}`;
}
function pruneStatsCache() {
  if (statsCache.size <= STATS_CACHE_MAX) return;
  const drop = Math.ceil(statsCache.size * 0.25);
  const oldest = [...statsCache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  for (let i = 0; i < drop; i++) statsCache.delete(oldest[i][0]);
}

/**
 * Load per-(FEIN, SOC) stats from the rollup table. Cached process-wide.
 */
async function getEmployerStats(fein: string, socCode: string | null): Promise<EmployerStatsRow | null> {
  const key = statsCacheKey(fein, socCode);
  const hit = statsCache.get(key);
  if (hit && Date.now() - hit.storedAt < STATS_CACHE_TTL_MS) return hit.row;
  try {
    const r = await db.execute(sql`
      SELECT * FROM visa.employer_visa_stats
      WHERE fein = ${fein}
        AND (soc_code = ${socCode} OR (${socCode}::text IS NULL AND soc_code IS NULL))
      LIMIT 1
    `);
    const row = (r.rows?.[0] as unknown as EmployerStatsRow | undefined) ?? null;
    statsCache.set(key, { storedAt: Date.now(), row });
    pruneStatsCache();
    return row;
  } catch {
    return null;
  }
}

/**
 * Subscore: visaCompatibility. Called by scoring/subscores/visaCompatibility.ts.
 */
export async function calculateVisaCompatibility(
  user: ScoringUser,
  job: ScoringJob,
  features: ExtractedFeatures
): Promise<Subscore> {
  const fein = features.employerFein ?? await matchEmployer(job.company);
  if (!fein) {
    // Use what we DO know from the job description.
    if (job.sponsorsVisa) {
      return {
        value: 0.65, weight: 0, confidence: 0.40,
        evidence: [`${job.company} indicates visa sponsorship in the JD (DOL records pending)`],
      };
    }
    return {
      value: 0.30, weight: 0, confidence: 0.10,
      evidence: [`No DOL records for "${job.company}" yet, and JD doesn't mention sponsorship`],
    };
  }

  const socCode = job.socCode ?? await inferSoc(job.title, job.description);
  const stats = (socCode ? await getEmployerStats(fein, socCode) : null)
    ?? await getEmployerStats(fein, null);

  if (!stats || stats.total_lcas_24mo === 0) {
    return {
      value: 0.20, weight: 0, confidence: 0.50,
      evidence: ['Employer matched but no LCA filings in last 24 months'],
    };
  }

  const recencyFactor = stats.last_sponsored_at
    ? Math.exp(-daysSince(stats.last_sponsored_at) / 365)
    : 0;
  const volumeFactor = Math.min(stats.total_lcas_24mo / 20, 1.0);
  const approvalRate = stats.certified_count / Math.max(stats.total_lcas_24mo, 1);
  const wageFactor = job.salaryMin && stats.median_wage_offered
    ? Math.min(job.salaryMin / Number(stats.median_wage_offered), 1.2) / 1.2
    : 0.5;

  const value = 0.35 * recencyFactor + 0.25 * volumeFactor + 0.25 * approvalRate + 0.15 * wageFactor;
  const confidence = Math.min(stats.total_lcas_24mo / 5, 1.0);

  return {
    value: Math.max(0, Math.min(1, value)),
    weight: 0,
    confidence,
    evidence: [
      `${stats.total_lcas_24mo} LCAs in last 24mo for SOC ${socCode ?? 'all'}`,
      `${(approvalRate * 100).toFixed(0)}% certified`,
      `Last sponsored: ${stats.last_sponsored_at ?? 'unknown'}`,
      stats.median_wage_offered ? `Median wage offered: $${Number(stats.median_wage_offered).toLocaleString()}` : 'Wage data unavailable',
    ],
  };
}

/**
 * Build the full VisaIntel payload surfaced alongside MatchResult.
 * Returns undefined when not applicable.
 */
export async function fetchVisaIntel(
  user: ScoringUser,
  job: ScoringJob,
  features: ExtractedFeatures
): Promise<VisaIntel | undefined> {
  if (!features.needsSponsorship) return undefined;

  const fein = features.employerFein ?? await matchEmployer(job.company);
  const socCode = job.socCode ?? await inferSoc(job.title, job.description);

  if (!fein) {
    // No DOL match — be useful with what we DO know from the JD itself.
    let summary: string;
    let warnings: string[];
    if (job.sponsorsVisa) {
      summary = `${job.company} indicates visa sponsorship in this posting. We don't have DOL records to verify the rate yet.`;
      warnings = [
        'Sponsorship signal comes from the job description, not yet cross-checked against DOL OFLC records.',
      ];
    } else {
      summary = `We don't yet have DOL data for "${job.company}", and this posting doesn't explicitly mention sponsorship. Confirm directly with the employer.`;
      warnings = [
        'No DOL match. Their absence here doesn\'t mean they don\'t sponsor — many do without ingest coverage.',
        'Job description doesn\'t mention visa sponsorship; check the employer\'s careers page or recruiter directly.',
      ];
    }
    return {
      fein: null, socCode,
      stats24mo: { totalLcas: 0, certified: 0, denied: 0, withdrawn: 0,
        medianWageOffered: null, p25WageOffered: null, p75WageOffered: null,
        lastSponsoredAt: null },
      certificationRate24mo: null,
      daysSinceLastSponsored: null,
      salaryMeetsPrevailingWage: null,
      prevailingWageLevelIi: null,
      roleSpecific: {
        socCode,
        totalLcas24mo: 0,
        certified: 0,
        denied: 0,
        medianWageOffered: null,
        lastSponsoredAt: null,
        found: false,
      },
      yearTotals: [],
      summary,
      warnings,
      confidence: job.sponsorsVisa ? 0.4 : 0.1,
    };
  }

  // Try SOC-specific first, fall back to per-FEIN aggregate (soc_code IS NULL).
  const socStats = socCode ? await getEmployerStats(fein, socCode) : null;
  const stats = socStats ?? await getEmployerStats(fein, null);

  // Role-specific stats (can be null if employer never filed under this SOC).
  // We always populate roleSpecific so the UI can say "no record for this SOC".
  const roleSpecific = await fetchRoleSpecificStats(fein, socCode);

  // Calendar-year totals over the last 2 years (any SOC).
  const yearTotals = await fetchYearTotals(fein);

  // Prevailing wage check
  const pw = await getPrevailingWage(socCode, job.location);

  const stats24mo = {
    totalLcas: stats?.total_lcas_24mo ?? 0,
    certified: stats?.certified_count ?? 0,
    denied: stats?.denied_count ?? 0,
    withdrawn: stats?.withdrawn_count ?? 0,
    medianWageOffered: stats?.median_wage_offered ? Number(stats.median_wage_offered) : null,
    p25WageOffered: stats?.p25_wage_offered ? Number(stats.p25_wage_offered) : null,
    p75WageOffered: stats?.p75_wage_offered ? Number(stats.p75_wage_offered) : null,
    lastSponsoredAt: stats?.last_sponsored_at ?? null,
  };
  const certRate = stats24mo.totalLcas > 0
    ? stats24mo.certified / stats24mo.totalLcas
    : null;
  const salaryMeetsPw = pw && job.salaryMin
    ? job.salaryMin >= pw
    : null;

  const summary = stats24mo.totalLcas > 0
    ? `${job.company} filed ${stats24mo.totalLcas} LCAs in the last 24 months${socCode ? ` for SOC ${socCode}` : ''}, ${(certRate! * 100).toFixed(0)}% certified.`
    : `${job.company} has no recent sponsorship in this SOC.`;

  const warnings: string[] = [];
  if (salaryMeetsPw === false && pw) {
    warnings.push(
      `Posted salary may be below prevailing wage Level II ($${pw.toLocaleString()}) for this SOC and metro. Sponsorship may not clear at this band.`
    );
  }
  if (stats24mo.lastSponsoredAt && daysSince(stats24mo.lastSponsoredAt) > 365) {
    warnings.push('Last sponsorship was over a year ago — track record is stale.');
  }

  return {
    fein,
    socCode,
    stats24mo,
    certificationRate24mo: certRate,
    daysSinceLastSponsored: stats24mo.lastSponsoredAt ? daysSince(stats24mo.lastSponsoredAt) : null,
    salaryMeetsPrevailingWage: salaryMeetsPw,
    prevailingWageLevelIi: pw,
    roleSpecific,
    yearTotals,
    summary,
    warnings,
    confidence: stats24mo.totalLcas >= 5 ? 0.9 : stats24mo.totalLcas >= 1 ? 0.5 : 0.2,
  };
}

/**
 * LCAs filed by this employer for THIS specific SOC. Distinct from stats24mo
 * which falls back to per-FEIN aggregate when the SOC doesn't match.
 *
 * The DOL XLSX stores SOCs as '15-1252.00'; our classifier returns '15-1252'.
 * The rollup normalizes to the no-suffix form, so we query with no suffix here.
 */
async function fetchRoleSpecificStats(fein: string, socCode: string | null) {
  if (!socCode) {
    return {
      socCode: null,
      totalLcas24mo: 0,
      certified: 0,
      denied: 0,
      medianWageOffered: null,
      lastSponsoredAt: null,
      found: false,
    };
  }
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE decision IN ('Certified', 'Certified - Withdrawn'))::int AS certified,
        COUNT(*) FILTER (WHERE decision = 'Denied')::int AS denied,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY wage_offered) AS median,
        MAX(decision_date) AS last
      FROM visa.lca_records
      WHERE fein = ${fein}
        AND regexp_replace(soc_code, '\\.00$', '') = ${socCode}
        AND decision_date >= NOW() - INTERVAL '24 months'
    `);
    const row = r.rows?.[0] as any;
    const total = row?.total ?? 0;
    return {
      socCode,
      totalLcas24mo: total,
      certified: row?.certified ?? 0,
      denied: row?.denied ?? 0,
      medianWageOffered: row?.median ? Number(row.median) : null,
      lastSponsoredAt: row?.last ?? null,
      found: total > 0,
    };
  } catch {
    return {
      socCode,
      totalLcas24mo: 0,
      certified: 0,
      denied: 0,
      medianWageOffered: null,
      lastSponsoredAt: null,
      found: false,
    };
  }
}

/** Calendar-year LCA totals at this employer (any SOC) for last 2 years. */
async function fetchYearTotals(fein: string): Promise<Array<{ year: number; totalLcas: number; certified: number }>> {
  try {
    const r = await db.execute(sql`
      SELECT
        EXTRACT(YEAR FROM decision_date)::int AS year,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE decision IN ('Certified', 'Certified - Withdrawn'))::int AS certified
      FROM visa.lca_records
      WHERE fein = ${fein}
        AND decision_date >= NOW() - INTERVAL '24 months'
      GROUP BY year
      ORDER BY year DESC
    `);
    return (r.rows ?? []).map((row: any) => ({
      year: row.year,
      totalLcas: row.total,
      certified: row.certified,
    }));
  } catch {
    return [];
  }
}

async function getPrevailingWage(socCode: string | null, location: string): Promise<number | null> {
  if (!socCode) return null;
  try {
    const r = await db.execute(sql`
      SELECT annual_wage::numeric AS pw FROM visa.prevailing_wages
      WHERE soc_code = ${socCode}
        AND level = 'II'
        AND area_name ILIKE ${`%${location.split(',')[0].trim()}%`}
      ORDER BY fiscal_year DESC
      LIMIT 1
    `);
    const row = r.rows?.[0] as { pw?: number } | undefined;
    return row?.pw ? Number(row.pw) : null;
  } catch {
    return null;
  }
}

function daysSince(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}
