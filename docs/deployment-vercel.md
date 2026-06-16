# Vercel Web Deployment

This guide covers deploying the **Next.js frontend** (`apps/web`) to Vercel while keeping the **NestJS API** (`apps/api`) on a separate host with persistent Node.js and Socket.io support.

---

## Architecture

| Component | Platform | Reason |
|-----------|----------|--------|
| `apps/web` (Next.js) | **Vercel** | Optimized for Next.js SSR/SSG, edge functions, preview deployments |
| `apps/api` (NestJS + Socket.io) | **External host** (Render, Fly.io, Railway, VPS) | Socket.io requires a persistent process; Vercel Functions have duration/streaming limits |
| PostgreSQL | **External** (Neon, Supabase, AWS RDS, self-hosted) | Managed or self-hosted Postgres 15+ |
| Redis | **External** (Upstash, Redis Cloud, self-hosted) | Optional; currently used if `REDIS_URL` is set |
| File storage | **S3-compatible** (MinIO, AWS S3, R2) | Presigned upload/download URLs |
| Email | **Resend** or console dev mode | Production emails via Resend API |

---

## What goes to Vercel

Only `apps/web` is deployed to Vercel. The monorepo root is used for dependency installation (pnpm workspace), but the **Root Directory** in Vercel project settings should be `apps/web`.

### Vercel project settings

| Setting | Value |
|---------|-------|
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Install Command | `pnpm install` (auto-detected) |
| Build Command | `pnpm --filter @lets-chat/shared build && next build` |
| Output Directory | `.next` (auto-detected) |

> **Why build `@lets-chat/shared` first?** The web app depends on the workspace package `@lets-chat/shared`, which must be compiled before Next.js build.

### Required Vercel environment variables

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://api.example.com/api/v1` | Public API base URL (must include `/api/v1`) |
| `NEXT_PUBLIC_WS_URL` | `https://api.example.com` | Optional public WebSocket base URL (same origin as API, no path). If omitted or if it points to the deprecated `lets-chat-api-wa43` host, the app derives the socket URL from `NEXT_PUBLIC_API_URL` by stripping `/api/v1`. |

> **Important:** `NEXT_PUBLIC_*` variables are embedded at build time. Changing them requires a rebuild.
>
> For `lets-chat-api-v2` the correct values are:
> - `NEXT_PUBLIC_API_URL=https://lets-chat-api-v2.onrender.com/api/v1`
> - `NEXT_PUBLIC_WS_URL=https://lets-chat-api-v2.onrender.com` (or leave unset to auto-derive)

---

## What does NOT go to Vercel

- `apps/api` — Socket.io needs a persistent process
- `packages/database` — migrations run against external Postgres, not inside Vercel
- Docker Compose services — run locally or on a VM

---

## Backend host environment variables

The API host needs the following env vars (in addition to database credentials):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Yes | Min 32 characters |
| `JWT_REFRESH_SECRET` | Yes | Min 32 characters |
| `CORS_ORIGIN` | Yes | Frontend URL(s). Comma-separated for multiple origins, e.g. `https://app.vercel.app,https://preview.vercel.app` |
| `APP_WEB_URL` | Yes | Frontend URL used in email links (e.g. `https://app.vercel.app`) |
| `MAIL_PROVIDER` | Yes | `resend` or `console` |
| `MAIL_FROM` | If `resend` | Verified sender address |
| `RESEND_API_KEY` | If `resend` | Resend API key |
| `S3_ENDPOINT` | Yes | S3/MinIO endpoint |
| `S3_ACCESS_KEY` | Yes | S3 access key |
| `S3_SECRET_KEY` | Yes | S3 secret key |
| `S3_BUCKET` | Yes | Bucket name |
| `PORT` | No | Defaults to `3001` |
| `REDIS_URL` | No | Optional Redis for future adapter |

---

## CORS configuration

The API reads `CORS_ORIGIN` from environment variables:

- **HTTP CORS** (`main.ts`): uses the raw `CORS_ORIGIN` value
- **WebSocket CORS** (`websocket.gateway.ts`): splits `CORS_ORIGIN` by comma for multiple origins

For a single production origin:
```bash
CORS_ORIGIN=https://your-app.vercel.app
```

