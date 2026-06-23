# Interview Notes — lets-chat-modern-rebuild

Concise bullets and talking points for resumes, portfolio reviews, and interviews.

---

## 30-Second Pitch

> "I rebuilt `lets-chat` as a modern, production-ready team chat app. It has workspaces, public/private channels, DMs, real-time messaging, authenticated file attachments, global search, and multi-device session management. The backend is NestJS + PostgreSQL + Prisma, the frontend is Next.js + React 19 + Tailwind CSS, and everything deploys automatically through GitHub Actions, Render, and Vercel."

---

## Resume Bullets

- Built a full-stack real-time chat app with **NestJS**, **PostgreSQL**, **Prisma**, **Next.js**, **React 19**, and **Tailwind CSS**.
- Implemented **JWT authentication** with access/refresh token rotation, bcrypt hashing, and per-device session management.
- Designed **role-based access control** for workspaces and channels (OWNER/ADMIN/MEMBER), enforcing authorization at both HTTP and WebSocket layers.
- Delivered **real-time messaging** with **Socket.io** rooms, message broadcasts, typing indicators, reactions, replies, and read receipts.
- Built **secure file attachments** through authenticated proxy downloads, presigned uploads, file type validation, and practical category limits.
- Added **EN/UK/RU localization** with Cyrillic username and workspace-name support.
- Set up **CI/CD** with GitHub Actions, Render Deploy Hooks, and Vercel auto-deploy; production health and smoke checks run after every deploy.
- Maintained **1,500+ automated tests** (Jest for API, Vitest + Testing Library for Web) with lint and typecheck gates.

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4 |
| Backend | NestJS 11, TypeScript, Prisma ORM, PostgreSQL 15 |
| Real-Time | Socket.io 4, in-memory presence |
| Storage | S3-compatible object storage (presigned uploads + authenticated downloads) |
| Testing | Jest (API), Vitest + Testing Library (Web), Supertest (E2E) |
| CI/CD | GitHub Actions → Render Deploy Hook; Vercel auto-deploy |

---

## Key Technical Decisions

- **`sessionStorage` for tokens** — gives per-tab session isolation, making "Revoke all other sessions" meaningful and avoiding accidental token reuse on shared machines.
- **Authenticated attachment proxy** — files are never served by a public URL; every download requires a valid access token.
- **404 for private channels** — non-members receive `404` at REST, WebSocket, and search layers to avoid leaking channel existence.
- **Migration-before-deploy** — the production database is migrated before the API deploys, preventing schema/version mismatches.
- **Shared in-flight refresh lock** — prevents concurrent 401 retries from racing the backend refresh endpoint.

---

## What Was Production-Hardened

- JWT access/refresh token rotation with reuse detection.
- WebSocket membership revalidation on every live event.
- File type and size validation with per-category limits.
- Cyrillic filename support across uploads and downloads.
- Automated smoke deploy and attachment verification scripts.
- CI pipeline with lint, typecheck, tests, builds, migration, and Render deploy hook.

---

## What to Show in a 3-Minute Demo

1. **Login / dashboard** — polished auth and workspace overview.
2. **Channels** — message bubbles, replies, reactions, real-time updates.
3. **Attachments** — PDF, image, Excel/Word cards; Cyrillic filename; drag-and-drop overlay.
4. **Search** — global search across workspaces/channels/DMs.
5. **Direct messages** — 1-to-1 real-time chat.
6. **Profile → Sessions** — multi-device session management.
7. **CI/CD** — GitHub Actions green run and Render/Vercel deploy.

---

## Hardest Problems Solved

- **Private channel security** — making non-members receive `404` at every layer without leaking existence.
- **Session isolation** — storing tokens in `sessionStorage` so multiple browser tabs stay independent while still supporting "Revoke all other sessions".
- **WebSocket authorization revalidation** — ensuring revoked members are immediately removed from rooms and stop receiving events.
- **Silent token refresh without double requests** — shared in-flight refresh lock between `AuthProvider` startup and `authFetch` 401 retry.
- **Render deploy hook reliability** — disabling Render Auto-Deploy and making GitHub Actions the only automatic deploy path.

---

## What to Say in an Interview

### "Why did you rebuild lets-chat?"

> "The original project was archived and used older patterns. I wanted a modern, portfolio-ready example that shows full-stack ownership: auth, authorization, real-time messaging, secure uploads, search, localization, testing, and CI/CD."

### "How did you handle file uploads securely?"

> "Files are uploaded through a presigned flow, stored in S3-compatible object storage, and downloaded through an authenticated API proxy. The backend validates MIME type and size before accepting anything, and dangerous extensions like `.exe` are rejected."

### "How do you keep the frontend in sync?"

> "Socket.io rooms per channel and DM. When a message is created, updated, deleted, or reacted to, the server emits to that room. Every live event revalidates membership, so if someone is removed they stop receiving data immediately."

### "What's your deployment safety net?"

> "GitHub Actions is the only automatic path to production. It runs lint, typecheck, tests, and builds, then migrates the database, then calls the Render deploy hook. After deploy, smoke and attachment verification scripts confirm the site and API are healthy."

---

## Known Limitations to Mention

- Render free tier cold start (~1 minute after idle).
- E2E tests run locally only; CI does not yet spin up PostgreSQL for them.
- Real email delivery depends on a verified Resend sender domain.
- Presence is in-memory; scaling across multiple API instances would need Redis.

---

## Production Links

- Web: https://lets-chat-web.vercel.app
- API: https://lets-chat-api-v2.onrender.com/api/v1
- Health: https://lets-chat-api-v2.onrender.com/api/v1/health
