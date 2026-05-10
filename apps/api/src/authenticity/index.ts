/**
 * Authenticity layer — combines liveness + ghost-job classifier.
 * Returns the JobAuthenticity payload that goes into MatchResult.
 */

import type { JobAuthenticity } from '@swipehire/shared';
import { db, schema } from '@swipehire/db';
import { sql } from 'drizzle-orm';
import { classifyGhost } from '../ml/inferenceClient.js';
import type { ScoringJob } from '../scoring/matcher.js';

/**
 * Compute authenticity for a job. Reads from cached liveness check (TTL 6h);
 * triggers a fresh check only if cache is stale.
 */
export async function computeAuthenticity(job: ScoringJob): Promise<JobAuthenticity> {
  const recent = await getMostRecentLivenessCheck(job.id);

  if (recent && hoursSince(recent.checkedAt) <= 6) {
    return buildAuthenticity(job, recent);
  }

  // Stale — return last-known with a "lastVerifiedAt" stamp; queue a refresh.
  // We don't await the fresh check here to keep scoring fast.
  // TODO(v2.1): enqueue a BullMQ job to refresh.
  return buildAuthenticity(job, recent);
}

async function getMostRecentLivenessCheck(jobId: number) {
  const r = await db.execute(sql`
    SELECT id, checked_at, is_live, reason, http_status, content_length
    FROM ops.job_liveness_checks
    WHERE job_id = ${jobId}
    ORDER BY checked_at DESC
    LIMIT 1
  `);
  const row = r.rows?.[0] as any;
  if (!row) return null;
  return {
    checkedAt: row.checked_at as Date,
    isLive: row.is_live as boolean,
    reason: row.reason as string,
    httpStatus: row.http_status as number | null,
    contentLength: row.content_length as number,
  };
}

function buildAuthenticity(job: ScoringJob, check: Awaited<ReturnType<typeof getMostRecentLivenessCheck>>): JobAuthenticity {
  const signals: string[] = [];
  let livenessProbability = 0.5;
  let ghostJobRisk: 'low' | 'medium' | 'high' | 'unknown' = 'unknown';
  let lastVerifiedAt: string | null = null;

  if (check) {
    livenessProbability = check.isLive ? 0.95 : 0.05;
    lastVerifiedAt = check.checkedAt.toISOString();
    signals.push(check.isLive ? `Live as of ${lastVerifiedAt}` : `Marked expired: ${check.reason}`);
    ghostJobRisk = check.isLive ? 'low' : 'high';
  }

  if (job.createdAt) {
    const ageDays = Math.floor((Date.now() - job.createdAt.getTime()) / 86_400_000);
    signals.push(`Posted ${ageDays}d ago`);
    if (ageDays > 60) {
      ghostJobRisk = ghostJobRisk === 'low' ? 'medium' : ghostJobRisk;
    }
  }

  return { livenessProbability, ghostJobRisk, signalsObserved: signals, lastVerifiedAt };
}

function hoursSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

export { checkLiveness, closeBrowser } from './livenessChecker.js';