For multiple origins (production + preview):
```bash
CORS_ORIGIN=https://your-app.vercel.app,https://preview-branch.vercel.app
```

If `CORS_ORIGIN` is not set, the API falls back to `http://localhost:3000` for local development only.

---

## Local development

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start infrastructure:**
   ```bash
   docker compose up -d
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with local values
   ```

4. **Generate Prisma client:**
   ```bash
   pnpm --filter @lets-chat/database generate
   ```

5. **Run migrations:**
   ```bash
   pnpm --filter @lets-chat/database migrate
   ```

6. **Start API:**
   ```bash
   pnpm --filter api start:dev
   ```

7. **Start Web:**
   ```bash
   pnpm --filter web dev
   ```

---

## Production checklist

- [ ] **Backend deployed first** — API must be live before web build
- [ ] **Database migrated** — run `prisma migrate deploy` on production database
- [ ] **Web env vars set** — `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` point to backend HTTPS URL
- [ ] **Backend CORS allows Vercel domain** — `CORS_ORIGIN` includes production (and preview) URLs
- [ ] **APP_WEB_URL matches Vercel** — email links point to correct frontend URL
- [ ] **Resend domain verified** — sender domain is verified in Resend dashboard
- [ ] **S3 bucket configured** — file uploads work in production
- [ ] **Health endpoint checked** — `GET /api/v1/health` returns `200 ok`
- [ ] **Build passes locally** — `pnpm --filter web build` succeeds with production env vars

---

## Production URLs

| Service | URL |
|---------|-----|
| Web (Vercel) | `https://lets-chat-web.vercel.app` |
| API base | `https://lets-chat-api-v2.onrender.com/api/v1` |
| API origin | `https://lets-chat-api-v2.onrender.com` |

> ⚠️ **Active backend is `lets-chat-api-v2`.** The old `lets-chat-api-wa43` service is decommissioned and safe to delete; do not point any Vercel deploys to it.

---

## Post-deploy smoke check

After both backend and frontend are deployed, run the smoke script to verify the deployment:

**Bash:**
```bash
WEB_URL=https://lets-chat-web.vercel.app \
API_URL=https://lets-chat-api-v2.onrender.com/api/v1 \
node scripts/smoke-deploy.mjs
```

**PowerShell:**
```powershell
$env:WEB_URL="https://lets-chat-web.vercel.app"
$env:API_URL="https://lets-chat-api-v2.onrender.com/api/v1"
node scripts/smoke-deploy.mjs
```

**With authenticated workspace/channel checks (recommended):**
```bash
WEB_URL=https://lets-chat-web.vercel.app \
API_URL=https://lets-chat-api-v2.onrender.com/api/v1 \
SMOKE_ACCESS_TOKEN=<production-jwt> \
SMOKE_WORKSPACE_ID=<workspace-uuid> \
SMOKE_CHANNEL_ID=<channel-uuid> \
node scripts/smoke-deploy.mjs
```

### Required values

- `WEB_URL` — full Vercel production URL (e.g. `https://lets-chat-web.vercel.app`)
- `API_URL` — must include `/api/v1` (e.g. `https://lets-chat-api-v2.onrender.com/api/v1`)

### What the script checks (automated)

**Public endpoints (6 checks)**
1. Frontend returns `200 OK` with HTML
2. `GET /project-status` returns `200` and contains expected content
3. Backend `/health` returns `status: ok`
4. `POST /auth/forgot-password` returns generic success (no email enumeration)
5. `POST /auth/resend-verification` returns generic success
6. `GET /uploads/missing-avatar.png` returns a 200 transparent PNG

**Protected endpoints (no token) — 4 checks**
7. `GET /auth/sessions` returns `401 Unauthorized`
8. `POST /auth/sessions/revoke-all` returns `401 Unauthorized`
9. `POST /auth/sessions/revoke-others` returns `401 Unauthorized`
10. `POST /auth/change-password` returns `401 Unauthorized`

**Authenticated endpoints (when `SMOKE_ACCESS_TOKEN` and `SMOKE_WORKSPACE_ID` are set)**
11. `GET /workspaces/:id/channels` returns `200 OK` with a JSON array
12. `GET /workspaces/:id/channels/archived` returns `200 OK` with a JSON array
13. `GET /workspaces/:id/channels/:channelId` returns `200 OK` (when `SMOKE_CHANNEL_ID` is set)

