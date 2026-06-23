# Job Application Kit — lets-chat-modern-rebuild

> Copy-paste content for resumes, cover letters, application forms, LinkedIn featured sections, and recruiter emails.  
> All links point to the live production deployment.

---

## Quick Links

| Component | URL |
|---|---|
| Live app | https://lets-chat-web.vercel.app |
| API base | https://lets-chat-api-v2.onrender.com/api/v1 |
| Health check | https://lets-chat-api-v2.onrender.com/api/v1/health |
| GitHub repo | `https://github.com/Mellowin/lets-chat-modern-rebuild` |
| README | [`README.md`](../README.md) |
| Demo guide | [`docs/portfolio-demo.md`](portfolio-demo.md) |
| Demo script | [`docs/demo-script.md`](demo-script.md) |
| Interview notes | [`docs/interview-notes.md`](interview-notes.md) |
| Portfolio summary | [`docs/portfolio-summary.md`](portfolio-summary.md) |

---

## 30-Second Pitch

> "I rebuilt the archived `lets-chat` project as a modern, production-ready team chat app. It supports workspaces, public and private channels, direct messages, authenticated file attachments, global search, and multi-device session management. The backend is NestJS + PostgreSQL + Prisma, the frontend is Next.js 16 + React 19 + Tailwind CSS, and it deploys automatically through GitHub Actions, Render, and Vercel. The part I'm proudest of is the security model: private channels return a 404 to non-members at every layer, and sessions are isolated per tab so you can revoke every other session without affecting your current one."

---

## One-Paragraph Project Summary

`lets-chat-modern-rebuild` is a full-stack, real-time collaboration platform inspired by Slack. Users can create workspaces, join public or private channels, send direct messages, share files, search across conversations, and manage active sessions. The stack is **NestJS + Prisma + PostgreSQL** on the backend and **Next.js 16 (App Router) + React 19 + Tailwind CSS v4** on the frontend. Real-time messaging is powered by **Socket.io**, files are stored in **S3-compatible object storage** behind an authenticated proxy, and the project is covered by **1,500+ automated tests**. Every push to `main` runs lint, typecheck, tests, and builds, then migrates the production database and triggers a Render deploy hook; Vercel deploys the frontend in parallel.

Use this summary for:
- Job application "Tell us about a project" fields.
- LinkedIn featured section description.
- Portfolio website project card.

---

## Resume Bullets

Pick the bullets that best match the role you are applying for.

- Built a full-stack real-time chat app with **NestJS**, **PostgreSQL**, **Prisma**, **Next.js**, **React 19**, and **Tailwind CSS**.
- Implemented **JWT authentication** with access/refresh token rotation, bcrypt hashing, and per-device session management.
- Designed **role-based access control** for workspaces and channels (OWNER/ADMIN/MEMBER), enforcing authorization at both HTTP and WebSocket layers.
- Delivered **real-time messaging** with **Socket.io** rooms, message broadcasts, typing indicators, reactions, replies, and read receipts.
- Built **global message search** across workspaces, channels, and DMs with highlighting and jump-to-message.
- Implemented **secure file attachments** through authenticated proxy downloads, presigned uploads, file type validation, and practical category limits.
- Added **EN/UK/RU localization** with Cyrillic username and workspace-name support.
- Set up **CI/CD** with GitHub Actions, Render Deploy Hooks, and Vercel auto-deploy; production health and smoke checks run after every deploy.
- Maintained **1,500+ automated tests** (Jest for API, Vitest + Testing Library for Web) with lint and typecheck gates.

---

## Cover Letter Paragraph

> In my recent project, `lets-chat-modern-rebuild`, I took a legacy open-source chat app and rebuilt it as a modern, portfolio-grade collaboration platform. I owned the full stack: JWT auth with token rotation and session management, role-based workspace/channel authorization, real-time Socket.io messaging, authenticated file uploads, global search, and a polished Next.js frontend. I also built the CI/CD pipeline in GitHub Actions, added production migration and deploy hooks, and wrote automated verification scripts. The live demo is available at `https://lets-chat-web.vercel.app`, and the codebase is on GitHub at `https://github.com/Mellowin/lets-chat-modern-rebuild`.

---

## Application Form Answers

### "Describe a challenging project you worked on."

The hardest part of `lets-chat-modern-rebuild` was making private channels truly private. It is easy to guard a REST endpoint, but we also had to make sure search results, WebSocket events, and invite flows did not leak a channel's existence. The rule I settled on was simple: if you are not a member, you get a `404` everywhere — REST, search, and WebSocket rooms. This required authorization checks in controllers, service layers, search queries, and the gateway, and it is backed by unit and E2E tests.

### "How do you ensure code quality?"

The project has over 1,500 automated tests split between Jest (API), Vitest + Testing Library (Web), and Supertest E2E smoke tests. Every push runs lint, typecheck, tests, and builds in GitHub Actions. Production deploys only happen after the pipeline is green, and post-deploy scripts verify public endpoints, auth flows, permissions, and attachments against the live deployment.

### "How do you handle deployment?"

