# Secure Team Collaboration Platform

> Modern full-stack rebuild of the archived [`lets-chat`](https://github.com/sdelements/lets-chat) app, focused on **authentication**, **private-channel authorization**, **real-time messaging**, and **test coverage**.

---

## 🚀 Production Demo

- **Frontend:** https://lets-chat-web.vercel.app
- **Backend:** https://lets-chat-api-v2.onrender.com/api/v1
- **WebSocket:** wss://lets-chat-api-v2.onrender.com

See [`docs/portfolio-demo.md`](docs/portfolio-demo.md) for a step-by-step demo guide and [`docs/portfolio-summary.md`](docs/portfolio-summary.md) for a resume-ready summary, screenshots, and interview talking points.

---

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| **Backend** | NestJS 11, TypeScript, Prisma ORM, PostgreSQL 15 |
| **Real-Time** | Socket.io 4, in-memory presence |
| **Storage** | MinIO / S3-style storage module (presigned URLs) |
| **Testing** | Jest (API), Vitest + Testing Library (Web), Supertest (E2E) |
| **CI/CD** | GitHub Actions — lint, typecheck, tests, builds; Render Deploy Hook after green CI |

---

## Key Features

### Backend

- 🔐 **JWT Auth** — access/refresh token rotation, bcrypt, per-tab sessionStorage
- 🏢 **Workspaces** — multi-tenant teams with OWNER/ADMIN/MEMBER roles
- 💬 **Channels** — public and private with authorization guards
- 💬 **Messages** — CRUD, soft delete, 15-minute edit window
- ⚡ **Real-Time** — Socket.io rooms, message broadcasts, typing indicators, presence
- 💬 **Direct Messages** — 1-to-1 conversations with participant-only access
- ⚡ **Reactions** — emoji reactions with toggle/replace (one per user)
- 🔁 **Replies & Forwarding** — thread replies and message forwarding between channels
- 👁️ **Read Receipts** — message read tracking per user
- 🔤 **Localization** — English, Ukrainian, Russian
- 🔒 **WebSocket Security** — typing revalidates channel access; revoked access triggers auto-leave
- 📋 **Audit Log** — immutable trail for member/invite/ownership actions
- 📨 **Invites** — token-based email/username invites and public invite links with `maxUses`
- 📎 **Attachments** — file picker / drag-and-drop, upload progress, retry, presigned URLs, inline image previews, secure downloads
- 🔍 **Search** — global, workspace, and channel message search with highlighting and jump-to-message
- 🖥️ **Session Management** — list active sessions, revoke others, current-session protection

### Frontend

- 🔐 **Auth Flow** — login, register, logout with sessionStorage isolation
- 🏢 **Workspaces** — create, list, manage members and roles
- 💬 **Channels** — public/private, create, archive/restore, role-aware member management
- ✏️ **Messages** — send (Enter), edit within 15 min, soft delete, reply, forward
- ⚡ **Live Updates** — message created/updated/deleted/reaction changes via WebSocket
- 💬 **Direct Messages** — 1-to-1 chat with real-time delivery
- 🔍 **Search** — global, workspace, and channel message search
- 📎 **Attachments** — upload images/files with previews, progress, retry
- 🌍 **Localization** — switch between EN / UK / RU
- ⌨️ **Typing Indicators** — live typing status in channels and DMs
- 👁️ **Read Receipts** — message seen status
- 🖥️ **Session Management** — Profile → Sessions, revoke others, current-session badge
- 🌐 **Cyrillic Support** — usernames and workspace names with auto-transliteration

---

## Security & Authorization

- **Private channels** return `404` for non-members — no information leakage
- **Message edit** restricted to author and 15-minute window
- **Message delete** restricted to author, admins, and owners
- **Direct messages** accessible only to conversation participants
- **Channel update/archive** enforced by role (OWNER/ADMIN only)
- **WebSocket typing** revalidates membership on every event; revoked access forces room leave and presence cleanup

---

## Testing & CI

| Suite | Count | Status |
|-------|-------|--------|
| API Unit Tests | 716 (32 suites) | ✅ passing |
| Web Unit Tests | 677 (29 files) | ✅ passing |
| Web Page Tests | 239 (2 files) | ✅ passing |
| E2E Security Smoke Tests | 7 (2 suites) | ✅ passing locally |

- **CI:** GitHub Actions green for unit tests, builds, and lint
- **E2E:** requires Docker PostgreSQL; not yet integrated into CI workflow

---

## Project Structure

```
secure-collab-platform/
├── apps/
│   ├── api/                 # NestJS backend
│   └── web/                 # Next.js frontend
├── packages/
│   ├── shared/              # Shared types & utilities
│   └── database/            # Prisma schema, client, migrations
├── docker-compose.yml       # PostgreSQL, Redis, MinIO
├── docs/
│   ├── project-status.md    # Current state & QA results
│   ├── portfolio-demo.md    # Portfolio demo guide & screenshots checklist
│   └── ...
└── README.md
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Docker Desktop

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

### 3. Start infrastructure

```bash
docker compose up -d
```

### 4. Run database migrations

```bash
pnpm --filter @lets-chat/database migrate
```

### 5. Generate Prisma Client

```bash
pnpm --filter @lets-chat/database generate
```

### 6. Start API (development)

```bash
pnpm --filter api start:dev
```

### 7. Start Web (development)

```bash
pnpm --filter web dev
```

**Environment variable (if needed):**

```powershell
# PowerShell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/letschat?schema=public"
```

```bash
# Bash / macOS / Linux
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/letschat?schema=public"
```

**Verify:**

- Health: `GET http://localhost:3001/api/v1/health`
- Swagger: `http://localhost:3001/api/docs`
- Web app: `http://localhost:3000`

---

## Running Tests

```bash
# API unit tests
pnpm --filter api test

# API E2E tests (requires Docker PostgreSQL)
pnpm --filter api test:e2e

# Web unit tests
pnpm --filter web test

# Web page-level tests
pnpm --filter web test:pages

# Lint
pnpm --filter api lint
pnpm --filter web lint

# Type check
pnpm --filter api typecheck
pnpm --filter web typecheck

# Build
pnpm --filter api build
pnpm --filter web build
```

---

## Current Limitations

> This is a **portfolio-grade rebuild**, not production-ready software.

- **Free Render instance may cold-start** — first request after sleep can take ~1 min
- **E2E tests are local-only** — CI workflow lacks a PostgreSQL service
- **No broad E2E coverage** beyond private-channel authorization smoke tests
- **Presence is in-memory** — no Redis Socket.io adapter yet
- **No push/browser notifications** yet
- **No cursor pagination** — limit-based pagination for messages and logs
- **Email delivery depends on a verified Resend domain** — otherwise auth flows use console/dev mode
- **API-domain favicon 404** is harmless
- **Disposable QA test account** (`b188-session-test-1781544153@web-library.net`) remains in production but has no workspaces, DMs, or channel memberships

---

## Deployment

See [`docs/deployment-vercel.md`](docs/deployment-vercel.md) for full instructions.

```text
push main
    ↓
GitHub Actions CI (lint, typecheck, tests, builds)
    ↓
Deploy API v2 to Render job → POST Render Deploy Hook
    ↓
Render deploys lets-chat-api-v2
    ↓
GET /api/v1/health → ok
```

- **Frontend** (`apps/web`) → Vercel (auto-deploys on `main`)
- **Backend** (`apps/api`) → Render `lets-chat-api-v2` via GitHub Actions hook only (Auto-Deploy disabled)
- **Old service** `lets-chat-api-wa43` is decommissioned and returns 404
- **Database** → External PostgreSQL 15+

---

## Roadmap

- [ ] Add screenshots and short demo video
- [ ] Integrate E2E tests into CI with PostgreSQL service
- [ ] Redis Socket.io adapter for multi-server presence
- [ ] Cursor-based pagination for messages and audit logs
- [ ] Silent token refresh for expired access tokens
- [ ] Push/browser notifications

---

## License

MIT (same as original lets-chat)
