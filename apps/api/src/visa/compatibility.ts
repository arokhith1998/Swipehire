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
 * Load per-(FEIN, SOC) stats from the rollup table.
 */
async function getEmployerStats(fein: string, socCode: string | null): Promise<EmployerStatsRow | null> {
  try {
    const r = await db.execute(sql`
      SELECT * FROM visa.employer_visa_stats
      WHERE fein = ${fein}
        AND (soc_code = ${socCode} OR (${socCode}::text IS NULL AND soc_code IS NULL))
      LIMIT 1
    `);
    return (r.rows?.[0] as unknown as EmployerStatsRow | undefined) ?? null;
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
    return {
      value: 0.30, weight: 0, confidence: 0.10,
      evidence: [`Employer "${job.company}" not yet matched in DOL records`],
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
    return {
      fein: null, socCode,
      stats24mo: { totalLcas: 0, certified: 0, denied: 0, withdrawn: 0,
        medianWageOffered: null, p25WageOffered: null, p75WageOffered: null,
        lastSponsoredAt: null },
      certificationRate24mo: null,
      daysSinceLastSponsored: null,
      salaryMeetsPrevailingWage: null,
      prevailingWageLevelIi: null,
      summary: `We don't yet have DOL data for "${job.company}". Sponsorship history unknown.`,
      warnings: ['Employer not matched in our DOL ingestion. Their absence does not mean they don\'t sponsor.'],
      confidence: 0.1,
    };
  }

  const stats = (socCode ? await getEmployerStats(fein, socCode) : null)
    ?? await getEmployerStats(fein, null);

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
    summary,
    warnings,
    confidence: stats24mo.totalLcas >= 5 ? 0.9 : stats24mo.totalLcas >= 1 ? 0.5 : 0.2,
  };
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