Render Auto-Deploy is disabled. The only automatic production path is GitHub Actions → Render deploy hook. After CI passes, the workflow migrates the production PostgreSQL database and then calls the Render hook to deploy the API. Vercel builds and deploys the frontend in parallel. After deploy, smoke and attachment verification scripts confirm the deployment is healthy.

---

## GitHub Repo "About" Section

```text
Modern rebuild of lets-chat — a secure, real-time team chat platform with workspaces, channels, DMs, file attachments, global search, and session management. NestJS + PostgreSQL + Prisma backend, Next.js + React 19 + Tailwind CSS frontend.
```

Suggested topics/tags: `nestjs`, `nextjs`, `react`, `typescript`, `socket-io`, `prisma`, `postgresql`, `tailwindcss`, `real-time-chat`, `portfolio-project`.

---

## Recruiter / Hiring Manager Email Snippet

```text
Hi [Name],

I wanted to share a recent full-stack project I built: lets-chat-modern-rebuild.

It is a production-ready, real-time team chat app (Slack-like) with workspaces,
public/private channels, direct messages, authenticated file attachments, global
search, and multi-device session management.

Live demo: https://lets-chat-web.vercel.app
Repo:     https://github.com/Mellowin/lets-chat-modern-rebuild

Stack: NestJS, PostgreSQL, Prisma, Next.js 16, React 19, Tailwind CSS, Socket.io.
Tests: 1,500+ automated tests; CI/CD through GitHub Actions + Render + Vercel.

I would love to walk you through a 10-minute demo. Let me know if you would like
a brief intro call.

Best,
[Your name]
[Your email]
[Your LinkedIn / portfolio URL]
```

---

## LinkedIn Featured Post

```text
I recently rebuilt the archived lets-chat project as a modern, real-time team
chat platform.

What it includes:
• Workspaces, public/private channels, DMs
• Real-time messaging with Socket.io
• Authenticated file uploads and downloads
• Global search across conversations
• JWT auth with session management
• EN/UK/RU localization

Stack: NestJS • PostgreSQL • Prisma • Next.js 16 • React 19 • Tailwind CSS
Tests: 1,500+  |  CI/CD: GitHub Actions → Render + Vercel

Live demo: https://lets-chat-web.vercel.app
Repo: https://github.com/Mellowin/lets-chat-modern-rebuild
```

---

## Demo Prep Checklist

Before a live screen-share demo, run through this list:

- [ ] Wake up the backend: `https://lets-chat-api-v2.onrender.com/api/v1/health` returns `{ "status": "ok" }`.
- [ ] Open the frontend: `https://lets-chat-web.vercel.app` loads without errors.
- [ ] Have a demo account ready, or be prepared to register a throwaway email.
- [ ] Open a second browser/incognito window for real-time and session tests.
- [ ] Pick 3–5 screens to show: dashboard → channel → attachments → search → sessions.
- [ ] Keep the demo script open: [`docs/demo-script.md`](demo-script.md).
- [ ] Mention the cold-start limitation honestly if the backend is waking up.

---

## Interview Cheat Sheet

**Architecture**
- Monorepo: `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared`, `packages/database` (Prisma).
- Auth: JWT access/refresh tokens in `sessionStorage`; refresh tokens are sessions in PostgreSQL.
- Authorization: guards check workspace/channel/DM membership; private channels return `404` to outsiders.
- Real-time: Socket.io rooms per channel/DM; membership revalidated on every live event.
- Search: full-text search over messages with scoped queries.
- CI/CD: push to `main` → GitHub Actions → migrate → Render hook → API deploy; Vercel builds frontend.

**Hardest problems solved**
- Private channel security across REST, WebSocket, and search.
- Per-tab session isolation with "Revoke all other sessions".
- WebSocket authorization revalidation on every live event.
- Silent token refresh with a shared in-flight lock.
- Render deploy hook reliability with Auto-Deploy disabled.

**Honest limitations to mention**
- Render free-tier cold start (~1 minute).
- E2E tests local-only; CI does not spin up PostgreSQL yet.
- Real email delivery needs a verified Resend domain.
- Presence is in-memory; horizontal scaling needs Redis.

---

## Replace These Placeholders

Before sending anything from this kit, update:

- `[Name]` — recipient name.
- `[Your name]` — your full name.
- `[Your email]` — your email address.
- `[Your LinkedIn / portfolio URL]` — your public profile.

Everything else is ready to copy-paste as-is.

---

## More Job-Search Docs

- [`resume-project-blocks.md`](resume-project-blocks.md) — resume blocks in EN/UK/RU.
- [`github-profile-kit.md`](github-profile-kit.md) — GitHub repo description, topics, profile README block.
- [`job-platform-profile-kit.md`](job-platform-profile-kit.md) — LinkedIn, Djinni, DOU profile text.
- [`recruiter-messages.md`](recruiter-messages.md) — LinkedIn/email messages.
- [`interview-answers.md`](interview-answers.md) — common interview answers.
- [`project-story.md`](project-story.md) — 30-second and 2-minute story.
- [`application-checklist.md`](application-checklist.md) — pre-application and daily routine checklist.
