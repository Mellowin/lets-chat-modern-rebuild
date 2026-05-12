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

**GET** `/api/v1/health`

Expected: `200 OK`

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

### 2. Register

**POST** `/api/v1/auth/register`

Body:

```json
{
  "email": "user@example.com",
  "username": "john_doe",
  "password": "SecurePass123!"
}
```

| Scenario | Expected |
|----------|----------|
| Valid data | `201 Created` + user object, accessToken, refreshToken |
| Duplicate email | `409 Conflict` — Email or username already in use |
| Duplicate username | `409 Conflict` — Email or username already in use |
| Invalid email format | `400 Bad Request` — Validation failed |
| Short password (< 8) | `400 Bad Request` — Validation failed |
| Extra field in body | `400 Bad Request` — Validation failed |

### 3. Login

**POST** `/api/v1/auth/login`

Body:

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

| Scenario | Expected |
|----------|----------|
| Valid credentials | `200 OK` + user object, accessToken, refreshToken |
| Wrong password | `401 Unauthorized` — Invalid credentials |
| Unknown email | `401 Unauthorized` — Invalid credentials |
| Invalid email format | `400 Bad Request` — Validation failed |
| Extra field in body | `400 Bad Request` — Validation failed |

### 4. Get Current User

**GET** `/api/v1/auth/me`

Headers:

```
Authorization: Bearer <accessToken>
```

| Scenario | Expected |
|----------|----------|
| Valid token | `200 OK` + `{ id, email, username, createdAt }` |
| Missing token | `401 Unauthorized` — Access token missing |
| Invalid token | `401 Unauthorized` — Invalid or expired access token |

### 5. Refresh Token

**POST** `/api/v1/auth/refresh`

Body:

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Scenario | Expected |
|----------|----------|
| Valid refresh token | `200 OK` + user object, new accessToken, new refreshToken |
| Reuse old refresh token | `401 Unauthorized` — Refresh token not found or revoked |
| Invalid refresh token | `401 Unauthorized` — Invalid or expired refresh token |
| Short/missing token | `400 Bad Request` — Validation failed |

### 6. Logout

**POST** `/api/v1/auth/logout`

Body:

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Scenario | Expected |
|----------|----------|
| Valid logout | `200 OK` + `{ success: true }` |
| Refresh after logout | `401 Unauthorized` — Refresh token not found or revoked |
| Repeated logout | `200 OK` + `{ success: true }` |
| Short/missing token | `400 Bad Request` — Validation failed |

### 7. API Documentation (Swagger)

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
