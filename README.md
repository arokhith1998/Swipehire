# SwipeHire

> Visa-aware job matching that doesn't lie to you. Calibrated scores, honest visa intelligence, real auto-apply.

[![Status: dev](https://img.shields.io/badge/status-dev-orange)](.)
[![Node](https://img.shields.io/badge/node-22-339933)](.)
[![Python](https://img.shields.io/badge/python-3.12-3776AB)](.)
[![Postgres](https://img.shields.io/badge/postgres-16-336791)](.)

---

## What this is

SwipeHire is a job-matching platform that targets the gaps every other tool has trained users to distrust:

- **Calibrated match scores** — predicted interview probability with a confidence interval, not a vibe.
- **Real visa intelligence** — DOL OFLC LCA data (4.8M+ records), per-employer per-SOC, with freshness timestamps.
- **Job authenticity** — Playwright-verified liveness, ghost-job detection, ≥95% live-on-click target.
- **Resume tailoring without hallucination** — evidence-grounded, ATS-real, style-fingerprint-checked.
- **Auto-apply that works** — tiered by ATS reliability, never blind, always reviewed by you.
- **Recruiter side that closes the loop** — calibration improves with every thumbs-up/down.

Read more in the [strategy doc](./docs/01_strategy.md), [algorithm v2 spec](./docs/02_algorithm_v2.md), and [architecture](./docs/03_architecture.md).

---

## Repository layout

```
swipehire/
├── apps/
│   ├── web/             React + Vite + shadcn/ui (candidate + recruiter UI)
│   ├── api/             Node + Express API (modular monolith)
│   ├── ml-sidecar/      Python FastAPI (embeddings + calibration)
│   └── worker/          Node + Playwright (ingest, liveness, auto-apply)
├── packages/
│   ├── shared/          Shared types and Zod schemas
│   └── db/              Drizzle schema, migrations, seeds
├── docs/                Strategy, algorithm, architecture docs
├── scripts/             Doctor, ops scripts
├── docker-compose.yml   Local dev stack (postgres+pgvector, redis, ml-sidecar, mailhog)
└── pnpm-workspace.yaml
```

---

## Quickstart

Prerequisites: Node 22+, pnpm 9+, Docker, Python 3.12+.

```bash
# 1. Install dependencies
pnpm install

# 2. Bring up the local stack (postgres+pgvector, redis, ml-sidecar, mailhog)
pnpm docker:up

# 3. Configure env
cp .env.example .env
# Edit .env — at minimum: DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY

# 4. Initialize the database
pnpm db:push     # apply schema
pnpm db:seed     # seed skill taxonomy, role families, SOC codes, sample jobs

# 5. Start everything
pnpm dev
# → API on http://localhost:5000
# → Web on http://localhost:5173 (Vite)
# → ML sidecar on http://localhost:8001
# → Worker running in background

# 6. Run the doctor
pnpm doctor      # validates setup
```

---

## Architecture at a glance

A modular monolith (Node/TS) with one Python sidecar (ML) and a worker pool (Playwright). Postgres is the single source of truth with pgvector for embeddings. Full details in [docs/03_architecture.md](./docs/03_architecture.md).

```
┌────────────┐    ┌────────────┐    ┌──────────────┐
│   apps/web │◀──▶│  apps/api  │◀──▶│apps/ml-sidecar│
└────────────┘    └─────┬──────┘    └──────────────┘
                        │
                        ▼
                  ┌────────────┐    ┌──────────────┐
                  │ Postgres   │    │ apps/worker  │
                  │ + pgvector │◀──▶│ (Playwright) │
                  └────────────┘    └──────────────┘
```

---

## Data Contract

User data is sacrosanct. System data is replaceable. Every table is tagged in [docs/03_architecture.md §5](./docs/03_architecture.md). Migrations that affect user data require explicit user-notification.

`GET /api/me/export` produces a one-zip export of everything you own. `DELETE /api/me` cascades within 24h. Cancellation is one click — no email, no friction.

---

## Status

This is the v2 scaffold. v1 functionality (the Replit deploy at swipehire.io) is migrated into `apps/web` + `apps/api` and stays running behind feature flags. v2 modules (`scoring/`, `visa/`, `authenticity/`, `applier/`) ship behind flags and graduate to default once they win on calibration metrics.

See [docs/03_architecture.md §15](./docs/03_architecture.md) for the migration plan.

---

## Contributing

Solo project for now. The structure is designed so that anyone (or any AI agent) can read the docs, run `pnpm doctor`, and contribute without spelunking.

---

## License

TBD (likely MIT, with a separate proprietary license for the calibration model artifacts and visa data pipelines).
