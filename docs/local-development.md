# Local Development Guide

This guide runs LetsChat entirely on your own computer using Docker for Postgres and Redis. It does **not** use Render Postgres.

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
# Shortcut that starts Postgres + Redis + MinIO
pnpm db:local:up

# Equivalent raw command:
# docker compose up -d postgres redis minio
```

Wait a few seconds for Postgres to report healthy. MinIO is required because the API validates its S3 storage configuration on startup.

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

You can register a new account locally. With `MAIL_PROVIDER=console` (the default in `.env.example`), verification emails are printed in the API terminal instead of being sent.

## Optional: MinIO for attachment testing

The docker-compose file also includes MinIO. To test file attachments locally, start it too:

```powershell
docker compose up -d minio
```

The `.env.example` already points at the local MinIO instance.

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
docker compose up -d postgres redis minio
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

## Important warnings

- **Local Postgres is for local development and demo use only.** Do not expose the Docker Postgres port to the internet or connect a production Render API service to a database running on your home PC.
- **For public production, use a hosted Postgres provider** (e.g., Render Postgres, Supabase, AWS RDS, Google Cloud SQL) with strong credentials and TLS.
- **Never commit `.env` files.** `.env.example` contains only safe local-only placeholders.
- **Do not reuse the local seed password anywhere else.** It is intentionally public.
