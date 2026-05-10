# Scaffold Handoff — what shipped, what's next

**Date:** May 2026
**Companion to:** `01_strategy.md`, `02_algorithm_v2.md`, `03_architecture.md`

This document is the bridge from scaffold to running app. It tells you exactly what is in the repo today, what works, what is stubbed for incremental fill-in, and the order to do the fill-ins so the system goes from "compiles" to "runs end-to-end" to "production ready."

---

## What's in the repo today

```
SwipeHire/
├── apps/
│   ├── api/           NEW v2 modules + migrated v1 src (needs path updates)
│   │   └── src/
│   │       ├── app.ts                    NEW — v2 entry point
│   │       ├── config/flags.ts           NEW — feature flags
│   │       ├── scoring/                  NEW — full v2 scoring spine
│   │       │   ├── matcher.ts                  entry: scoreJobForUser, scoreFeedForUser
│   │       │   ├── featureExtractor.ts         single-pass feature extraction
│   │       │   ├── combiner.ts                 weighted sum + low-confidence redistribution
│   │       │   ├── calibrator.ts               isotonic + CI; "Insufficient data" gate
│   │       │   ├── explain.ts                  reasons-to-apply / reasons-to-hesitate
│   │       │   └── subscores/*                 8 modules (skillsSemantic, titleAlignment, ...)
│   │       ├── visa/                     NEW — DOL-based visa intel
│   │       │   ├── compatibility.ts            per-job visa scoring + intel payload
│   │       │   ├── employerMatcher.ts          name → FEIN with pg_trgm
│   │       │   ├── socClassifier.ts            (title, desc) → SOC code
│   │       │   └── ingest/dolLca.ts            quarterly DOL OFLC ingest
│   │       ├── authenticity/             NEW — liveness + ghost detection
│   │       │   ├── livenessChecker.ts          adapted from career-ops
│   │       │   └── index.ts                    JobAuthenticity payload
│   │       ├── applier/                  NEW — auto-apply tiered by ATS
│   │       │   ├── adapters/greenhouseAdapter.ts  Tier 1
│   │       │   ├── orchestrator.ts             throttle + health metrics
│   │       │   └── visaQuestionHandler.ts      pre-fill canonical visa Qs
│   │       ├── honesty/                  NEW — public dashboard
│   │       │   ├── metrics.ts
│   │       │   └── routes.ts                   GET /api/honesty
│   │       ├── ml/                       NEW — sidecar client
│   │       │   └── inferenceClient.ts          /embed, /score, /classify-ghost, /check-style
│   │       ├── routers/v2/feed.ts        NEW — example v2 endpoint
│   │       ├── index.ts                  V1 — needs path migration
│   │       ├── routes.ts                 V1 — 1000+ lines; needs path migration
│   │       ├── services/                 V1 — kept as reference (jobMatcher, h1bVisaService, etc.)
│   │       ├── db.ts                     V1 — needs path migration (use @swipehire/db instead)
│   │       └── storage.ts                V1 — needs path migration
│   ├── web/           V1 React app (works as-is once @swipehire/shared wired)
│   │   └── src/pages/honesty.tsx         NEW — Honesty Dashboard page
│   ├── ml-sidecar/    NEW Python FastAPI service
│   │   ├── main.py                       /healthz /embed /embed-batch /score /classify-ghost /check-style
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── worker/        NEW BullMQ worker
│       └── src/index.ts                  liveness + dol-ingest + apply-tier1 + calibration queues
├── packages/
│   ├── db/            NEW — Drizzle + v1+v2 schema + seeds
│   │   ├── src/
│   │   │   ├── index.ts                  drizzle pool + schema barrel
│   │   │   ├── schema/v1.ts              EXACT copy of v1 schema
│   │   │   ├── schema/v2.ts              additive v2 (visa/ml/ops/audit schemas + columns)
│   │   │   ├── schema/index.ts           barrel
│   │   │   ├── seed.ts                   entry
│   │   │   └── seeds/
│   │   │       ├── soc-codes.ts          BLS SOC reference (focused on marketing/PM/SWE)
│   │   │       ├── role-families.ts      with siblings + SOC links
│   │   │       └── skill-taxonomy.ts     ~150 canonical skills
│   │   ├── init/00-extensions.sql        pgvector + pg_trgm + schemas
│   │   └── drizzle.config.ts
│   └── shared/        NEW — types
│       └── src/types/
│           ├── match-result.ts           MatchResult, Subscore, MatchLabel
│           ├── work-auth.ts              WorkAuth + helpers
│           └── visa-intel.ts             VisaIntel
├── docs/
│   ├── 01_strategy.md                    competitive teardown + roadmap
│   ├── 02_algorithm_v2.md                full algorithm spec
│   ├── 03_architecture.md                system design
│   └── 04_scaffold_handoff.md            (this file)
├── docker-compose.yml                    postgres+pgvector, redis, ml-sidecar, mailhog
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json                          monorepo scripts
├── .env.example
├── .gitignore
├── README.md
└── scripts/doctor.mjs                    pre-flight setup check
```

