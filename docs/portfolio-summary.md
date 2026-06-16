# Portfolio Summary — lets-chat-modern-rebuild

> A production-ready, real-time team chat application rebuilt from the archived `lets-chat` project. Demonstrates full-stack architecture, role-based authorization, WebSocket messaging, global search, session management, and automated CI/CD.

---

## Production Links

| Component | URL |
|-----------|-----|
| Frontend | https://lets-chat-web.vercel.app |
| Backend API | https://lets-chat-api-v2.onrender.com/api/v1 |
| WebSocket | wss://lets-chat-api-v2.onrender.com |
| Health | https://lets-chat-api-v2.onrender.com/api/v1/health |

---

## Product Description

`lets-chat-modern-rebuild` is a Slack-like collaboration app for teams. Users can create workspaces, join public or private channels, send direct messages, share files, search across conversations, and manage multi-device sessions. The UI supports English, Ukrainian, and Russian.

## Problem It Solves

Small teams need a secure, real-time messaging workspace where access to channels and messages is controlled by roles. The project shows how to build that end-to-end — from JWT authentication and database authorization to live WebSocket delivery and production deployment.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4 |
| Backend | NestJS 11, TypeScript, Prisma ORM, PostgreSQL 15 |
| Real-Time | Socket.io 4, Redis-ready presence |
| Storage | MinIO / S3-style module with presigned upload URLs |
| Testing | Jest (API), Vitest + Testing Library (Web), Supertest (E2E) |
| CI/CD | GitHub Actions → Render Deploy Hook; Vercel auto-deploy |

---

## Backend Highlights

- **JWT auth** with access/refresh token rotation, bcrypt hashing, and per-tab session storage.
- **Workspaces** with OWNER / ADMIN / MEMBER roles.
- **Channels** — public and private; private channels return `404` for non-members.
- **Messages** — CRUD, 15-minute edit window, soft delete, replies, forwarding, emoji reactions.
- **Direct messages** — participant-only 1-to-1 conversations.
- **Global, workspace, and channel message search** with highlight and jump-to-message.
- **Session management** — list active refresh-token sessions, revoke others, protect current session.
- **Silent token refresh** — backend rotates refresh tokens safely; frontend `authFetch` intercepts 401s and retries without logging the user out.
- **Invites** — email/username invites and public invite links with usage limits.
- **File attachments** — drag-and-drop, upload progress, retry, presigned URLs, inline image previews.
- **Audit logging** for member, invite, and ownership actions.

## Frontend Highlights

- Design-system primitives: `Button`, `Input`, `Select`, `Card`, `Badge`, `Avatar`, `EmptyState`, `PageHeader`.
- Polished, consistent UI across auth, dashboard, workspace, channel, DM, search, and profile screens.
- Real-time message list updates via WebSocket.
- Global search modal with source badges (channel / DM / public / private).
- Profile sessions tab with current-session protection.
- Localization switcher (EN / UK / RU) and Cyrillic username/workspace support.

## Real-Time / WebSocket Highlights

- Socket.io rooms per channel and DM.
- Live events: `message:created`, `message:updated`, `message:deleted`, `message:reaction_changed`.
- Typing indicators in channels and DMs.
- Presence cleanup when a user leaves or is removed.
- Access revalidation on every typing event; revoked membership forces room leave.

## Security Highlights

- Private channels leak no information to non-members.
- Message edit/delete enforced by author and role rules.
- Direct messages accessible only to the two participants.
- Channel archive/restore and role changes restricted to OWNER/ADMIN.
- WebSocket events revalidate channel membership on the server.
- Refresh tokens are single-use and rotated on every refresh; reuse detection invalidates the whole session family.

## Testing & CI/CD Highlights

| Suite | Count |
|-------|-------|
| API unit tests | 745 (34 suites) |
| Web unit tests | 688 (31 files) |
| Web page tests | 248 (2 files) |
| E2E smoke tests | 7 (local-only, needs Docker PostgreSQL) |

- GitHub Actions runs lint, typecheck, tests, and builds on every push.
- Render deploy hook fires only after green CI; Render Auto-Deploy is disabled.
- Vercel auto-deploys the frontend.
- `node scripts/smoke-deploy.mjs` verifies 10 public/protected endpoints after deploy.

---

## Screenshots

Portfolio-safe screenshots are stored in `docs/portfolio-media/` (optimized PNGs, ~800 KB total). They were captured from production using `visual-qa/visual-qa.js` with disposable Mail.tm accounts.

| Screenshot | File |
|------------|------|
| Login page | `docs/portfolio-media/login.png` |
| Dashboard | `docs/portfolio-media/dashboard.png` |
| Workspace overview | `docs/portfolio-media/workspace.png` |
| Channel conversation | `docs/portfolio-media/channel.png` |
| Global search modal | `docs/portfolio-media/global-search.png` |
| DM conversation | `docs/portfolio-media/dm.png` |
| Profile sessions | `docs/portfolio-media/profile-sessions.png` |
| Mobile channel view | `docs/portfolio-media/mobile-channel.png` |

