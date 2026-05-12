# Developer Checklist

## Prerequisites

- Node.js 20+
- pnpm
- Docker Desktop

## Initial Setup

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# Run database migrations
cd packages/database
npx prisma migrate dev
```

## Start API

```bash
pnpm --filter api start:dev
```

## Verify

### 1. Health Check

Open: http://localhost:3001/api/v1/health

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-05-12T...",
  "uptime": 1.23,
  "environment": "development",
  "database": "ok",
  "requestId": "..."
}
```

- `status: "ok"` — API is healthy.
- `database: "ok"` — PostgreSQL connection works.
- `database: "error"` — check PostgreSQL container (`docker compose ps`) and DATABASE_URL in `.env`.

### 2. API Documentation (Swagger)

Open: http://localhost:3001/api/docs

- Lists all registered endpoints.
- Try out requests directly from the browser.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `database: "error"` in health | Ensure `docker compose up -d` ran and PostgreSQL is healthy. Check `DATABASE_URL` in `.env`. |
| Migration fails | Ensure PostgreSQL is running. Run `npx prisma migrate dev` from `packages/database`. |
| Port 3001 in use | Set `PORT=3002` in `.env` or kill the process using port 3001. |
| Swagger 404 | Ensure `pnpm --filter api build` passes and the server restarted. |
