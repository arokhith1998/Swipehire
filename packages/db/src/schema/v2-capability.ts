/**
 * Phase 1 — auto-apply capability extension.
 *
 * Adds the auto_apply_capability classification to jobs, plus the
 * saved_jobs table for "keep it" behavior on jobs we can't auto-apply to.
 *
 * Drizzle does not auto-emit ALTER TABLE for v1 column additions when v1
 * tables are defined separately. The corresponding migration SQL lives in
 * packages/db/migrations/0006_capability.sql and is applied via `pnpm db:push`.
 */

import {
  pgTable, serial, integer, text, boolean, timestamp,
  uniqueIndex, index,
} from 'drizzle-orm/pg-core';

/**
 * Canonical capability values for jobs.auto_apply_capability.
 * Derived at ingest time from ats_type + a few other signals.
 */
export const APPLY_CAPABILITIES = [
  'tier1_server',          // Greenhouse / Lever / Ashby — server queue + submit
  'tier2_assisted',        // Workday / iCIMS / SmartRecruiters — server fills, user submits
  'extension_universal',   // Custom ATS — extension generic field detection
  'manual_only',           // No supported path — show + tailor resume + open external
] as const;

export type ApplyCapability = (typeof APPLY_CAPABILITIES)[number];

/**
 * Map ATS type to default apply capability.
 * Set on every job at ingest. Re-derived nightly when ATS adapter health changes.
 */
export function deriveCapability(atsType: string | null | undefined): ApplyCapability {
  if (!atsType) return 'manual_only';
  const t = atsType.toLowerCase();
  if (['greenhouse', 'lever', 'ashby'].includes(t)) return 'tier1_server';
  if (['workday', 'icims', 'smartrecruiters', 'jobvite', 'taleo'].includes(t)) return 'tier2_assisted';
  if (['custom', 'unknown', 'generic'].includes(t)) return 'extension_universal';
  return 'extension_universal';   // sensible default — extension can try
}

/**
 * Save-for-later library. User-owned (app schema).
 * Distinct from `userJobInteractions.action='bookmark'` — `saved_jobs` is the
 * curated library for jobs we couldn't auto-apply to but the user wants to act on later.
 */
export const savedJobs = pgTable(
  'saved_jobs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    jobId: integer('job_id').notNull(),
    note: text('note'),                  // user's free-text reason
    reminderAt: timestamp('reminder_at', { withTimezone: true }),
    appliedExternally: boolean('applied_externally').default(false),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    userJobUnique: uniqueIndex('uq_saved_user_job').on(t.userId, t.jobId),
    userIdx: index('idx_saved_user').on(t.userId),
    reminderIdx: index('idx_saved_reminder').on(t.reminderAt),
  })
);

export type SavedJob = typeof savedJobs.$inferSelect;
export type InsertSavedJob = typeof savedJobs.$inferInsert;