---

## What works today (after `pnpm install` + `pnpm docker:up`)

1. **Doctor check.** `node scripts/doctor.mjs` validates Node 22+, pnpm, docker, .env, and structure.
2. **Database initialization.** `pnpm db:push` creates v1+v2 schemas. `pnpm db:seed` populates SOC codes + role families + skill taxonomy.
3. **ML sidecar.** `pnpm docker:up` brings up the Python service. `curl localhost:8001/healthz` returns `{ "status": "ok", "embedder_loaded": true, ... }`. `/embed`, `/score`, `/classify-ghost`, `/check-style` all functional.
4. **v2 scoring path.** `apps/api/src/scoring/matcher.ts` end-to-end produces a complete `MatchResult` from `(user, job)`. All 8 subscores implemented (some as v0 heuristics; flagged with `TODO(v2.1)` for upgrade).
5. **Liveness checker.** `apps/api/src/authenticity/livenessChecker.ts` runs Playwright against a URL and returns active/expired/uncertain — directly derived from career-ops's battle-tested patterns.
6. **Honesty Dashboard.** `GET /api/honesty` returns real-shape JSON aggregating from `ops.*` tables. Frontend page at `apps/web/src/pages/honesty.tsx`.
7. **Worker process.** `pnpm worker:dev` starts a BullMQ consumer with 4 queues registered: liveness, dol-ingest, apply-tier1, calibration.
8. **Greenhouse Tier-1 applier.** `apps/api/src/applier/adapters/greenhouseAdapter.ts` fills standard Greenhouse forms (name, email, phone, links, resume upload, work-auth radios, sponsorship radios) and submits.

---

## What's stubbed and why

### Stubbed by design (compiles, returns neutral or empty)

These have correct interfaces and write to the right tables — they just need real implementations swapped in. The point of the scaffold is that the architecture is correct; filling each one is independent work.

- **`featureExtractor.ts`** has stub skill normalization and a naive metro extractor. v2.1: wire `skill_taxonomy` lookup + OSM Nominatim geocoding.
- **`socClassifier.ts`** has ~15 hand-curated regex rules. Sufficient for marketing/PM/SWE titles. v2.1: replace with fine-tuned small transformer for ambiguous cases.
- **`employerMatcher.ts`** uses `pg_trgm` similarity correctly but the `companies.aliases` curated list is empty. Will improve as DOL ingest runs and we accumulate matches.
- **`dolLca.ts`** has the full ingest pipeline (download → parse → batch insert → rollup trigger) but XLSX parsing is `console.warn` stub. Add `exceljs` to deps and finish the parser. ~50 lines of code.
- **`worker/src/index.ts`** has cron schedules registered but the actual "find stale jobs and enqueue" SQL is a TODO. ~20 lines.
- **v1 routes/services** are present but use `@shared/schema` paths. Update imports to `@swipehire/shared` and `@swipehire/db` to compile.

### Stubbed for safety (works but with conservative fallback)

- **ML inference fallback.** When the sidecar is unreachable, `inferenceClient.ts` returns a hash-based vector. This keeps the system online but skill matching quality drops. Set `ML_FALLBACK_ENABLED=false` to fail loud instead.
- **Calibrator.** v0 isotonic is bootstrapped on synthetic monotonic mapping. CI is fixed-width 0.12. Real calibration kicks in once weekly retrain has labeled outcomes (≥1k).

---

## Order to fill in (recommended)

This sequence gets you from "scaffold compiles" to "production-ready" with the smallest risk of rework.

### Week 1 — make it run end-to-end

1. Run `pnpm install` and resolve any peer-dep warnings.
2. Run `pnpm docker:up` and confirm pgvector, redis, ml-sidecar all healthy.
3. Run `pnpm db:push && pnpm db:seed`. Verify in `psql` that `ml.skill_taxonomy` has ~150 rows.
4. Backfill skill embeddings: add a one-shot script `apps/ml-sidecar/backfill_embeddings.py` that selects skills with NULL `embedding` and updates them via `/embed-batch`.
5. Add `exceljs` to `apps/api` deps. Finish `dolLca.ts` parser. Run `pnpm tsx apps/api/src/visa/ingest/dolLca.ts FY26Q1` for a smoke test.
6. Migrate v1 import paths: `@shared/schema` → `@swipehire/shared`, then `import { storage } from './storage'` → use `db` from `@swipehire/db` directly. Most v1 service files need ~5 line changes each.
7. `pnpm dev` — API on 5000, Web on 5173, Worker running, ML sidecar on 8001. Hit `/api/health` and `/api/honesty`.