> These authenticated checks catch missing-column/migration errors that public checks cannot, because the channel endpoints touch the `Channel` table.

### What still requires manual verification

- Registration email arrives in Gmail/Inbox
- Verify email link opens `/verify-email?token=...`
- Reset password email arrives
- Same-password reset shows `New password must be different from current password`

### What success means

- Frontend is reachable and serving HTML
- Backend is reachable, healthy, and responding to CORS requests from the smoke script
- Auth endpoints are functional

### Common failures and causes

| Failure | Likely Cause |
|---------|-------------|
| `WEB_URL returns 200 OK with HTML: fetch failed` | Frontend not deployed or wrong URL |
| `API health returns status ok: fetch failed` | Backend not deployed or wrong URL |
| `API health returns status ok: status 403/404` | Wrong `API_URL` path (missing `/api/v1`) |
| `POST /auth/forgot-password returns generic success: fetch failed` | CORS blocked — `CORS_ORIGIN` on backend does not include Vercel domain |
| `API health: body.status = degraded` | Database connection failing — migrations not applied or wrong `DATABASE_URL` |
| `GET /workspaces/:id/channels returns 500` | Missing database column — run `prisma migrate deploy` against production before deploying code that uses the column |

---

## Render API v2 service settings

These are the dashboard settings for the active backend service `lets-chat-api-v2`. If auto-deploy is not working, verify each value in the Render dashboard:

| Setting | Value | Notes |
|---------|-------|-------|
| Service name | `lets-chat-api-v2` | Active backend; old `lets-chat-api-wa43` is decommissioned |
| Region | `Frankfurt (EU Central)` | Closest to primary users |
| Runtime | `Node` | Required for persistent Socket.io process |
| Branch | `main` | Auto-deploy watches this branch |
| Root Directory | `.` (repo root) | Monorepo build runs from root |
| Build Command | `pnpm install --prod=false && pnpm run build:api:prod` | Installs dev deps needed for build; `--include=dev` previously failed on Render |
| Start Command | `pnpm --filter api start:prod` | Runs compiled NestJS app. Database migrations are **not** run automatically; see the production migration strategy below. |
| Health Check Path | `/api/v1/health` | Render uses this for liveness |
| Auto-deploy | `Off` | Verified: deploys are triggered only by the GitHub Actions Render Deploy Hook |
| Plan | `Free` | Cold start ~1 min after sleep |

### Deploy strategy (B190 + B197A + B199)

GitHub Actions is the source of truth for both migrating the production database and deploying `lets-chat-api-v2`:

1. Push to `main` triggers the `CI` workflow.
2. After lint, typecheck, tests, and builds pass, the `migrate` job runs.
3. The `migrate` job runs `prisma migrate deploy` against production using the `PRODUCTION_DATABASE_URL` secret.
4. Only if the migration succeeds, the `deploy` job POSTs to the Render Deploy Hook stored in `RENDER_API_V2_DEPLOY_HOOK_URL`.
5. Render starts a new deploy for the latest commit.

If `PRODUCTION_DATABASE_URL` is missing, the `migrate` job prints a clear warning, sets `should_deploy=false`, and the `deploy` job is skipped. This prevents accidentally deploying code that depends on an unmigrated schema.

#### CI/CD action versions (B199)

The workflow was cleaned up in B199 to use Node.js 24-compatible action runtimes and remove deprecation warnings:

| Action | Version | Purpose |
|--------|---------|---------|
| `actions/checkout` | `v6` | Repository checkout (Node.js 24 runtime) |
| `pnpm/action-setup` | `v6` | Install pnpm (reads `packageManager` from `package.json`) |
| `actions/setup-node` | `v6` | Install Node.js and enable pnpm cache |

The project continues to build with Node.js 20 (`node-version: 20`) for compatibility with the current `engines` field and `@types/node` version. The package manager is pinned to `pnpm@9.1.0` via `package.json#packageManager`, so CI uses the same pnpm major as local development.

Required GitHub secrets remain unchanged:

- `PRODUCTION_DATABASE_URL` — used by the `migrate` job.
- `RENDER_API_V2_DEPLOY_HOOK_URL` — used by the `deploy` job.

