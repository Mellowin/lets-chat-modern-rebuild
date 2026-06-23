# lets-chat — Modern Secure Team Collaboration

> A production-ready, real-time team chat platform rebuilt from the archived [`lets-chat`](https://github.com/sdelements/lets-chat) project. It combines workspaces, public/private channels, direct messages, authenticated file attachments, global search, multi-device session management, and EN/UK/RU localization in a clean, demo-friendly package.

---

## 🚀 Live Demo

- **Web:** https://lets-chat-web.vercel.app
- **API:** https://lets-chat-api-v2.onrender.com/api/v1
- **WebSocket:** wss://lets-chat-api-v2.onrender.com
- **Health:** https://lets-chat-api-v2.onrender.com/api/v1/health

> Demo access is available on request — the public deployment is open for registration with a throwaway email.

Portfolio guidance:

- [`docs/portfolio-demo.md`](docs/portfolio-demo.md) — step-by-step demo flow and screenshot checklist.
- [`docs/demo-script.md`](docs/demo-script.md) — 2–3 minute recruiter narrative.
- [`docs/interview-notes.md`](docs/interview-notes.md) — resume bullets and interview talking points.
- [`docs/job-application-kit.md`](docs/job-application-kit.md) — copy-paste content for resumes, cover letters, and recruiter emails.
- [`docs/final-project-review.md`](docs/final-project-review.md) — final audit, architecture review, and release notes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4 |
| **Backend** | NestJS 11, TypeScript, Prisma ORM, PostgreSQL 15 |
| **Real-Time** | Socket.io 4, in-memory presence |
| **Storage** | S3-compatible object storage (presigned uploads + authenticated proxy downloads) |
| **Testing** | Jest (API), Vitest + Testing Library (Web), Supertest (E2E) |
| **CI/CD** | GitHub Actions → Render Deploy Hook; Vercel auto-deploy |

---

## ✨ Main Features

### Collaboration

- **Workspaces** — multi-tenant teams with OWNER / ADMIN / MEMBER roles.
- **Channels** — public and private; private channels return `404` to non-members.
- **Direct Messages** — 1-to-1 conversations with participant-only access.
- **Real-time messaging** — live create/update/delete/reaction events via WebSocket rooms.
- **Replies & Forwarding** — thread replies and message forwarding between channels.
- **Reactions** — emoji reactions with toggle/replace behavior.
- **Read receipts** — per-message seen status.
- **Global search** — search across workspaces, channels, and DMs with jump-to-message.

### Auth & Security

- **JWT auth** — access/refresh token rotation, bcrypt hashing, per-tab `sessionStorage`.
- **Session management** — list active sessions, revoke others, current-session protection.
- **Silent token refresh** — `authFetch` intercepts 401s, refreshes once, and retries without logout.
- **Private-channel security** — non-members receive `404` at REST, WebSocket, and search layers.
- **Owner-only destructive actions** — workspace/channel delete and archive restricted to OWNER.

### Attachments

- Drag-and-drop or file-picker upload with progress and retry.
- Authenticated downloads — no direct public URLs.
- Inline image previews and lightbox.
- File type validation and practical category limits.
- Cyrillic filename support.

### Localization

- English, Ukrainian, Russian UI.
- Cyrillic usernames and workspace names with auto-transliteration to URL slugs.

---

## 🛡️ Security & Reliability Highlights

- Private channels leak no existence, title, or membership data to outsiders.
- Message edit is restricted to the author within a 15-minute window.
- Message delete is restricted to author, admins, and owners.
- Direct messages are accessible only to the two participants.
- WebSocket events revalidate channel/DM membership on the server.
- Auth endpoints return generic success messages to avoid account enumeration.
- Production database migration runs before API deploy.
- Automated smoke and attachment verification scripts run after every deploy.

---

## 🧪 Testing & CI

| Suite | Count | Status |
|---|---|---|
| API unit tests | 802 (35 suites) | ✅ passing |
| Web unit + page tests | 692 (31 files) | ✅ passing |
| E2E security smoke tests | 7 (2 suites) | ✅ passing in CI (PostgreSQL service) |

- **CI:** GitHub Actions runs lint, typecheck, unit tests, builds, and API E2E security smoke tests (with a PostgreSQL service container) on every push.
- **Deploy:** Render deploy hook fires only after green CI; Vercel builds the frontend in parallel.
- **Verification:** `scripts/smoke-deploy.mjs` and `scripts/verify-production-attachments.mjs` run against production after deploy.

---

## 📸 Screenshots

All screenshots were captured from the live production deployment after the B206 visual polish pass.

### Desktop

| Screen | Preview |
|---|---|
| Login | ![Login](docs/portfolio-media/screenshots/desktop/01-login.jpg) |
| Dashboard | ![Dashboard](docs/portfolio-media/screenshots/desktop/02-dashboard.jpg) |
| Workspace overview | ![Workspace](docs/portfolio-media/screenshots/desktop/03-workspace.jpg) |
| Channel messages | ![Channel messages](docs/portfolio-media/screenshots/desktop/04-channel-messages.jpg) |
| Channel attachments | ![Attachments](docs/portfolio-media/screenshots/desktop/05-channel-attachments.jpg) |
| Drag & drop overlay | ![Drag and drop](docs/portfolio-media/screenshots/desktop/06-drag-drop-overlay.jpg) |
| Direct messages | ![DM](docs/portfolio-media/screenshots/desktop/07-direct-messages.jpg) |
| Profile sessions | ![Profile sessions](docs/portfolio-media/screenshots/desktop/08-profile-sessions.jpg) |
| Global search | ![Search](docs/portfolio-media/screenshots/desktop/09-search-results.jpg) |

### Mobile

| Screen | Preview |
|---|---|
| Dashboard | ![Mobile dashboard](docs/portfolio-media/screenshots/mobile/01-dashboard.jpg) |
| Workspace | ![Mobile workspace](docs/portfolio-media/screenshots/mobile/02-workspace.jpg) |
| Channel | ![Mobile channel](docs/portfolio-media/screenshots/mobile/03-channel.jpg) |
| Composer | ![Mobile composer](docs/portfolio-media/screenshots/mobile/04-composer.jpg) |
| Attachment card | ![Mobile attachment](docs/portfolio-media/screenshots/mobile/05-attachment-card.jpg) |
| Direct messages | ![Mobile DM](docs/portfolio-media/screenshots/mobile/06-direct-messages.jpg) |

---

## 📁 Project Structure

```
secure-collab-platform/
├── apps/
│   ├── api/                 # NestJS backend
│   └── web/                 # Next.js frontend
├── packages/
│   ├── shared/              # Shared types & utilities
│   └── database/            # Prisma schema, client, migrations
├── docker-compose.yml       # PostgreSQL, Redis, MinIO
├── scripts/                 # Smoke/verification scripts
├── docs/
│   ├── portfolio-demo.md
│   ├── demo-script.md
│   ├── interview-notes.md
│   └── ...
└── README.md
```

---

## 🏁 Quick Start

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

**Verify:**

- Health: `GET http://localhost:3001/api/v1/health`
- Swagger: `http://localhost:3001/api/docs`
- Web app: `http://localhost:3000`

---

## 🧪 Running Tests

```bash
# API unit tests
pnpm --filter api test

# API E2E tests (requires Docker PostgreSQL)
pnpm --filter api test:e2e

# Web unit + page tests
pnpm --filter web test

# Lint
pnpm --filter web lint
pnpm --filter api lint

# Typecheck
pnpm --filter web typecheck
pnpm --filter api typecheck
```

---

## 🚢 Deploy Flow

```text
push main → GitHub Actions (lint/typecheck/test/build)
                ↓
      Migrate production database
                ↓
      Deploy API v2 to Render
                ↓
      Vercel production deploy
                ↓
      smoke-deploy.mjs + verify-production-attachments.mjs
```

No secrets, credentials, or DB URLs are committed to the repository.

---

## ⚠️ Known Limitations

- Render free tier cold start can take ~1 minute after idle.
- Real email delivery depends on a verified Resend sender domain; otherwise auth emails fall back to console/dev mode.

- Presence is in-memory; a Redis Socket.io adapter would be needed for horizontal scaling.

---

Built for portfolio/demo presentation. See [`docs/portfolio-demo.md`](docs/portfolio-demo.md) for the full walkthrough.
