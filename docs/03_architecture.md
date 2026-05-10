# SwipeHire Architecture & Tech Stack

**Author:** Adhithya + Claude
**Date:** May 2026
**Status:** Implementation blueprint — supersedes the Replit prototype's ad-hoc structure
**Companion docs:** `01_strategy.md`, `02_algorithm_v2.md`

---

## Reading guide

- §1–2: the high-level architecture and the explicit principles it serves.
- §3: the locked tech stack, with reasons for each choice and the v1 reuse plan.
- §4–5: the data model and the user/system separation (Data Contract pattern, borrowed from career-ops).
- §6: the service topology and how each piece talks to the others.
- §7–11: the five subsystems — ingestion, scoring, tailoring, auto-apply, recruiter SaaS — each with file layout, contracts, and dependencies.
- §12: observability and the public Honesty Dashboard.
- §13: security, privacy, and compliance (visa data is regulated-adjacent; we treat it carefully).
- §14: the migration plan from the current Replit deploy to v2 without downtime.

---

## 1. Architectural goals

These are the non-negotiables, derived from the strategy and v2 algorithm docs and the patterns we are inheriting from career-ops.

**Honesty over engagement.** The system displays calibrated probabilities with confidence intervals and refuses to claim a score below a data threshold (`Insufficient data`). No internal optimization may degrade calibration in exchange for engagement.

**Quality over quantity.** The user's time and the recruiter's time are both finite. The system actively discourages applying to weak fits (the career-ops 4.0/5 threshold pattern). Auto-apply is tiered, gated, and never blind.

**Human-in-the-loop, always.** No application is submitted without explicit per-job approval. No resume goes out without being shown to the user first. Auto-apply means "auto-fill, queue for one-tap review," not "send and forget."

**User data is sacrosanct.** Career-ops's Data Contract pattern: user data and system data are separated by file and storage. System updates never touch user data. Resume content, profile, application history, and outcome data belong to the user and are exportable in one click.

**Visa intelligence is a first-class subsystem.** Not a column on the jobs table. A separate service with its own ingestion, normalization, scoring, and surfacing.

**Composable, additive evolution.** The existing Replit code (Express + Drizzle + React + Vite) is not thrown away. v2 adds new services and tables behind feature flags, with v1 code running alongside until v2 wins on a measurable metric.

**Self-correcting through observability.** Every score, ingestion run, and auto-apply attempt emits structured telemetry. The public Honesty Dashboard exposes the metrics that matter (calibration error, liveness rate, auto-apply success per ATS) — making honesty the load-bearing wall.

---

## 2. The high-level picture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            CLIENT LAYER                                    │
│   ┌────────────────────┐                       ┌────────────────────┐    │
│   │ Candidate Web App  │                       │ Recruiter Web App  │    │
│   │  React + Vite      │                       │  React + Vite      │    │
│   │  (existing v1)     │                       │  (existing v1)     │    │
│   └─────────┬──────────┘                       └─────────┬──────────┘    │
│             │                                            │               │
│   ┌─────────┴──────────┐                       ┌─────────┴──────────┐    │
│   │ Browser Extension  │                       │ Recruiter Embed    │    │
│   │ (Playwright bridge,│                       │ (Greenhouse/Lever  │    │
│   │  Phase 2)          │                       │  iframe, Phase 3)  │    │
│   └─────────┬──────────┘                       └─────────┬──────────┘    │
└─────────────┼────────────────────────────────────────────┼───────────────┘
              │                                            │
              ▼                                            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY (Express)                             │