Render Auto-Deploy stays **Off**; the `deploy` job is the only automatic deploy path.

> **Important:** `render.yaml` in this repo is **not authoritative** for the already-created `lets-chat-api-v2` Render service. The actual build/start commands, health-check path, and auto-deploy setting are controlled by the Render dashboard. Keep the dashboard Start Command set to `pnpm --filter api start:prod` and let GitHub Actions handle migrations.

### Production migration strategy (B197A)

Migrations must run **before** the new API code starts serving traffic. The chosen strategy is a **GitHub Actions migration job**.

**Why this is safer than the failed B197 attempt:**

- Migrations run in a dedicated CI job with explicit logs, not inside an unobserved container start.
- The Render deploy hook is called **only after** `migrate:deploy` exits successfully. If the migration fails, production keeps running the previous API version.
- It does not depend on Render dashboard command changes, which may not apply to an existing service.
- It keeps schema changes and code changes in the same `main` branch commit/PR, but applies them in the correct order automatically.

**Pipeline order:**

```text
push main → CI (lint/typecheck/test/build)
          → migrate (prisma migrate deploy with PRODUCTION_DATABASE_URL)
          → deploy (Render hook, only if migrate succeeded)
          → smoke (authenticated workspace/channel checks)
```

**Alternatives (not the primary strategy):**

- **Render dashboard start command:** change the dashboard Start Command to `pnpm --filter @lets-chat/database migrate:deploy && pnpm --filter api start:prod`. This also runs migrations before the API boots, but it is harder to observe and depends on someone remembering to update the dashboard.
- **Manual migration gate:** run `pnpm --filter @lets-chat/database migrate:deploy` locally with `DATABASE_URL` set to production, verify success, then trigger Render deploy. Acceptable for emergencies, but not automatic.

Never deploy API code that references a column that has not yet been created in production.

### One-time setup: GitHub secrets

Two secrets are required for the full B197A pipeline:

1. `PRODUCTION_DATABASE_URL`
   - In the GitHub repo, go to **Settings** → **Secrets and variables** → **Actions**.
   - Click **New repository secret**.
   - Name: `PRODUCTION_DATABASE_URL`
   - Value: the production PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/db?schema=public`).
   - Save.

2. `RENDER_API_V2_DEPLOY_HOOK_URL`
   - Open the Render dashboard for `lets-chat-api-v2`.
   - Go to **Settings** → **Deploy Hook**.
   - Create a deploy hook and copy the URL (it looks like `https://api.render.com/deploy/srv-...?key=...`).
   - Set **Auto-Deploy** to **No** so the GitHub Actions hook is the only automatic deploy path.
   - In the GitHub repo, add a secret named `RENDER_API_V2_DEPLOY_HOOK_URL` with the copied URL.

### Verification

After both secrets are set:

1. Push any commit to `main` (or use workflow dispatch if enabled).
2. Open the GitHub Actions run and confirm:
   - the `migrate` job ran and reported `✅ Production migrations applied successfully.`;
   - the `deploy` job ran and reported `✅ Render deploy hook accepted`.
3. Open the Render dashboard **Events** tab and confirm a deploy started for the latest commit.
4. Wait for the service to show **Live**.
5. Run the smoke script with authenticated checks:
   ```bash
   WEB_URL=https://lets-chat-web.vercel.app \
   API_URL=https://lets-chat-api-v2.onrender.com/api/v1 \
   SMOKE_ACCESS_TOKEN=<jwt> \
   SMOKE_WORKSPACE_ID=<uuid> \
   SMOKE_CHANNEL_ID=<uuid> \
   node scripts/smoke-deploy.mjs
   ```
6. Verify `GET https://lets-chat-api-v2.onrender.com/api/v1/health` returns `status: ok`.

### Fallback if a secret is not configured

- If `PRODUCTION_DATABASE_URL` is missing: the `migrate` job warns and skips, and the `deploy` job does **not** run. Set the secret before the next schema-changing push.
- If `RENDER_API_V2_DEPLOY_HOOK_URL` is missing: the deploy job warns and skips. Enable Render **Auto-Deploy** only as a temporary fallback, then set the secret and disable auto-deploy.

