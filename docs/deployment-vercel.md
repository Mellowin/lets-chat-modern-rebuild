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
| `NEXT_PUBLIC_WS_URL` | `https://api.example.com` | Public WebSocket base URL (same origin as API, no path) |

> **Important:** `NEXT_PUBLIC_*` variables are embedded at build time. Changing them requires a rebuild.

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
| API base | `https://lets-chat-api-wa43.onrender.com/api/v1` |
| API origin | `https://lets-chat-api-wa43.onrender.com` |

> ⚠️ **Do not use** `lets-chat-api-w43.onrender.com`; the correct host is `lets-chat-api-wa43.onrender.com`.

---

## Post-deploy smoke check

After both backend and frontend are deployed, run the smoke script to verify the deployment:

**Bash:**
```bash
WEB_URL=https://lets-chat-web.vercel.app \
API_URL=https://lets-chat-api-wa43.onrender.com/api/v1 \
node scripts/smoke-deploy.mjs
```

**PowerShell:**
```powershell
$env:WEB_URL="https://lets-chat-web.vercel.app"
$env:API_URL="https://lets-chat-api-wa43.onrender.com/api/v1"
node scripts/smoke-deploy.mjs
```

### Required values

- `WEB_URL` — full Vercel production URL (e.g. `https://lets-chat-web.vercel.app`)
- `API_URL` — must include `/api/v1` (e.g. `https://lets-chat-api-wa43.onrender.com/api/v1`)

### What the script checks (automated)

**Public endpoints**
1. Frontend returns `200 OK` with HTML
2. Backend `/health` returns `status: ok`
3. `POST /auth/forgot-password` returns generic success (no email enumeration)
4. `POST /auth/resend-verification` returns generic success
5. `API_URL` does not contain the wrong Render host `lets-chat-api-w43.onrender.com`

**Protected endpoints (no token)**
6. `GET /auth/sessions` returns `401 Unauthorized`
7. `POST /auth/sessions/revoke-all` returns `401 Unauthorized`
8. `POST /auth/change-password` returns `401 Unauthorized`

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
