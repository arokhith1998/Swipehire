# Deploying SwipeHire to swipehire.io

This is the click-by-click guide. Total time once you have accounts: ~30–60 minutes.

**Topology**

```
swipehire.io          → Squarespace (marketing, unchanged)
app.swipehire.io      → Vercel       (the React SPA — apps/web)
api.swipehire.io      → Railway      (Express api — apps/api)
                      → Railway      (BullMQ worker — apps/worker, no public URL)
                      → Neon         (Postgres + pgvector)
                      → Upstash      (Redis for BullMQ)
```

Cost: $0 to start, ~$5–25/mo once you have real traffic.

---

## 0. Prerequisites

- [ ] Push the SwipeHire repo to GitHub (it must be a repo Vercel/Railway can read)
- [ ] Accounts (all use GitHub login, no card needed for free tier):
  - [ ] [vercel.com](https://vercel.com)
  - [ ] [railway.com](https://railway.com)
  - [ ] [neon.tech](https://neon.tech)
  - [ ] [upstash.com](https://upstash.com)
- [ ] DNS access to swipehire.io in Squarespace (Settings → Domains → DNS)

Generate a session secret now — you'll paste it in step 3:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 1. Create the Postgres database (Neon)

1. neon.tech → "New project" → name **swipehire-prod**, region closest to your users (US-East is fine).
2. After creation, copy the **Pooled connection string** (Dashboard → "Connection string" → toggle "Pooled connection"). It looks like `postgresql://user:pass@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`.
3. Open the SQL Editor → run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS btree_gin;
   CREATE SCHEMA IF NOT EXISTS app;
   CREATE SCHEMA IF NOT EXISTS visa;
   CREATE SCHEMA IF NOT EXISTS ml;
   CREATE SCHEMA IF NOT EXISTS ops;
   CREATE SCHEMA IF NOT EXISTS audit;
   ```
4. Now push the schema from your laptop:
   ```bash
   # Set DATABASE_URL temporarily then push
   DATABASE_URL='paste-the-pooled-url-here' pnpm --filter @swipehire/db push --force
   DATABASE_URL='paste-the-pooled-url-here' pnpm db:seed
   DATABASE_URL='paste-the-pooled-url-here' pnpm --filter @swipehire/api ingest:greenhouse
   ```
   Last step takes a few minutes and seeds ~1,300 jobs.

---

## 2. Create the Redis (Upstash)

1. upstash.com → "Create database" → name **swipehire-prod**, region closest to where Railway will be (US-East), TLS **on**.
2. Copy the **Redis Connect URL** — starts with `rediss://default:...@...upstash.io:6379`. You'll paste this into Railway.

---

## 3. Deploy the API + Worker (Railway)

Railway will host two services from the same GitHub repo.

### 3a. The API service

1. railway.com → "New project" → "Deploy from GitHub repo" → pick the SwipeHire repo.
2. Service settings → **Settings** tab:
   - Service Name: `swipehire-api`
   - Root Directory: leave blank (uses repo root)
   - Custom Start Command: `pnpm --filter @swipehire/api start`
   - Healthcheck Path: `/api/ready`
   - Healthcheck Timeout: 30s
3. **Variables** tab — paste these (use your real values):
   ```
   NODE_ENV=production
   LOG_LEVEL=info
   DATABASE_URL=<Neon pooled URL from step 1>
   SESSION_SECRET=<the hex you generated>
   SESSION_STORE=postgres
   COOKIE_DOMAIN=.swipehire.io
   CORS_ORIGINS=https://app.swipehire.io,https://swipehire.io
   REDIS_URL=<Upstash URL from step 2>
   USE_V2_MATCHER=true
   USE_V2_LIVENESS=true
   USE_V2_VISA=false
   ```
4. **Networking** tab → "Generate Domain" — Railway gives you a `*.up.railway.app` URL. Test it:
   ```bash
   curl https://swipehire-api-production-XXXX.up.railway.app/api/health
   ```
5. Add custom domain: **Networking** → "Custom Domain" → enter `api.swipehire.io`. Railway shows a CNAME target (something like `xxxx.up.railway.app`) — note it for step 5.

### 3b. The Worker service

1. Same Railway project → "New" → "GitHub Repo" → pick the same SwipeHire repo.
2. Service Name: `swipehire-worker`
3. Custom Start Command: `pnpm --filter @swipehire/worker start`
4. Healthcheck Path: leave blank (no HTTP server)
5. **Variables** tab → click "Reference Variables" → copy from `swipehire-api` (saves typing). Make sure these are present:
   ```
   NODE_ENV=production
   LOG_LEVEL=info
   DATABASE_URL=<same as api>
   REDIS_URL=<same as api>
   WORKER_CONCURRENCY=2
   LIVENESS_CHECK_INTERVAL_HOURS=24
   ```

---

## 4. Deploy the Web (Vercel)

1. vercel.com → "New Project" → import the SwipeHire repo.
2. Framework Preset: **Other** (the repo's `vercel.json` overrides Vite detection for the monorepo).
3. Root Directory: leave as `./` (the `vercel.json` at root handles the build).
4. **Environment Variables**:
   ```
   VITE_API_URL=https://api.swipehire.io
   ```
5. Click "Deploy". First build takes 2–3 minutes.
6. Once green, "Settings" → "Domains" → add `app.swipehire.io`. Vercel shows a CNAME target (something like `cname.vercel-dns.com`) — note it for step 5.

---

## 5. Wire the DNS (Squarespace)

Squarespace dashboard → **Settings → Domains → swipehire.io → DNS Settings → Custom Records**. Add two CNAMEs:

| Host  | Type  | Value                                               |
|-------|-------|-----------------------------------------------------|
| `api` | CNAME | `<value Railway gave you>`                          |
| `app` | CNAME | `cname.vercel-dns.com`                              |

Do **not** change the existing root `swipehire.io` records — those keep your Squarespace marketing site live.

DNS usually propagates in 5–15 minutes. Vercel and Railway will auto-provision TLS certs once they see the CNAME.

---

## 6. First-load smoke test

Once `https://app.swipehire.io` and `https://api.swipehire.io` resolve:

```bash
# Should return JSON with status: ok
curl https://api.swipehire.io/api/health

# Should return ok: true with db check
curl https://api.swipehire.io/api/ready
```

In a browser: open `https://app.swipehire.io`. You should see the SwipeHire login page. Register an account, complete onboarding, see scored jobs.

---

## 7. Optional: marketing site update

In Squarespace, add a "Sign In" button on your homepage that links to `https://app.swipehire.io`. That's the bridge from marketing to product.

---

## What to do when things break

- **CORS error in browser console** → check `CORS_ORIGINS` on Railway includes the exact origin including `https://`.
- **401 on every API call** → the cookie isn't being sent. Verify `COOKIE_DOMAIN=.swipehire.io` (with leading dot) on Railway and that both subdomains are HTTPS.
- **Session loss on every request** → `SESSION_STORE` not set to `postgres`, or DATABASE_URL on Railway is wrong. Check `pg_tables` on Neon for a `session` table.
- **Worker not picking up jobs** → REDIS_URL on the worker service. Check Railway logs for ioredis connect errors.
- **`/api/ready` returns 503** → DATABASE_URL connection issue. Test the URL from your laptop.

---

## What's NOT covered here (intentionally)

- **ML sidecar** — not deployed in v0. The calibrator falls back to identity scoring. Add a Modal.com or Fly.io deployment when you want real bge-large embeddings.
- **DOL data ingest** — also a future task. Visa intel will say "no DOL data" for every employer until you run the ingester against a real CSV.
- **Google OAuth** — config keys are in the env template but the route isn't wired. See the punch list in memory.
- **CI/CD** — Vercel and Railway both auto-deploy on push to `main`. That's enough for pre-beta. Add GitHub Actions for tests later.

When you're ready for any of these, ping me with that specific task.
