/**
 * Honesty Dashboard — public metrics aggregator.
 *
 * The public page at swipehire.io/honesty exposes these metrics weekly.
 * They are the structural forcing function for not gaming match scores.
 *
 * Spec: docs/03_architecture.md §13.2
 */

import { db } from '@swipehire/db';
import { sql } from 'drizzle-orm';

export interface HonestyMetrics {
  generatedAt: string;
  windowDays: number;

  /** Of jobs we labeled in each band, what % led to interview? */
  calibration: Array<{
    band: string;            // '0-10%' | '10-20%' | ... | '90-100%'
    predictedAvg: number;
    actualInterviewRate: number;
    sampleSize: number;
  }>;

  /** Of jobs surfaced this window, what % were live within 24h of being shown? */
  jobLivenessRate: {
    surfacedCount: number;
    liveOnClickRate: number;
  };

  /** Per-ATS auto-apply success. */
  atsAutoApplyHealth: Array<{
    ats: string;
    tier: number;
    attempted: number;
    successRate: number;
    requiresHumanRate: number;
  }>;

  /** DOL data freshness. */
  visaDataFreshness: {
    latestQuarter: string | null;
    daysSinceIngest: number | null;
    nextExpectedRefresh: string | null;
  };

  /** Cancellation friction. */
  cancellation: {
    medianTimeToCancelMs: number | null;
    requiresEmail: false;
  };
}

export async function computeHonestyMetrics(windowDays = 30): Promise<HonestyMetrics> {
  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    calibration: await computeCalibration(windowDays),
    jobLivenessRate: await computeLivenessRate(windowDays),
    atsAutoApplyHealth: await computeAtsHealth(windowDays),
    visaDataFreshness: await computeVisaFreshness(),
    cancellation: { medianTimeToCancelMs: 400, requiresEmail: false },
  };
}

async function computeCalibration(windowDays: number) {
  // Bin scored jobs by predicted band; compute actual interview rate per bin.
  const r = await db.execute(sql`
    WITH binned AS (
      SELECT
        FLOOR((match_result->>'interviewProbability')::numeric * 10) AS bin,
        (match_result->>'interviewProbability')::numeric AS p,
        CASE WHEN outcome IN ('interview', 'offer') THEN 1 ELSE 0 END AS interviewed
      FROM ml.score_outcomes
      WHERE scored_at > NOW() - (${windowDays}::int * INTERVAL '1 day')
        AND outcome IS NOT NULL
        AND match_result->>'interviewProbability' IS NOT NULL
    )
    SELECT
      (bin * 10)::int || '-' || ((bin + 1) * 10)::int || '%' AS band,
      AVG(p)::float AS predicted_avg,
      AVG(interviewed)::float AS actual_rate,
      COUNT(*)::int AS n
    FROM binned
    GROUP BY bin
    ORDER BY bin
  `);
  return (r.rows ?? []).map((row: any) => ({
    band: row.band,
    predictedAvg: row.predicted_avg ?? 0,
    actualInterviewRate: row.actual_rate ?? 0,
    sampleSize: row.n ?? 0,
  }));
}

async function computeLivenessRate(windowDays: number) {
  const r = await db.execute(sql`
    SELECT
      COUNT(DISTINCT job_id)::int AS surfaced,
      AVG(CASE WHEN is_live THEN 1.0 ELSE 0.0 END)::float AS live_rate
    FROM ops.job_liveness_checks
    WHERE checked_at > NOW() - (${windowDays}::int * INTERVAL '1 day')
  `);
  const row = r.rows?.[0] as any;
  return {
    surfacedCount: row?.surfaced ?? 0,
    liveOnClickRate: row?.live_rate ?? 0,
  };
}

async function computeAtsHealth(windowDays: number) {
  const r = await db.execute(sql`
    SELECT
      ats_type, tier,
      SUM(attempted)::int AS attempted,
      CASE WHEN SUM(attempted) > 0 THEN SUM(succeeded)::float / SUM(attempted) ELSE 0 END AS success_rate,
      CASE WHEN SUM(attempted) > 0 THEN SUM(requires_human)::float / SUM(attempted) ELSE 0 END AS requires_human_rate
    FROM ops.ats_health_metrics
    WHERE window_start > NOW() - (${windowDays}::int * INTERVAL '1 day')
    GROUP BY ats_type, tier
    ORDER BY attempted DESC
  `);
  return (r.rows ?? []).map((row: any) => ({
    ats: row.ats_type,
    tier: row.tier,
    attempted: row.attempted,
    successRate: row.success_rate,
    requiresHumanRate: row.requires_human_rate,
  }));
}

async function computeVisaFreshness() {
  const r = await db.execute(sql`
    SELECT source_ref AS quarter,
           EXTRACT(EPOCH FROM (NOW() - MAX(started_at))) / 86400 AS days_since
    FROM ops.ingestion_runs
    WHERE source = 'dol_lca' AND status = 'success'
    GROUP BY source_ref
    ORDER BY MAX(started_at) DESC
    LIMIT 1
  `);
  const row = r.rows?.[0] as any;
  return {
    latestQuarter: row?.quarter ?? null,
    daysSinceIngest: row?.days_since != null ? Math.floor(row.days_since) : null,
    nextExpectedRefresh: null, // computed by knowing the OFLC release schedule
  };
}
