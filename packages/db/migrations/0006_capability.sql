-- Phase 1 — auto-apply capability classification + saved-jobs library.
-- Applied via `pnpm db:push` (Drizzle handles the diff).

-- Add the capability column to jobs (nullable; derived nightly from ats_type)
ALTER TABLE app.jobs
  ADD COLUMN IF NOT EXISTS auto_apply_capability TEXT;

-- Reuse on recruiter-side jobs as well (always tier1_server since we own the form)
ALTER TABLE app.recruiter_jobs
  ADD COLUMN IF NOT EXISTS auto_apply_capability TEXT DEFAULT 'tier1_server';

-- Index for the "Apply-ready only" filter on the feed
CREATE INDEX IF NOT EXISTS idx_jobs_capability
  ON app.jobs (auto_apply_capability)
  WHERE auto_apply_capability IS NOT NULL;

-- Backfill existing rows from ats_type
UPDATE app.jobs
SET auto_apply_capability = CASE
  WHEN ats_type IN ('greenhouse', 'lever', 'ashby') THEN 'tier1_server'
  WHEN ats_type IN ('workday', 'icims', 'smartrecruiters', 'jobvite', 'taleo') THEN 'tier2_assisted'
  WHEN ats_type IN ('custom', 'unknown', 'generic') THEN 'extension_universal'
  WHEN ats_type IS NOT NULL THEN 'extension_universal'
  ELSE 'manual_only'
END
WHERE auto_apply_capability IS NULL;

-- Saved-for-later library (user-owned)
CREATE TABLE IF NOT EXISTS app.saved_jobs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES app.jobs(id) ON DELETE CASCADE,
  note TEXT,
  reminder_at TIMESTAMPTZ,
  applied_externally BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_user ON app.saved_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_reminder ON app.saved_jobs (reminder_at)
  WHERE reminder_at IS NOT NULL;
