# Local Development Guide

This guide runs LetsChat entirely on your own computer using Docker for Postgres, Redis and MinIO. It does **not** use Render Postgres.

> **Render is deprecated for this project.** The Render Postgres free tier has expired and the production API is no longer reachable. Local development with Docker is now the source of truth. The Vercel frontend deployment may still be online, but it is **not a fully working production site** without a public API and database. To go back to public production later you will need a hosted Postgres provider and a hosted API (e.g., Render paid plan, Railway, Fly.io, AWS, Google Cloud, etc.).

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (Windows) with the WSL2 backend enabled
- PowerShell

## 1. Install dependencies

```powershell
pnpm install
```

## 2. Configure environment

Copy the example environment file. The example already points at the local Docker Postgres and local Redis declared in `docker-compose.yml`.

```powershell
Copy-Item .env.example .env
```

Example local database URL (no real secrets):

```text
DATABASE_URL=postgresql://letschat:letschat@localhost:5432/letschat_local?schema=public
```

> Do not edit `.env` to put a production Render database URL here. Keep local and production credentials separate.

## 3. Start local infrastructure

```powershell
# Shortcut that starts Postgres + Redis + MinIO + Mailpit
pnpm db:local:up

# Equivalent raw command:
# docker compose up -d postgres redis minio mailpit
```

Wait a few seconds for Postgres to report healthy. MinIO is required because the API validates its S3 storage configuration on startup. Mailpit catches all outgoing SMTP mail so you can verify registration emails locally.

## 4. Generate Prisma client and run migrations

```powershell
pnpm db:generate
pnpm db:migrate:local
```

Raw equivalents:

```powershell
pnpm --filter @lets-chat/database generate
pnpm --filter @lets-chat/database migrate:deploy
```

## 5. (Optional) Seed a local verifier account

```powershell
pnpm db:seed:local
```

This creates one pre-verified local account:

- Email: `local-verifier@example.com`
- Username: `localverifier`
- Password: `LocalDevPass123!`

Use it to skip email verification during local manual testing. The password is intentionally public and local-only.

## 6. Start the API

In a PowerShell window:

```powershell
pnpm dev:api

# Equivalent raw command:
# pnpm --filter api start:dev
```

Wait for the NestJS bootstrap logs to finish.

## 7. Start the Web app

In a second PowerShell window:

```powershell
pnpm dev:web

# Equivalent raw command:
# pnpm --filter web dev
```

## 8. Verify local setup

API health:

```powershell
curl http://localhost:3001/api/v1/health
```

API version:

```powershell
curl http://localhost:3001/api/v1/version
```

Open the web app: http://localhost:3000

## 9. Manual register → verify → login flow (Mailpit)

The local `.env` uses Mailpit as the SMTP target, so verification emails are caught by Mailpit instead of being sent over the internet.

1. Make sure Mailpit is running:

   ```powershell
   docker compose ps mailpit
   ```

2. Open the Mailpit inbox in your browser:

   ```text
   http://localhost:8025
   ```

3. In the web app, register a new local account, for example:

   - Email: `local-test-001@example.com`
   - Username: `localtest001`
   - Password: `LocalTestPass123!`

4. After submitting registration, the app shows the "check your email" state. Switch to the Mailpit tab and refresh — you will see the verification email.

5. Open the email and click the **Verify Email Address** button (or copy the `verify-email?token=...` link). The browser opens `http://localhost:3000/verify-email?token=...` and confirms verification.

6. Go to **Login**, enter the same email and password, and sign in. The app should open the dashboard.

If the verification link expires, go back to the login page, enter the credentials, and use the **Resend verification email** action.

## 10. Automated local smoke test

A headless register → verify → login smoke test is also available:

```powershell
pnpm smoke:local
```

This requires the API (`pnpm dev:api`) and local infrastructure to be running. It creates a random test account, reads the verification email from Mailpit, calls the verify endpoint, and logs in.

## Optional: MinIO for attachment testing

Mailpit, MinIO, Postgres and Redis are all started by `pnpm db:local:up`. To test file attachments locally, make sure MinIO is running (it is started by the shortcut). The `.env.example` already points at the local MinIO instance.

## Optional: Redis-backed adapters

Redis is started by `pnpm db:local:up`. By default the API uses in-memory Socket.io and presence stores, which is fine for local development. To use Redis instead, uncomment the relevant `*_REDIS_URL` lines in `.env`.

## Reset the local database

This wipes local data and recreates a clean database:

```powershell
pnpm db:local:reset
pnpm db:migrate:local
```

Raw equivalent:

```powershell
docker compose down -v
docker compose up -d postgres redis minio mailpit
pnpm --filter @lets-chat/database migrate:deploy
```

To stop infrastructure without deleting data:

```powershell
pnpm db:local:down
```

## Running checks locally

```powershell
pnpm lint
pnpm typecheck
pnpm --filter api test
pnpm --filter web test
pnpm run build:api:prod
pnpm --filter web build
```

## CI and Render status

GitHub Actions now runs the standard CI (lint, typecheck, tests, builds, API E2E with a local Postgres service, and a local infrastructure smoke test) on every push and pull request.

The Render production migration/deploy jobs and the production verifier workflows have been moved to **manual `workflow_dispatch` only**. They are kept for recovery purposes but will not run automatically and will not turn the main CI red while Render is disabled.

## Important warnings

- **Local Postgres is for local development and demo use only.** Do not expose the Docker Postgres port to the internet or connect a production Render API service to a database running on your home PC.
- **For public production, use a hosted Postgres provider** (e.g., Render Postgres, Supabase, AWS RDS, Google Cloud SQL) with strong credentials and TLS.
- **Never commit `.env` files.** `.env.example` contains only safe local-only placeholders.
- **Do not reuse the local seed password anywhere else.** It is intentionally public.