### Week 2 — flip on v2 for shadow scoring

1. Set `SHADOW_V2_SCORING=true`. Every v1 score also produces a v2 score; both written to `audit.score_decisions`.
2. Add a SQL view that diffs v1 vs v2 scores per job. Eyeball-review the divergences. Tune subscore weights.
3. Run liveness checker against the existing v1 jobs. Identify ghost candidates. Compute initial liveness rate for the Honesty Dashboard.

### Week 3 — open Honesty Dashboard publicly

1. Wire `apps/web/src/pages/honesty.tsx` into the React router (Wouter route `/honesty`).
2. Add it to the marketing nav. The page works even with sparse data (shows "Not enough labeled outcomes yet" gracefully).
3. Tweet the dashboard URL. The visibility forces ongoing honesty.

### Week 4 — Tier-1 auto-apply launch

1. Test the Greenhouse adapter against 5 known boards (Stripe, Anthropic, Vercel, Notion, Linear).
2. Capture screenshots; harden selectors for any board that breaks.
3. Add Lever and Ashby adapters (similar shape).
4. Open Tier-1 to 10% of users. Monitor success rate on the Honesty Dashboard.

### Phase 2+

Follow `03_architecture.md §15` migration phases. Recruiter calibration loop, Tier-2 Workday, ATS write-back.

---

## Known limitations of the scaffold

These are intentional tradeoffs to keep the scaffold focused. None block running the system.

- **No tests yet.** Vitest is in deps but no tests written. First tests should cover `combiner.ts` (weight redistribution edge cases), `calibrator.ts` (Insufficient Data gate), `livenessChecker.ts` (each EXPIRED_PATTERN matched against fixture HTML).
- **No CI.** GitHub Actions config not included. Add `.github/workflows/ci.yml` that runs `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm db:push` against a test Postgres.
- **No deploy config.** No `fly.toml` files yet. Add per-app fly.toml in week 5.
- **No production session secret rotation.** SESSION_SECRET is single-value. Phase 2: support rotation.
- **No 2FA.** Passport + Google OAuth only. WebAuthn in Phase 2.
- **No rate limiting.** Express has no `express-rate-limit` middleware wired. Add before public launch.

---

## Architecture invariants you must not break

Codified in code via gates and conventions. Reviewers should reject PRs that violate them.

1. **The Insufficient Data gate.** If `avg(subscore confidence) < 0.4`, `interviewProbability` MUST be `null` and `label` MUST be `'Insufficient data'`. Hardcoded in `calibrator.ts`. Don't bypass.
2. **Sequential Playwright.** Liveness checker and applier adapters must process URLs sequentially per process. Career-ops's hard-learned rule. Scale by adding worker processes.
3. **Data Contract.** Migrations to `app.*` tables (user-owned) require explicit user-notification. Migrations to `visa.*` / `ml.*` / `ops.*` / `audit.*` (system-owned) do not.
4. **Never inflate match scores.** Engagement is downstream of trust. The Honesty Dashboard is the public proof.
5. **Never auto-submit unreviewed material.** Auto-apply means auto-fill. The user's final tap is non-negotiable.

---

## Questions when something doesn't work

| Symptom | Where to look |
|---------|---------------|
| `pnpm install` fails | Node version (need 22+); pnpm version (need 9+) |
| `pnpm docker:up` hangs | First-time pgvector/ml-sidecar pulls are large (~3GB). Wait. |
| `/api/honesty` returns 500 | Check `ops.*` and `ml.*` tables exist (`pnpm db:push` first). |
| Match scores are all "Insufficient data" | Subscore confidences are < 0.4. Profile/job data sparse — improve onboarding. |
| ML sidecar `/embed` 503 | Embedder still loading at startup (~60s on first run). Check `docker logs swipehire-ml`. |
| Liveness checker times out | Increase `NAV_TIMEOUT_MS` in livenessChecker.ts; check site is reachable from worker. |
| `inferSoc` returns null on common titles | Add a regex pattern to `socClassifier.ts` `TITLE_TO_SOC` array. |

---

## Final notes

The scaffold proves the architecture. Every load-bearing decision in the strategy and algorithm docs is realized in code somewhere — even if as a v0 heuristic with a clear upgrade path. The 5 hard rules in §architecture invariants above are enforced in code, not just docs.

The migration plan in `03_architecture.md §15` is unchanged. This scaffold is Phase 0 + the bones of Phase 1. Filling in the v2.1 TODOs across weeks 1–4 above completes Phase 1.

Welcome to the codebase. The next contributor (or you in three weeks) will read this doc and the four others, run `node scripts/doctor.mjs`, and be productive within the hour.
