/**
 * Applier orchestrator — routes apply jobs to the right adapter, tracks
 * health metrics, enforces daily caps.
 */

import type { ApplyContext, ApplyResult, AtsAdapter } from './types.js';
import { greenhouseAdapter } from './adapters/greenhouseAdapter.js';
import { db, schema } from '@swipehire/db';
import { sql } from 'drizzle-orm';

const ADAPTERS: Record<string, AtsAdapter> = {
  greenhouse: greenhouseAdapter,
  // lever, ashby coming in Phase 1
  // workday, icims, smartrecruiters in Phase 2
};

const DAILY_CAPS: Record<'free' | 'paid', number> = { free: 10, paid: 50 };
const HOURLY_CAP = 5;

export async function applyForUser(ctx: ApplyContext, plan: 'free' | 'paid' = 'free'): Promise<ApplyResult> {
  const adapter = ADAPTERS[ctx.ats.toLowerCase()];
  if (!adapter) {
    return {
      status: 'requires_human',
      reason: `No adapter for ATS "${ctx.ats}" — Tier 3 fallback (deep-link + clipboard)`,
      durationMs: 0,
      filledFields: [],
      unansweredQuestions: [],
    };
  }

  // Throttle check
  const used = await usageInWindow(ctx.userId);
  if (used.daily >= DAILY_CAPS[plan]) {
    return {
      status: 'failed',
      reason: `Daily cap reached (${DAILY_CAPS[plan]} on ${plan} plan)`,
      durationMs: 0, filledFields: [], unansweredQuestions: [],
    };
  }
  if (used.hourly >= HOURLY_CAP) {
    return {
      status: 'failed',
      reason: `Hourly cap reached (${HOURLY_CAP})`,
      durationMs: 0, filledFields: [], unansweredQuestions: [],
    };
  }

  const result = await adapter.apply(ctx);

  // Record health metric
  await recordOutcome(ctx.ats, adapter.tier, result);

  return result;
}

async function usageInWindow(userId: number): Promise<{ daily: number; hourly: number }> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE applied_at > NOW() - INTERVAL '24 hours') AS daily,
      COUNT(*) FILTER (WHERE applied_at > NOW() - INTERVAL '1 hour') AS hourly
    FROM app.applications WHERE user_id = ${userId}
  `);
  const row = r.rows?.[0] as any;
  return { daily: Number(row?.daily ?? 0), hourly: Number(row?.hourly ?? 0) };
}

async function recordOutcome(ats: string, tier: 1 | 2 | 3, result: ApplyResult): Promise<void> {
  // Per-window aggregates are computed nightly. Here we just append to the raw log
  // (TODO: dedicated apply_attempts table for per-attempt detail).
  await db.execute(sql`
    INSERT INTO ops.ats_health_metrics (ats_type, tier, window_start, window_end, attempted, succeeded, failed, requires_human, avg_duration_ms)
    VALUES (
      ${ats}, ${tier},
      date_trunc('hour', NOW()), date_trunc('hour', NOW()) + INTERVAL '1 hour',
      1,
      ${result.status === 'success' ? 1 : 0},
      ${result.status === 'failed' ? 1 : 0},
      ${result.status === 'requires_human' ? 1 : 0},
      ${result.durationMs}
    )
    ON CONFLICT DO NOTHING  -- aggregates are recomputed nightly anyway
  `);
}