│   Auth, rate limit, request shaping. Existing routes.ts → split into      │
│   feature modules. Adds /v2/* routes with feature flag.                   │
└─────────┬─────────────────────┬──────────────────────────┬────────────────┘
          │                     │                          │
          ▼                     ▼                          ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
│ Core Services    │  │ ML Sidecar       │  │ Worker Pool              │
│ (Node/TS)        │  │ (Python FastAPI) │  │ (Node + Playwright)      │
│                  │  │                  │  │                          │
│ • scoring/       │  │ • embeddings.py  │  │ • livenessChecker        │
│ • visa/          │  │ • calibrator.py  │  │ • atsAutoApply (per-ATS) │
│ • tailoring/     │  │ • ghost_clf.py   │  │ • dolIngest              │
│ • authenticity/  │  │ • style_fp.py    │  │ • jobAggregator          │
│ • recruiter/     │  │ • soc_clf.py     │  │ • employerMatcher        │
└────────┬─────────┘  └────────┬─────────┘  └──────────────┬───────────┘
         │                     │                            │
         └─────────────────────┼────────────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────────┐
        │                  DATA LAYER                       │
        │   PostgreSQL 16 + pgvector + Drizzle ORM         │
        │   ├── application schema (users, jobs, ...)      │
        │   ├── visa schema (lca_records, employer_stats)  │
        │   ├── ml schema (skill_taxonomy, calibration)    │
        │   └── ops schema (liveness_checks, telemetry)    │
        │                                                  │
        │   Object storage: S3-compatible (resumes, PDFs)  │
        │   Queue: BullMQ on Redis (jobs, ingest, apply)   │
        │   Cache: Redis (geocoding, ATS lookups)          │
        └──────────────────────────────────────────────────┘
```

Two new boundaries appear in v2: a Python FastAPI sidecar for ML, and a worker pool of Node processes that run Playwright (liveness, auto-apply) and long-running ingestion jobs.

---

## 3. Locked tech stack

The stack respects two constraints: keep the Replit v1 code productive (Node/Express/React/Vite/Drizzle/Postgres) and add only what's needed for v2.

### 3.1 Languages and frameworks

| Layer | Choice | Why this, not the alternative |
|-------|--------|------------------------------|
| Backend (API + business logic) | **Node 22 + Express 4 + TypeScript 5.6** | v1 is already here. ESM module boundaries are clean. Express has the smallest learning surface for the candidate codebase. |
| Database | **PostgreSQL 16 (Neon serverless)** | v1 is on Neon. Single-DB approach simplifies ops. pgvector extension covers our vector needs through 100k+ skill embeddings. |
| ORM | **Drizzle 0.39** | v1 uses it. Type-safe, TS-native, plays well with Zod schemas already in `shared/schema.ts`. |
| ML serving | **Python 3.12 + FastAPI 0.115 + sentence-transformers + scikit-learn** | Per your decision. Self-hosted `bge-large-en-v1.5` runs cleanly under sentence-transformers. sklearn isotonic + bootstrap is mature. |
| Vector index | **pgvector 0.8 (HNSW index)** | Single DB. Migrate to a dedicated store only when query latency p95 > 200ms or vector count > 5M. |
| Cache + queue | **Redis 7 + BullMQ 5** | BullMQ is the de-facto Node job queue. Redis is needed anyway for sessions (currently in-memory) and geocode caching. |
| Browser automation | **Playwright 1.49** | What career-ops uses. The existing `check-liveness.mjs` is directly portable. Stable selectors via accessibility tree. |
| Frontend | **React 18 + Vite 5 + Tailwind + shadcn/ui + Wouter + TanStack Query** | v1 exactly. No reason to change. |
| Auth | **Passport (local + Google) + express-session + connect-pg-simple** | v1 has Passport + memorystore today. Switching session store from memory → Postgres (`connect-pg-simple`, already in deps) is a 5-line change. |
| Object storage | **Cloudflare R2 (S3-compatible)** | Resumes, generated PDFs. R2 has zero egress fees, which matters when recruiters download. |
| Telemetry | **OpenTelemetry → Honeycomb (or Grafana Cloud free tier for MVP)** | Structured traces for the ingest → score → match flow. |
| Frontend monitoring | **Sentry** | Already industry-standard. Free tier sufficient through MVP. |
| CI/CD | **GitHub Actions + Vercel (frontend) + Fly.io (backend) + Neon (DB)** | Matches the existing Replit deploy mental model. Fly.io supports the Python sidecar in the same private network. |

### 3.2 Why self-hosted bge-large for embeddings (your choice, with the deployment plan)

You picked self-host over OpenAI. The plan:

- **Inference target:** Fly.io GPU machine (`a10` class) when traffic warrants, else CPU `performance-cpu-2x`.
- **Initial deploy:** CPU. `bge-large-en-v1.5` runs at ~80–150ms per encoding on CPU at batch size 1. Acceptable for skill embeddings (one-time per resume, one-time per JD; cached afterward).
- **Quantization:** `optimum-onnxruntime` int8 quantization brings the model from 1.3GB → ~340MB and 1.5–2× CPU speedup with negligible quality loss for skill matching.
- **Caching:** Every skill embedding lives in `skill_taxonomy.embedding`. We embed each canonical skill once. JD-specific embeddings (full JD text) are cached by content hash for 30 days.
- **Fallback:** If the sidecar is down, a small in-process TS embedder using `@xenova/transformers` (ONNX in WASM) provides degraded service. ~10× slower but keeps the system online.

### 3.3 Why FastAPI sidecar over inline Python

You chose the sidecar. The contract:

- HTTP only (no shared memory, no protobuf — keep it simple). JSON in, JSON out.
- One container, two endpoints initially: `POST /embed` and `POST /score`. Grows to `/classify-ghost`, `/classify-soc`, `/check-style`, `/calibrate-batch` as features land.
- Deployed alongside the Node API on Fly.io's private network. p99 latency target ≤ 30ms for embeddings (cached) / ≤ 250ms for inference.
- Health check at `/healthz` returning loaded-model versions and warmup status.
- Versioned models stored in R2; the sidecar lazy-loads on startup.

### 3.4 What we don't add

- **No microservices proliferation.** The Node API is a modular monolith. Functional folders (`scoring/`, `visa/`, `tailoring/`, etc.) instead of network boundaries until traffic demands it.
- **No GraphQL.** REST + Zod schemas reuse the v1 contract pattern. Less ceremony.
- **No Kubernetes.** Fly.io handles container orchestration with one config file. We earn the right to K8s only when Fly.io is the bottleneck.
- **No web framework rewrite.** No Next.js, no Remix. v1 uses Vite SPA + Express; that stays.
- **No vendor lock for AI.** Inference is behind one interface (`InferenceClient`). Today bge-large via FastAPI; tomorrow Cohere/Voyage/Together if economics shift.

---

## 4. Data model

The schema evolution is **purely additive** so v1 keeps running unchanged. Existing tables get nullable columns; new tables stand alone. The full DDL is in `02_algorithm_v2.md §10.1` — this section organizes it into logical domains.

### 4.1 Domain map

```
schema: app                            schema: visa
├── users                              ├── lca_records           (DOL OFLC)
├── companies                          ├── uscis_petitions       (USCIS Hub)
├── jobs                               ├── employer_visa_stats   (rollup)
├── recruiter_jobs                     └── prevailing_wages
├── recruiter_applications
├── candidate_shortlists               schema: ml
├── user_job_interactions              ├── skill_taxonomy        (canonical + embedding)
├── applications                       ├── role_families         (taxonomy)
└── job_digests                        ├── soc_codes             (BLS reference)
                                       ├── score_outcomes        (calibration data)
                                       ├── calibration_models    (versioned isotonic models)
                                       └── ghost_classifier_models

schema: ops                            schema: audit
├── job_liveness_checks                ├── score_decisions       (every score, with explanation)
├── ats_health_metrics                 ├── ingestion_runs
├── ingestion_state                    └── data_export_log       (GDPR-style)
├── playwright_runs
└── telemetry_events
```

Five schemas, one database. Cross-schema joins are fine (Postgres is happy). Logical separation makes it obvious which migrations are "user data" vs "system data" — see §5.

### 4.2 Critical additions to existing tables

These are the columns that unlock v2 capabilities. All nullable; v1 reads ignore them.

**`app.users`** — extended for richer work auth and richer profile signal.
```sql
ALTER TABLE users ADD COLUMN work_auth_v2 JSONB;   -- richer than visaStatus enum (see §10.2)
ALTER TABLE users ADD COLUMN cip_code TEXT;        -- for STEM-OPT eligibility check
ALTER TABLE users ADD COLUMN target_socs TEXT[];   -- canonical SOC codes user is targeting
ALTER TABLE users ADD COLUMN target_role_families TEXT[];
ALTER TABLE users ADD COLUMN linkedin_url TEXT;
ALTER TABLE users ADD COLUMN github_url TEXT;
ALTER TABLE users ADD COLUMN portfolio_url TEXT;
ALTER TABLE users ADD COLUMN proof_points JSONB;   -- borrowed from career-ops article-digest pattern
ALTER TABLE users ADD COLUMN onboarding_depth INT DEFAULT 0;  -- 0–5, see §11.4
```

**`app.jobs`** — extended for authenticity, ATS provenance, and SOC/role-family normalization.
```sql
ALTER TABLE jobs ADD COLUMN soc_code TEXT;
ALTER TABLE jobs ADD COLUMN role_family_id INT REFERENCES ml.role_families(id);
ALTER TABLE jobs ADD COLUMN canonical_url TEXT;
ALTER TABLE jobs ADD COLUMN ats_type TEXT;           -- 'greenhouse'|'lever'|'ashby'|'workday'|'icims'|'smartrecruiters'|'custom'
ALTER TABLE jobs ADD COLUMN ats_external_id TEXT;
ALTER TABLE jobs ADD COLUMN first_seen_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN last_seen_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN expired_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN ghost_risk TEXT;         -- 'low'|'medium'|'high'|'unknown'
ALTER TABLE jobs ADD COLUMN liveness_probability NUMERIC(4,3);
ALTER TABLE jobs ADD COLUMN raw_match_features JSONB; -- precomputed for fast rescoring
ALTER TABLE jobs ADD COLUMN canonical_hash TEXT;     -- for dedup across sources
CREATE INDEX idx_jobs_canonical_hash ON jobs(canonical_hash);
CREATE INDEX idx_jobs_role_family ON jobs(role_family_id);
CREATE INDEX idx_jobs_ats_external ON jobs(ats_type, ats_external_id);
```

**`app.companies`** — extended for FEIN matching to DOL data.
```sql
ALTER TABLE companies ADD COLUMN fein TEXT;
ALTER TABLE companies ADD COLUMN aliases TEXT[];     -- known DBA/legal name variants
ALTER TABLE companies ADD COLUMN sponsorship_summary JSONB;  -- precomputed rollup
ALTER TABLE companies ADD COLUMN last_sponsored_at DATE;
CREATE UNIQUE INDEX idx_companies_fein ON companies(fein) WHERE fein IS NOT NULL;
```

**`app.user_job_interactions`** — extended to store the full MatchResult at decision time. This is the source for outcome-driven calibration.
```sql
ALTER TABLE user_job_interactions ADD COLUMN match_result JSONB;
ALTER TABLE user_job_interactions ADD COLUMN model_version TEXT;
```

**`app.applications`** — extended to track outcomes for calibration.
```sql
ALTER TABLE applications ADD COLUMN outcome TEXT;            -- 'no_response'|'screen'|'interview'|'offer'|'rejected'
ALTER TABLE applications ADD COLUMN outcome_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN outcome_source TEXT;     -- 'user_reported'|'recruiter_action'|'inferred'
ALTER TABLE applications ADD COLUMN tailored_resume_url TEXT;
ALTER TABLE applications ADD COLUMN ats_application_id TEXT; -- for matching back to recruiter ATS
```

### 4.3 New tables (visa, ml, ops, audit schemas)

Defined in `02_algorithm_v2.md §10.1`. Highlights:

- `visa.lca_records` — partitioned by fiscal_quarter for fast aggregation. Indexed on `(fein, soc_code)` and `(employer_name)`.
- `visa.employer_visa_stats` — denormalized rollup. Recomputed nightly. Read by every score request.
- `ml.skill_taxonomy` — pgvector HNSW index. ~5,000 rows initial, grows with corpus.
- `ml.score_outcomes` — append-only. Source for calibration retraining.
- `ops.job_liveness_checks` — append-only. Source for ghost-job classifier features.
- `audit.score_decisions` — append-only, retained 90 days. Every scored job-user pair, with full explanation. Used for the Honesty Dashboard and for debugging "why did I see this?"

### 4.4 Indexes and performance

The dominant query is "score N jobs for user U." We optimize for this:

- `jobs.raw_match_features` JSONB has GIN index on the keys we filter on (`soc_code`, `role_family_id`, `location_metro`).
- `companies.fein` is the foreign key for visa lookups; covered by index.
- `users` has GIN index on `target_socs` and `target_role_families` for fast "show me users targeting this role" recruiter queries.
- pgvector HNSW with `(m=16, ef_construction=64)` on `skill_taxonomy.embedding`. Sub-10ms cosine at 5k vectors.
- Materialized view `mv_job_scoring_features` joins jobs + companies + visa.employer_visa_stats. Refreshed every 15 min.

### 4.5 Migration strategy

Five Drizzle migrations, deployed in this order:

1. `0001_v2_schemas.sql` — create the new schemas (`visa`, `ml`, `ops`, `audit`) + pgvector extension.
2. `0002_v2_taxonomy_seed.sql` — populate `ml.skill_taxonomy`, `ml.role_families`, `ml.soc_codes`.
3. `0003_v2_existing_extensions.sql` — all the `ALTER TABLE` statements above.
4. `0004_v2_audit_outcome.sql` — the audit and outcome tables.
5. `0005_v2_indexes.sql` — all new indexes (CONCURRENTLY in production).

Each migration is reversible. v1 schema stays valid throughout. Feature flag `USE_V2_MATCHER` gates which scorer the API hits.

---

## 5. The Data Contract (from career-ops)

Borrowed straight from your career-ops `DATA_CONTRACT.md`. The principle is the same here even though SwipeHire's storage is a database, not a filesystem: **user data is sovereign; system data is replaceable.**

### 5.1 User-owned data (NEVER touched by system updates)

Stored in tables that belong to specific users; exportable in one click; never reset by deployments.

| Domain | Tables / Storage |
|--------|------------------|
| Identity & profile | `app.users` (everything except `id`, `created_at`) |
| Resume content | `app.users.original_resume_content`, `app.users.resume_data`, R2 `users/{id}/resumes/*` |
| Tailored materials | `app.applications.tailored_resume_content`, R2 `users/{id}/tailored/*` |
| Application history | `app.applications`, `app.user_job_interactions` |
| Outcomes | `app.applications.outcome`, `app.applications.outcome_at` |
| Recruiter side | `app.recruiter_jobs` (recruiter-owned), `app.candidate_shortlists` |

**Export endpoint:** `GET /api/me/export` returns a single zip — `profile.json`, `resumes/`, `applications.csv`, `interactions.csv`, `outcomes.csv`. No upsell, no delay. Cancellation deletes everything within 24h with a confirmation email.

### 5.2 System-owned data (auto-updatable; safe to wipe and rebuild)

| Domain | Tables / Storage |
|--------|------------------|
| Job catalog | `app.jobs`, `app.companies` (except `companies.fein` which is a permanent identifier) |
| Visa intelligence | All `visa.*` tables — rebuildable from public sources |
| ML artifacts | All `ml.*` tables — rebuildable from open data and accumulated outcomes |
| Operational state | All `ops.*` tables — rolling window only |
| Telemetry | All `audit.*` tables — 90-day retention |

System updates (model retraining, taxonomy refresh, DOL ingest) write only to system-owned tables. Migrations that affect user-owned tables require an explicit data-migration path with user-notification.

### 5.3 Why this matters

- Compliance: GDPR/CCPA exports are a single endpoint, not a Jira ticket.
- Trust: users see this in our terms ("you own your data"). Differentiator vs Jobright's billing-trap reputation.
- Engineering velocity: we can wipe and rebuild any system-owned table without coordination.

---

## 6. Service topology

### 6.1 Process inventory

```
Production deployment (Fly.io, MVP scale):
┌────────────────────────────────────────────┐
│ swipehire-api    × 2 instances              │  Node 22, 1GB, public
├────────────────────────────────────────────┤
│ swipehire-ml     × 1 instance               │  Python 3.12, 2GB, internal
├────────────────────────────────────────────┤
│ swipehire-worker × 2 instances              │  Node 22, 1GB, internal
│   - liveness checker (Playwright)            │
│   - DOL ingest (cron)                        │
│   - ATS aggregator (cron)                    │
│   - employer matcher (event-driven)          │
│   - calibration retrainer (cron, weekly)     │
├────────────────────────────────────────────┤
│ swipehire-applier × N instances (Phase 2)    │  Node 22, 2GB, internal, scales horizontally
│   - per-ATS auto-apply Playwright workers    │
└────────────────────────────────────────────┘

External services:
  - Neon Postgres (managed, with pgvector)
  - Upstash Redis (managed, BullMQ + cache + sessions)
  - Cloudflare R2 (object storage)
  - Honeycomb / Grafana Cloud (telemetry)
  - Sentry (error monitoring)
```

### 6.2 Inter-process contracts

- **API → ML sidecar:** HTTP/JSON over private network. Timeout 2s. If ML is down, fall back to in-process WASM embedder + `IsotonicRegression` JS port; log degraded mode.
- **API → Workers:** BullMQ jobs over Redis. Workers consume named queues (`liveness`, `dol-ingest`, `apply-tier1`, `apply-tier2`, `calibration-retrain`).
- **Workers → ML sidecar:** Same as API → ML.
- **Workers → API:** None. Workers write to DB; API reads. No back-channel.
- **All processes → Telemetry:** OpenTelemetry SDK, OTLP/HTTP to collector.

### 6.3 Local development

```
docker compose up
# Brings up: postgres + pgvector, redis, ml-sidecar, mailhog (for digest testing)
npm run dev          # API + Vite dev server with HMR
npm run worker:dev   # workers
npm run ml:dev       # python sidecar with --reload
```

---

## 7. Subsystem: job ingestion

The replacement for v1's `jobAggregator.ts` + `enhancedJobAggregator.ts`. Gains: ATS-aware ingestion, canonical URL deduplication, liveness verification, SOC classification, ghost-job scoring at ingest time.

### 7.1 File layout

```
server/ingestion/
├── sources/
│   ├── greenhouseSource.ts      // GET /v1/boards/{client}/jobs (public, free)
│   ├── leverSource.ts           // GET /v0/postings/{client}?mode=json (public, free)
│   ├── ashbySource.ts           // GET /posting-api/job-board/{client} (public, free)
│   ├── workdaySource.ts         // Aggregator-mediated (Unified.to)
│   ├── jsearchSource.ts         // EXISTING — kept for breadth
│   ├── adzunaSource.ts          // EXISTING — kept for breadth
│   └── careerPageSource.ts      // EXISTING — Cheerio scraping
├── pipeline/
│   ├── normalize.ts             // RawJob → CanonicalJob
│   ├── dedupe.ts                // canonical_hash dedup, source-priority merge
│   ├── classify.ts              // SOC + role family + seniority
│   ├── enrich.ts                // company FEIN match, visa stats lookup
│   ├── liveness.ts              // adapt career-ops check-liveness.mjs
│   └── upsert.ts                // batched insert with conflict resolution
├── scheduler.ts                 // BullMQ producer; replaces v1 jobScheduler.ts
└── index.ts
```

### 7.2 Source priority and dedup

When the same job appears in multiple sources (Greenhouse + JSearch + Adzuna), we trust:

1. Direct ATS source (Greenhouse/Lever/Ashby) — canonical, fresh, structured.
2. Aggregator sources (JSearch, Adzuna) — broad but lossy.
3. Career page scraping — fallback only, never used if a structured source has it.

Canonical hash = sha256(`normalize(company_name)` + `normalize(title)` + `normalize(location)` + `posted_year_month`). Dedup runs in the upsert step.

### 7.3 Liveness verification at ingest

Borrowed wholesale from career-ops `check-liveness.mjs`. The patterns (EXPIRED_PATTERNS, APPLY_PATTERNS, MIN_CONTENT_CHARS, sequential Playwright) are battle-tested. We extend with:

- Multi-language patterns are already there (de, fr, es).
- Additional patterns for Workday split-view layouts that mislead naive scrapers.
- Per-ATS adapter — Greenhouse-specific behavior (`?error=true` redirect = closed) handled in adapter, not in the generic checker.
- Headless concurrency: career-ops's "never Playwright in parallel" rule applies here too. Workers process URLs sequentially within a process; we scale by adding workers, not threads.

Liveness runs:
- At ingest (synchronous, before insert).
- Daily, for every job posted in the last 60 days.
- On-demand when a user is about to view the job (cache TTL 6h).

Liveness output writes to `ops.job_liveness_checks` (append-only) and updates `jobs.liveness_probability` and `jobs.expired_at`.

### 7.4 SOC classification

A small classifier (pre-trained on BLS occupation handbook + curated mappings) maps `(title, description) → SOC code`. Initial implementation: keyword + heuristic in TS (covers 80% of common roles). Sidecar v2: a fine-tuned small transformer (~50MB) for ambiguous cases (e.g., "Data Scientist" can be 15-1252 or 15-2051 depending on JD).

For your specific targeting (marketing + PM + pricing), the relevant SOC codes are:
- 11-2011 Advertising and Promotions Managers
- 11-2021 Marketing Managers
- 11-2032 Public Relations Managers
- 11-3051 Industrial Production Managers
- 11-3061 Purchasing Managers
- 13-1161 Market Research Analysts
- 11-3021 Computer and Information Systems Managers (for technical PM)
- 11-9111 Medical and Health Services Managers (rarely)

The classifier will tag the user's `target_socs` from their profile; the visa stats lookup runs against those exact SOCs.

### 7.5 Ingest cadence

- Greenhouse/Lever/Ashby per-company: every 4h.
- Workday/iCIMS via Unified.to: every 8h (rate limits).
- JSearch/Adzuna: every 12h (paid quota).
- Career page scraping: daily, only for companies in `companies.aliases` set.
- DOL OFLC LCA disclosure: quarterly, when DOL releases new file (manual trigger initially; automate after first cycle).
- USCIS H-1B Employer Data Hub: annually + on-demand.

---

## 8. Subsystem: scoring

The implementation of `02_algorithm_v2.md`. New module that wraps existing job objects.

### 8.1 File layout

```
server/scoring/
├── types.ts                  // MatchResult, Subscore, MatchLabel
├── matcher.ts                // public entry point: scoreJobForUser(user, job)
├── featureExtractor.ts       // gather all features in one pass
├── subscores/
│   ├── skillsSemantic.ts
│   ├── titleAlignment.ts
│   ├── seniorityFit.ts
│   ├── locationFit.ts
│   ├── domainExperience.ts
│   ├── visaCompatibility.ts  // delegates to server/visa/
│   ├── salaryFit.ts
│   └── recencySignal.ts
├── combiner.ts               // weighted sum, role-family conditional
├── calibrator.ts             // calls ML sidecar /score endpoint
├── ciEstimator.ts            // bootstrap CI from sidecar
├── explain.ts                // builds the explain block
└── cache.ts                  // memoize per (user_id, job_id, model_version)
```

### 8.2 Hot path

For a typical "feed me 50 jobs" request:

1. API: `GET /api/v2/feed?limit=50` → calls `matcher.scoreFeedForUser(user, candidateJobIds)`.
2. `featureExtractor` does one DB roundtrip per user: load `users`, `users.target_socs`, `users.work_auth_v2`. One DB roundtrip per batch of jobs: load `jobs` joined with `companies` and `mv_job_scoring_features`.
3. Skill embeddings cached. Resume embedding cached per user. JD embedding cached per job by content hash.
4. Subscores computed in parallel within a job (Promise.all over the 8 modules).
5. Combiner is a pure function on subscores.
6. Calibrator is one HTTP call to ML sidecar with the raw scores (batched: 50 jobs in one request).
7. CI estimator returns from the same sidecar response.
8. Explain block generated locally (templated).
9. Result cached for 1h or until `users.updated_at` changes.

Target: full feed scoring in < 600ms p95 for 50 jobs once warm.

### 8.3 Calibration retraining

Worker job runs weekly:

1. Pull last 7 days of `score_outcomes` joined with `applications.outcome`.
2. Send to ML sidecar `/calibrate-retrain` endpoint.
3. Sidecar fits new `IsotonicRegression`, validates against held-out set, persists model artifact to R2.
4. Sidecar returns model version + validation metrics.
5. Worker updates `ml.calibration_models` with the new version, marks as `staged`.
6. A/B test: 5% of feed scoring requests use staged model for 48h.
7. If staged model wins on validation metrics by ≥1% calibration-error-reduction, promote to `active`.

### 8.4 The Insufficient Data guarantee

Hardcoded in `combiner.ts`:

```ts
const subscoresWithConfidence = subscores.filter(s => s.confidence > 0);
const avgConfidence = subscoresWithConfidence.reduce((acc, s) => acc + s.confidence, 0) / subscoresWithConfidence.length;

if (avgConfidence < 0.4) {
  return {
    label: 'Insufficient data',
    interviewProbability: null,  // explicitly null, not a fake number
    confidenceInterval: null,
    subscores,
    explain: { /* still useful */ },
  };
}
```

UI never shows a numeric score for `Insufficient data` results. This is the structural anti-inflation guarantee.

---

## 9. Subsystem: visa intelligence

Replaces v1's hardcoded `h1bVisaService.ts` table.

### 9.1 File layout

```
server/visa/
├── types.ts                  // WorkAuth, VisaIntel, EmployerVisaStats
├── ingest/
│   ├── dolLca.ts             // quarterly DOL OFLC ingest
│   ├── uscisHub.ts           // annual USCIS Hub ingest
│   └── prevailingWage.ts     // OFLC prevailing wage data
├── employerMatcher.ts        // company name → FEIN
├── socClassifier.ts          // (title, description) → SOC code
├── statsCompute.ts           // nightly aggregates → employer_visa_stats
├── compatibility.ts          // (user, job) → Subscore
└── safeHarbor.ts             // prevailing wage check
```

### 9.2 DOL ingest job (per your decision: quarterly only)

```ts
// server/visa/ingest/dolLca.ts
export async function ingestDolLca(quarter: string) {
  const url = `https://www.dol.gov/.../LCA_Disclosure_Data_${quarter}.xlsx`;
  const xlsx = await downloadAndParse(url);
  const records = xlsx.map(parseDolRow);

  await db.transaction(async tx => {
    await tx.insert(lcaRecords).values(records).onConflictDoNothing();
    await tx.insert(ingestionRuns).values({
      source: 'dol_lca',
      quarter,
      records_ingested: records.length,
      ingested_at: new Date(),
    });
  });

  // Schedule rollup recomputation
  await queue.add('compute-employer-stats', { since: quarter });
}
```

A new quarter file appears ~15 days after the quarter ends. We poll the OFLC performance page weekly; when a new file is detected, the worker downloads, parses, ingests, and triggers rollup. Ingestion of one quarter's file (~500MB XLSX, ~250k rows) takes ~10 minutes. The rollup recompute takes another 5 minutes. Both run in the worker pool, not the API.

### 9.3 Employer matching

The hardest data engineering problem in this subsystem. "Stripe Inc." in DOL data may appear as "STRIPE, INC.", "Stripe Payments LLC", or "STRIPE INC", with different FEINs for different legal entities of the same parent.

Approach:
1. Normalize: uppercase, strip suffix words (INC, LLC, CORP, CORPORATION, COMPANY, LTD, LIMITED, CO, GROUP), strip punctuation.
2. Exact match first.
3. Token Jaccard ≥ 0.8 → high-confidence match.
4. Levenshtein edit distance ≤ 3 with same first token → medium-confidence match.
5. Manual override table for known parent-subsidiary mappings (Alphabet ↔ Google, Meta ↔ Facebook, etc.).

Match results stored in `companies.fein` (one canonical FEIN) and `companies.aliases` (all known DOL employer names). Quarterly DOL ingest re-runs matching on any unmatched names.

### 9.4 Per-job visa scoring

Pure function, called by `subscores/visaCompatibility.ts`:

```ts
import { matchEmployer } from '../employerMatcher';
import { getEmployerStats } from '../statsCompute';

