# Secure Team Collaboration Platform

> **Modern rebuild** of [`sdelements/lets-chat`](https://github.com/sdelements/lets-chat) — a self-hosted chat app for small teams.

---

## Overview

This project is a ground-up rebuild of the archived **lets-chat** application (~9.8k ⭐), transforming a 2014-era Node/MongoDB/jQuery codebase into a production-oriented, secure team collaboration platform using modern best practices.

**Original:** Node 0.10.x + Express.oi + Mongoose + MongoDB + Nunjucks  
**Modern:** Node 20 + NestJS + Prisma + PostgreSQL + Redis + Next.js 14 + Socket.io 4

---

## Key Features (MVP)

- 🔐 **Secure Auth** — JWT access/refresh tokens, bcrypt, rate limiting, brute-force protection
- 🏢 **Workspaces** — Multi-tenant team organization with role-based access
- 💬 **Channels** — Public and private channels with permission guards
- ⚡ **Real-Time Messaging** — Socket.io 4 with Redis adapter for horizontal scaling
- 🧵 **Threads** — Reply in threaded conversations
- 😀 **Reactions** — Emoji reactions on messages
- 📎 **File Uploads** — Direct-to-S3/MinIO via presigned URLs
- 🔍 **Full-Text Search** — PostgreSQL `tsvector` + GIN index
- 📋 **Audit Log** — Immutable compliance trail for all actions
- 🐳 **Docker Compose** — One-command local development stack

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS 10, TypeScript 5.4 |
| **Frontend** | Next.js 14 (App Router), Tailwind CSS, shadcn/ui |
| **Database** | PostgreSQL 15 |
| **ORM** | Prisma 5 |
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

> Coming in Phase 1 — Docker Compose setup

```bash
# Clone repository
git clone <repo-url>
cd secure-collab-platform

# Start everything
docker compose up -d

# Run migrations
pnpm db:migrate

# Seed database
pnpm db:seed

# API: http://localhost:3001
# Web: http://localhost:3000
# Swagger: http://localhost:3001/api/docs
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

## Roadmap

- [x] Phase 0: Legacy analysis & scope definition
- [ ] Phase 1: Backend architecture & database design
- [ ] Phase 2: NestJS API implementation
- [ ] Phase 3: Next.js frontend & real-time integration
- [ ] Phase 4: File uploads, search, notifications
- [ ] Phase 5: Testing, deployment, demo

**v2 Ideas:** WebRTC voice channels, AI thread summarization, GitHub/GitLab integrations

---

## License

MIT (same as original lets-chat)

---

*Built with respect for the original creators at Security Compass.*
