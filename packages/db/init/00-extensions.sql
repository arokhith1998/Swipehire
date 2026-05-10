-- Run automatically on first Postgres container start (docker-entrypoint-initdb.d).
-- Required extensions for SwipeHire v2.

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- for gen_random_uuid + column-level encryption
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- for trigram similarity (employer name fuzzy match)
CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector — required for skill embeddings
CREATE EXTENSION IF NOT EXISTS btree_gin;     -- composite GIN indexes
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- query performance observability

-- Logical schemas (Data Contract: user-owned vs system-owned)
CREATE SCHEMA IF NOT EXISTS app;     -- user-owned: profile, applications, outcomes
CREATE SCHEMA IF NOT EXISTS visa;    -- system-owned: DOL/USCIS public data
CREATE SCHEMA IF NOT EXISTS ml;      -- system-owned: taxonomies, models, calibration
CREATE SCHEMA IF NOT EXISTS ops;     -- system-owned: liveness, ingest state, telemetry
CREATE SCHEMA IF NOT EXISTS audit;   -- system-owned: score decisions, export logs

COMMENT ON SCHEMA app IS 'User-owned data. Migrations require user-notification.';
COMMENT ON SCHEMA visa IS 'System-owned. Rebuildable from public DOL/USCIS sources.';
COMMENT ON SCHEMA ml IS 'System-owned. Rebuildable from accumulated outcomes.';
COMMENT ON SCHEMA ops IS 'System-owned. Rolling-window operational state.';
COMMENT ON SCHEMA audit IS 'System-owned. 90-day retention for compliance/debug.';
