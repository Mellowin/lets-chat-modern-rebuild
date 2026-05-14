# Secure Team Collaboration Platform

> **Modern rebuild** of [`sdelements/lets-chat`](https://github.com/sdelements/lets-chat) — a self-hosted chat app for small teams.

---

## Overview

This project is a ground-up rebuild of the archived **lets-chat** application (~9.8k ⭐), transforming a 2014-era Node/MongoDB/jQuery codebase into a production-oriented, secure team collaboration platform using modern best practices.

**Original:** Node 0.10.x + Express.oi + Mongoose + MongoDB + Nunjucks  
**Modern:** Node 20 + NestJS 11 + Prisma 5.14 + PostgreSQL 15 + Redis 7 + Next.js 16 + React 19 + Socket.io 4

---

## Key Features (MVP)

### Backend (implemented)

- 🔐 **Secure Auth** — JWT access/refresh tokens, bcrypt, rate limiting, brute-force protection
- 🏢 **Workspaces** — Multi-tenant team organization with role-based access (OWNER/ADMIN/MEMBER)
- 💬 **Channels** — Public and private channels with permission guards
- 💬 **Messages** — CRUD, soft delete, edit history, threaded replies
- 😀 **Reactions** — Emoji reactions with grouped counts
- 👁️ **Read Receipts** — Idempotent mark-as-read
- 📎 **File Uploads** — Direct-to-MinIO via presigned URLs
- 🔍 **Full-Text Search** — PostgreSQL `tsvector` + GIN index
- 📨 **Invites** — Token-based invites with SHA-256 hash, email match, race-hardened accept/revoke
- 👥 **Members** — List, role update, soft-delete removal, ownership transfer
- 📋 **Audit Log** — Immutable compliance trail for member/invite/ownership actions with listing endpoint
- ⚡ **Real-Time** — Socket.io 4 with auth, channel rooms, message/reaction/read broadcasts, typing indicators, in-memory presence
- 🐳 **Docker Compose** — One-command local development stack (PostgreSQL, Redis, MinIO)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS 11, TypeScript 5.7 |
| **Frontend** | Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui |
| **Database** | PostgreSQL 15 |
| **ORM** | Prisma 5.14 |
| **Cache / PubSub** | Redis 7 |
| **Real-Time** | Socket.io 4 + Redis Adapter |
| **Queue** | Bull (Redis-backed) |
| **Testing** | Jest, Playwright |
| **Docs** | Swagger / OpenAPI |

---

## Project Structure

```
secure-collab-platform/
├── apps/
│   ├── api/                 # NestJS backend
│   └── web/                 # Next.js frontend
├── packages/
│   ├── shared/              # Shared types & utilities
│   └── database/            # Prisma schema & migrations
├── docker-compose.yml
└── docs/
    ├── legacy-analysis.md   # Original lets-chat analysis
    ├── scope.md             # MVP scope definition
    ├── before-after.md      # Legacy → Modern comparison
    └── architecture.md      # ADRs & ER diagrams
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Docker Desktop

### Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# 3. Run database migrations
cd packages/database
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/letschat?schema=public"
pnpm exec prisma migrate dev

# 4. Generate Prisma Client
pnpm exec prisma generate

# 5. Build and start API
cd ../..
pnpm --filter api build
pnpm --filter api start:dev
```

**Verify:**
- Health: `GET http://localhost:3001/api/v1/health`
- Swagger: `http://localhost:3001/api/docs`

### Running Tests

```bash
# API unit tests
pnpm --filter api test

# Type check
pnpm --filter api build
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/legacy-analysis.md`](docs/legacy-analysis.md) | Deep analysis of original lets-chat codebase |
| [`docs/scope.md`](docs/scope.md) | Locked MVP scope with success criteria |
| [`docs/before-after.md`](docs/before-after.md) | Technology & architecture comparison |
| [`docs/architecture.md`](docs/architecture.md) | ADRs, ER diagrams, deployment model |

---

## Backend Status

| Module | Status | Notes |
|--------|--------|-------|
| Auth | ✅ | Register, login, refresh, logout, JWT guards |
| Workspaces | ✅ | CRUD, archive, ownership transfer |
| Channels | ✅ | Public/private, CRUD, archive |
| Messages | ✅ | CRUD, soft delete, edit history, replies |
| Reactions | ✅ | Add/remove, grouped counts, race handling |
| Read Receipts | ✅ | Mark read, list, idempotent |
| Search | ✅ | FTS with GIN index, channel-scoped |
| Attachments | ✅ | Presign, complete, download |
| WebSocket | ✅ | Auth, rooms, broadcasts, typing, presence |
| Invites | ✅ | Create, accept, revoke, list, audit |
| Members | ✅ | List, role update, remove, audit |
| Audit Logs | ✅ | Write + list endpoint, OWNER/ADMIN read |

## Current Limitations

- **No frontend MVP yet** — UI work is the next milestone
- **No email invite delivery** — invite tokens must be shared manually
- **Audit write is not transactional** — audit records are written after the main action succeeds
- **No cursor pagination** — audit logs, messages, and search use simple limit-based pagination
- **No Redis WebSocket adapter** — presence is in-memory only; server restart clears state
- **No CI / E2E tests** — only unit tests are implemented
- **No production Docker Compose** — local dev stack only

## Roadmap

- [x] Phase 0: Legacy analysis & scope definition
- [x] Phase 1–2: Backend architecture, database design & NestJS API implementation
- [ ] Phase 3: Next.js frontend & real-time integration
- [ ] Phase 4: Email delivery, notifications, cursor pagination
- [ ] Phase 5: CI/CD, E2E tests, deployment, demo

**v2 Ideas:** WebRTC voice channels, AI thread summarization, GitHub/GitLab integrations

---

## License

MIT (same as original lets-chat)

---

*Built with respect for the original creators at Security Compass.*