export async function calculateVisaCompatibility(user: User, job: Job): Promise<Subscore> {
  if (!userNeedsSponsorship(user.work_auth_v2)) {
    return { value: 1, weight: 0, confidence: 1 };  // not applicable
  }

  const fein = job.companies?.fein ?? await matchEmployer(job.company);
  if (!fein) {
    return {
      value: 0.30, weight: weights.visa, confidence: 0.10,
      evidence: [`Employer "${job.company}" not yet matched in DOL records`],
    };
  }

  const socCode = job.soc_code ?? await classifySoc(job.title, job.description);
  const stats = await getEmployerStats(fein, socCode);  // hits employer_visa_stats

  // ... math from algorithm v2 §5.3
}
```

Latency target: ≤ 30ms (single indexed query into the rollup table).

### 9.5 Multi-visa coverage

The `users.work_auth_v2` JSONB has the full WorkAuth object from §5.4 of the algorithm doc. The compatibility scorer branches on `status`:

```ts
switch (workAuth.status) {
  case 'us_citizen':
  case 'green_card':
    return notApplicable();
  case 'h1b':
  case 'h4_ead':
    return scoreH1B(stats, job, workAuth);
  case 'opt':
  case 'stem_opt':
    return scoreOPTtoH1B(stats, job, workAuth, user);
  case 'f1':
    return scoreF1Pipeline(stats, job, workAuth, user);
  case 'e3':
    return scoreCategorySpecific('E-3', stats, job);
  case 'tn':
    return scoreCategorySpecific('TN', stats, job);
  // ...
}
```

For the user's own profile (STEM OPT), `scoreOPTtoH1B` checks:
- Employer has H-1B history in `target_socs`.
- Employer's last sponsorship date (recency).
- Wage at posting ≥ DOL prevailing wage Level II for that SOC and metro (the safe-harbor signal).
- User's degree CIP code is STEM-eligible (extends OPT by 24 months).

### 9.6 Safe-harbor warning

Prevailing wage data is in `visa.prevailing_wages` (OFLC publishes it). For every visa-needs job, we compare `min(job.salaryMin, midpoint(job.salaryMin, job.salaryMax))` against the prevailing wage Level II. If below, surface:

> ⚠️ The salary band on this posting ($95k–$110k) may be below the DOL prevailing wage for "Marketing Manager" in San Francisco–Oakland metro ($112k Level II). Sponsorship may not clear at this band.

This is an honest, value-add signal nobody else provides. It alone is worth the visa subsystem.

---

## 10. Subsystem: tailoring

Replaces v1's single OpenAI call with the evidence-grounded pipeline from `02_algorithm_v2.md §8`.

### 10.1 File layout

```
server/tailoring/
├── types.ts                  // TailoringPlan, TailoredBullet, ATSCheckResult
├── planner.ts                // step 1: JD → plan (LLM call, JSON output)
├── bulletRewriter.ts         // step 2: per-bullet rewrite, evidence-grounded
├── styleFingerprint.ts       // step 3: GPT-default detector (calls ML sidecar)
├── atsParserCheck.ts         // step 4: parse-and-show
├── diffView.ts               // step 5: structured diff for UI
└── orchestrator.ts           // ties them together; called by API
```

### 10.2 LLM provider

GPT-4o stays for tailoring (the v1 dep is fine), but the prompt is restructured around the plan-first pattern. We add Claude 3.5 Sonnet as a secondary provider behind an interface (`LLMClient`), so we can A/B test which produces less detectable AI output.

### 10.3 ATS parser check

Each major ATS uses a known parser:
- Greenhouse → Sovren (proprietary; we ship a local emulator that approximates its parsing).
- Lever → RChilli (we have access patterns documented).
- Ashby → in-house parser, well-documented format.
- Workday → in-house, very strict on PDF structure.

For each, we keep a "what the ATS sees" view that shows the JSON the ATS would extract from the user's resume. If a section parses badly (e.g., custom date formats, multi-column layout), we warn the user and offer a remediation.

### 10.4 Style fingerprint

Small classifier (sklearn `LogisticRegression` on TF-IDF + handcrafted features: avg sentence length, banned-phrase frequency, em-dash density, etc.) trained on a balanced corpus of human resumes vs GPT-default outputs. Runs in the ML sidecar. If `P(GPT-default) > 0.4`, return to `bulletRewriter` with stronger constraints (smaller temperature, banned-words list expanded).

---

## 11. Subsystem: auto-apply

Phased per `02_algorithm_v2.md §gap-5`. Tier-1 in Phase 1, Tier-2 in Phase 2, Tier-3 always available as fallback.

### 11.1 File layout

```
server/applier/
├── types.ts                  // ApplyJob, ApplyResult, AtsAdapter
├── adapters/
│   ├── greenhouseAdapter.ts  // tier 1
│   ├── leverAdapter.ts       // tier 1
│   ├── ashbyAdapter.ts       // tier 1
│   ├── workdayAdapter.ts     // tier 2
│   ├── icimsAdapter.ts       // tier 2
│   ├── smartrecruitersAdapter.ts // tier 2
│   └── customAdapter.ts      // tier 3 fallback
├── orchestrator.ts           // queues, retries, health metrics
├── healthMetrics.ts          // per-ATS success rates, displayed publicly
└── visaQuestionHandler.ts    // pre-fill Q "are you authorized?"
```

### 11.2 Tier-1 contract (Greenhouse, Lever, Ashby)

These ATSs have stable forms and structured APIs. Auto-submit happens in a queue:

1. User swipes right + reviews tailored resume + clicks "Queue Application."
2. Job goes into `apply-tier1` BullMQ queue.
3. Applier worker picks it up, opens Playwright session, fills form, submits.
4. Result (`success`, `failed`, `requires_human`) written to DB; user notified.

Throttle: max 5 applications per user per hour. Hard daily cap (free: 10/day, paid: 50/day) — quality bias by design.

### 11.3 Tier-2 contract (Workday, iCIMS, SmartRecruiters)

These ATSs are unreliable. Workday's React app changes structure weekly. The contract here is "open the form pre-filled, hand it to the user for one-tap submit":

1. User swipes right + reviews tailored resume + clicks "Apply."
2. A short-lived browser session is launched (or, in Phase 2, the user's own browser via the SwipeHire extension).
3. Form is auto-filled.
4. User reviews and clicks Submit themselves.

Health metrics tracked publicly: per-ATS, last-7-day success rate, last-7-day fail rate, top failure reasons.

### 11.4 Visa question handler

Every application form asks: "Are you authorized to work in the US?" and "Will you require sponsorship?" These are answered automatically based on `users.work_auth_v2`:

- `us_citizen`/`green_card`: authorized=yes, sponsor=no.
- `h1b`/`l1`/`l2_ead`/`h4_ead`/`asylum_ead`: authorized=yes, sponsor=yes (transfer).
- `opt`/`stem_opt`/`cpt`: authorized=yes, sponsor=yes (when current EAD expires).
- `f1` (no EAD): authorized=no (yet), sponsor=yes.
- `e3`/`tn`/`o1`/`j1`/`h1b1`: per-category logic.

Handler logs the answer it gave in `audit.score_decisions` so a user can audit "what did SwipeHire say on my behalf about my work auth?"

### 11.5 Onboarding depth

Borrowed from career-ops Step 5. `users.onboarding_depth` is 0–5:

- 0: just signed up, no resume.
- 1: resume parsed, basic profile.
- 2: target SOCs and role families set.
- 3: work auth detail filled (subtype + expiry + sponsorship needed within).
- 4: proof points / "what makes you unique" answered (stored as JSONB `proof_points`).
- 5: deal-breakers answered (no relocation, salary floor, etc.).

Score quality scales with depth — calibrator weights resume embedding more heavily at depth 4+. UI prompts the user to deepen onboarding when depth < 3.

---

## 12. Subsystem: recruiter SaaS (Phase 3)

Already partially scaffolded in v1 (`pages/recruiter-dashboard.tsx`, `recruiter-candidates.tsx`, `recruiter-job-post.tsx`, schema tables). v2 adds the calibration loop and the ATS write-back.

### 12.1 File layout

```
server/recruiter/
├── matchConfig.ts            // per-company scoring overrides
├── candidateRanker.ts        // applies recruiter config to global score
├── feedbackLoop.ts           // thumbs up/down → ml.score_outcomes
├── atsWriteback/
│   ├── greenhouseWriteback.ts  // POST candidates to Greenhouse via Harvest API
│   ├── leverWriteback.ts
│   └── ashbyWriteback.ts
└── verifiedSponsor.ts        // validates "sponsors visa" claim against DOL data
```

### 12.2 Recruiter-side calibration

Per your decision: thumbs-down stays internal. The UI shows the recruiter only "added to global match training" — never tells the candidate why someone passed.

### 12.3 Verified sponsor badge

Recruiters can claim "we sponsor visas." We validate against DOL data:
- ≥ 3 LCAs in last 24 months → "Verified Sponsor" badge.
- ≥ 1 LCA in last 24 months in the SOC of the posted job → "Verified Sponsor for this role" badge.
- 0 LCAs ever → claim allowed but no badge; candidate sees "Sponsorship claim is unverified" warning.

This is a structural honesty mechanism that aligns recruiter incentives with truth.

---

## 13. Observability and the Honesty Dashboard

### 13.1 Internal telemetry

Every score, every ingest, every auto-apply attempt emits a structured OTLP event. Traces are end-to-end: a user's `GET /feed` request shows you which subscores took how long, which DB queries hit, which ML sidecar calls happened.

### 13.2 The Honesty Dashboard

Public page at swipehire.io/honesty. Updated weekly. Shows:

- **Calibration error**, last 30 days, by score band: "Of jobs we labeled 70-80% probability, X% led to interviews."
- **Job liveness rate**: "Of jobs surfaced this week, Y% were verified live within 24h of being shown."
- **Per-ATS auto-apply success**: "Greenhouse: 94%, Lever: 91%, Ashby: 89%, Workday: 67% (assisted only)."
- **Visa data freshness**: "DOL data current as of [date], next refresh expected [date]."
- **Cancellation friction**: "Median time from cancel-click to confirmation: 0.4s. No emails required."

The dashboard is the marketing differentiator and the operational forcing function. If our calibration drifts, it shows up here before it shows up in user complaints.

### 13.3 Per-user audit log

Every user can view their own log: every score they received, the explanation, the auto-apply attempts, the visa-question answers given on their behalf. `GET /api/me/audit?from=...&to=...`. This is borrowed in spirit from career-ops's transparent file-based pipeline.

---

## 14. Security, privacy, compliance

### 14.1 Visa data is sensitive

DOL LCA data is public, but the act of compiling it into a per-employer per-SOC sponsorship signal could be construed as a regulated activity in some jurisdictions. We mitigate:

- All visa data is informational; we never advise on immigration. `LEGAL_DISCLAIMER.md` (borrowed pattern from career-ops) is shipped at signup, surfaced before every visa-intel display.
- We never make promises about specific visa outcomes ("Stripe will sponsor you").
- We document our data sources and methodology publicly.

### 14.2 Resume content

- At rest: encrypted in Postgres column-level (`pgcrypto`); R2 object-level encryption.
- In transit: TLS everywhere.
- In LLM calls: only the user's own resume + the JD; never cross-user data.
- Deletion: cascading on user delete; verified by daily integrity check.

### 14.3 Auth and sessions

- Passport + Google OAuth (existing). Move sessions from in-memory to `connect-pg-simple` (already a dep, 5-line change).
- 2FA via WebAuthn (Phase 2).
- Recruiter accounts: email domain verification + manual review for first 100 recruiter signups, automated thereafter.

### 14.4 Rate limiting and abuse

- API: token bucket per user (existing v1 has none). 60 req/min general, 5 apply/hour, 10 score/min.
- Auto-apply: hard daily caps, captcha on ATSs that ask, never bypass.
- Recruiter scraping prevention: per-user feed cards are watermarked; bulk export gated behind paid tier.

### 14.5 Data export and deletion (Data Contract enforcement)

- `GET /api/me/export` produces a zip in < 30s.
- `DELETE /api/me` triggers cascading delete; audit row preserved for 90 days for fraud/abuse analysis, then purged.
- One-click cancellation. No email, no retention upsell. (Pointed contrast vs Jobright.)

---

## 15. Migration plan: from current Replit deploy to v2

### 15.1 Constraints

- No downtime (the marketing site is live and you're collecting signups).
- Existing user data preserved.
- Existing v1 scoring behavior preserved during transition (feature flag).
- Drizzle migrations only; no manual SQL.

### 15.2 Phased deploy

**Phase 0 (week 1): infrastructure prep**
- Move Replit deploy to Fly.io (API + Postgres on Neon already, just swap host).
- Add Redis (Upstash), R2 (Cloudflare).
- Add ML sidecar container, deploy alongside API.
- Wire OpenTelemetry, Sentry, Honeycomb.
- All v1 functionality verified post-move with smoke tests.

**Phase 1 (weeks 2–5): foundations**
- Drizzle migrations 0001–0005.
- Skill taxonomy + role family seed.
- DOL LCA ingest worker + first quarterly pull.
- Employer matcher + first run on existing `companies` rows.
- New `scoring/` module behind `USE_V2_MATCHER` flag (default: off).
- Liveness checker worker + daily run on existing jobs.
- Begin shadow scoring: every v1 score also produces a v2 score, both written to `audit.score_decisions`. UI shows v1 only.

**Phase 2 (weeks 6–8): user-facing v2**
- Honesty Dashboard live (initially with shadow data).
- Tailoring v2 behind `USE_V2_TAILORING` flag, opt-in.
- Auto-apply Tier 1 (Greenhouse/Lever/Ashby) launched to 10% of users.
- Visa intel UI live for opted-in users.

**Phase 3 (weeks 9–14): cutover**
- Ramp `USE_V2_MATCHER` to 100% based on calibration metrics.
- Deprecate v1 `jobMatcher.ts` (file deleted in PR).
- Tier 2 auto-apply (Workday/iCIMS/SmartRecruiters) launched to all.
- Recruiter calibration loop activated.

**Phase 4 (weeks 15+): defensibility**
- Verified Sponsor badges live on recruiter side.
- ATS write-back for top 3 ATSs.
- Outcome-driven calibrator (real interview signals) replaces bootstrap calibrator.

### 15.3 Rollback

Every flag-gated change has a one-line revert. Database migrations are reversible. The only one-way move is Postgres → Postgres+pgvector (`CREATE EXTENSION` is reversible but vector data isn't).

---

## 16. What gets built first (and why)

Given Deliverable #4 is the code scaffold and you're SwipeHire's first user (STEM OPT, marketing/PM target), the minimum scaffolded codebase that proves the architecture should include:

1. **Shadow-scoring pipeline.** New `scoring/` module + ML sidecar `/embed` + `/score`. Wired against the v1 schema initially. Proves the calibration architecture works.
2. **DOL LCA ingest.** One quarterly pull, employer match, rollup compute. Visa intel ready for marketing/PM SOCs (the user's own targeting).
3. **Liveness checker.** Adapted from career-ops. Daily run, kills ghost jobs from existing v1 catalog.
4. **Honesty Dashboard scaffold.** Empty data shells but the page exists. Forcing function from day one.
5. **Tier-1 auto-apply skeleton.** Greenhouse adapter only. Proves the queue + Playwright pattern.

Everything else is deferred to Phase 2+. The point of Deliverable #4 is to ship the spine, not the limbs.

---

## 17. Open implementation questions (not blocking, but worth flagging)

These are decisions I'm making by default in the scaffold; flag any to override:

- **Monorepo or two repos?** Default: monorepo (`apps/api`, `apps/web`, `apps/ml-sidecar`, `apps/worker`, `packages/shared`). Easier sharing of types via `packages/shared`. Use pnpm workspaces.
- **Migrations vs shadow tables?** Default: migrations. Drizzle handles it. We've been clean about additive-only.
- **Test framework?** Default: Vitest for TS, pytest for Python. Playwright tests for E2E.
- **Frontend state for v2 features?** Default: TanStack Query (already used). New v2 routes wrapped in a typed RPC layer (oRPC or similar) added in Phase 1.
- **CI cost gating?** Default: GitHub Actions free tier; switch to self-hosted runners if cost > $50/mo.

---

## 18. Summary

SwipeHire v2 is a **modular monolith** in TypeScript with one Python sidecar for ML. PostgreSQL + pgvector handles all data including vectors. Workers handle long-running and Playwright-driven jobs. The architecture's load-bearing principle is the **Data Contract** borrowed from career-ops: user data is sacrosanct, system data is replaceable.

The architecture is designed so the existing Replit code keeps working while v2 grows alongside it, gated by feature flags, and eventually deprecates v1 piece by piece. Nothing is rewritten for the sake of rewriting; everything new earns its keep with a measurable improvement on calibration, liveness, or auto-apply success.

The next deliverable (#4) is the code scaffold — a runnable monorepo with the spine of all the above in place, even if the limbs are stubbed.