### Migration safety checklist

Use this checklist whenever a new Prisma migration is added (e.g. B197B):

- [ ] Migration file is committed together with the code that uses it.
- [ ] `pnpm --filter @lets-chat/database migrate:deploy` succeeds locally against a fresh database.
- [ ] `pnpm run build:api:prod` passes.
- [ ] Smoke script passes locally (no authenticated checks needed for pure schema additions).
- [ ] `PRODUCTION_DATABASE_URL` secret is set in GitHub Actions.
- [ ] `RENDER_API_V2_DEPLOY_HOOK_URL` secret is set in GitHub Actions.
- [ ] After push, confirm the `migrate` job succeeds before the `deploy` job starts.
- [ ] After deploy, run the smoke script with `SMOKE_ACCESS_TOKEN` and `SMOKE_WORKSPACE_ID`.
- [ ] Open the production UI and verify workspace/channel lists load without errors.

### Environment variables required on Render

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Min 32 characters |
| `JWT_REFRESH_SECRET` | Min 32 characters |
| `CORS_ORIGIN` | Include `https://lets-chat-web.vercel.app` and any preview domains |
| `APP_WEB_URL` | `https://lets-chat-web.vercel.app` |
| `MAIL_PROVIDER` | `resend` or `console` |
| `MAIL_FROM` | Verified sender address |
| `RESEND_API_KEY` | Resend API key |
| `S3_ENDPOINT` | S3/MinIO endpoint |
| `S3_ACCESS_KEY` | S3 access key |
| `S3_SECRET_KEY` | S3 secret key |
| `S3_BUCKET` | Bucket name |
| `PORT` | `3001` (matches start command) |

---

## Decommissioning the old Render backup service

The `lets-chat-api-wa43` Render service was created as a temporary emergency
fallback during the API v2 migration. As of B187 the migration is finalized:
`lets-chat-api-v2` is the only active backend for both HTTP and WebSocket traffic,
and `lets-chat-api-wa43` can be deleted.

> ✅ **Migration status (B187):** production verified on `lets-chat-api-v2`;
> no HTTP, WebSocket, code, or env references to `lets-chat-api-wa43` remain;
> old service is safe to delete.

### Pre-decommission checklist

- [ ] Vercel production/preview env vars point to `https://lets-chat-api-v2.onrender.com/api/v1`.
- [ ] Vercel `NEXT_PUBLIC_WS_URL` is unset, or points to `https://lets-chat-api-v2.onrender.com`, and does **not** reference `lets-chat-api-wa43.onrender.com`.
- [ ] No code, docs, or scripts reference `lets-chat-api-wa43.onrender.com` as an active URL.
- [ ] Smoke script passes against `lets-chat-api-v2`.
- [ ] `GET https://lets-chat-api-v2.onrender.com/api/v1/health` returns `status: ok`.
- [ ] Normal logged-in usage (login, workspaces, channels, DMs, search) works on production.
- [ ] Browser DevTools shows no WebSocket connection attempts to `lets-chat-api-wa43.onrender.com`.

### Safe decommission path

1. Open the Render dashboard for `lets-chat-api-wa43`.
2. Choose **Suspend** (or **Pause service**) instead of immediate delete.
3. Monitor production for 24–48 hours.
4. If everything is stable, return to the dashboard and **Delete** the service.

### Immediate delete path

Only use this if the pre-decommission checklist is fully green and you accept
the small risk of losing the rollback option:

1. Confirm all checklist items above.
2. Open the Render dashboard for `lets-chat-api-wa43`.
3. Click **Delete** and confirm.

> ⚠️ Do **not** suspend or delete `lets-chat-api-v2`. That is the active
> production backend.

---

## No `vercel.json` required

This project does **not** need a `vercel.json` file. Vercel auto-detects Next.js from `apps/web/package.json`. The only extra configuration is the **Build Command** in the Vercel dashboard to compile the workspace dependency `@lets-chat/shared` before building the Next.js app.

If you prefer a root-level config, you can create `vercel.json` at the repo root with:

```json
{
  "buildCommand": "pnpm --filter @lets-chat/shared build && pnpm --filter web build",
  "installCommand": "pnpm install"
}
```

But this is optional — dashboard settings are sufficient.