Raw rerunnable artifacts (`visual-qa/screenshots/`, `node_modules/`, `package-lock.json`) are gitignored.

---

## 2-Minute Demo Flow

1. Open https://lets-chat-web.vercel.app and log in.
2. Create a workspace with a Cyrillic name (e.g., `Моя Команда`) and show the auto-generated Latin slug.
3. Create a channel and a DM; send a few messages, add a reaction, edit a message.
4. Open global search with a short query and jump to a result.
5. Go to **Profile → Sessions** and point out the current-session badge and "Revoke all other sessions" button.
6. Mention the green CI pipeline and that the backend deploys via GitHub Actions → Render hook.

---

## Known Limitations

- Render free tier cold start can take ~1 minute after idle.
- Real Gmail email delivery depends on a verified Resend sender domain; otherwise auth emails fall back to console/dev mode.
- E2E tests run locally only; CI does not yet spin up PostgreSQL for them.

---

## Resume Bullets

- Built a full-stack real-time chat app with **NestJS**, **PostgreSQL**, **Prisma**, **Next.js**, **React 19**, and **Tailwind CSS**.
- Implemented **JWT authentication** with access/refresh token rotation, bcrypt hashing, and per-device session management.
- Designed **role-based access control** for workspaces and channels (OWNER/ADMIN/MEMBER), enforcing authorization at both HTTP and WebSocket layers.
- Delivered **real-time messaging** with **Socket.io** rooms, message broadcasts, typing indicators, reactions, replies, and read receipts.
- Built **global message search** across workspaces, channels, and DMs with highlighting and jump-to-message.
- Set up **CI/CD** with GitHub Actions, Render Deploy Hooks, and Vercel auto-deploy; production health and smoke checks run after every deploy.
- Maintained **1,681+ automated tests** (Jest for API, Vitest + Testing Library for Web) with lint and typecheck gates.

---

## How to Explain This Project in an Interview

### 30-Second Pitch

> "I rebuilt `lets-chat` as a modern, production-ready team chat app. It has workspaces, public/private channels, DMs, real-time messaging, file attachments, global search, and multi-device session management. The backend is NestJS + PostgreSQL + Prisma, the frontend is Next.js + React 19, and everything deploys automatically through GitHub Actions, Render, and Vercel."

### Architecture Explanation

- **Monorepo**: `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared`, `packages/database` (Prisma).
- **Auth**: JWT access/refresh tokens stored in `sessionStorage` per tab; refresh tokens map to sessions stored in PostgreSQL.
- **Authorization**: Guards check workspace/channel/DM membership before returning data; private channels return 404 to outsiders.
- **Real-time**: Socket.io namespaces/rooms isolate channels and DMs; server revalidates membership on every live event.
- **Search**: Full-text search over messages with scoped queries (global, workspace, channel).
- **CI/CD**: Push to `main` → GitHub Actions (lint/typecheck/test/build) → Render Deploy Hook → API deploy; Vercel builds frontend in parallel.

### Hardest Technical Problems Solved

- **Private channel security**: making non-members receive `404` at every layer — REST, WebSocket, and search — without leaking existence.
- **Session isolation**: storing tokens in `sessionStorage` so multiple browser tabs stay independent, while still supporting "Revoke all other sessions".
- **WebSocket authorization revalidation**: ensuring revoked members are immediately removed from rooms and stop receiving events.
- **Silent token refresh without double requests**: shared in-flight refresh lock between `AuthProvider` startup and `authFetch` 401 retry so concurrent expired-token calls trigger exactly one `/auth/refresh`.
- **Render deploy hook reliability**: disabling Render Auto-Deploy and making GitHub Actions the only automatic deploy path.

### What Was Improved After QA

- B192 introduced a unified design-system palette and polished all authenticated screens.
- B193 fixed remaining visual inconsistencies: workspace page migrated to shared primitives, invite button stopped wrapping, channel message gutter was tightened, and public auth pages no longer show an empty sidebar.
- B200 added transparent silent token refresh: `authFetch` retries once after a 401, `AuthProvider` refreshes on startup, and both share a single in-flight refresh lock to avoid racing the backend.
- Visual QA is now automated with Playwright + disposable Mail.tm accounts, capturing real rendered screenshots instead of checking CSS classes.

### What Would Be Improved Next

- Integrate E2E tests into CI with a PostgreSQL service container.
- Record a short portfolio demo video walking through the recruiter demo path.
- Add push/browser notifications for mentions and DMs.
- Add message pagination / virtualized lists for very large channels.
