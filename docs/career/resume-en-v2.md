# Valerii Khoidas — Junior Backend / Full-stack Developer

**Role:** Junior Backend Developer · Junior Full-stack Developer · TypeScript / Node.js Developer

**Contact:**
- Email: [your.email@example.com]
- Telegram / Phone: [+380XXXXXXXXX / @username]
- GitHub: https://github.com/Mellowin
- LinkedIn: [https://linkedin.com/in/your-profile]
- Portfolio: https://lets-chat-web.vercel.app

---

## Summary

Junior developer with experience building production full-stack applications. I specialize in TypeScript, NestJS, Next.js, PostgreSQL, and Redis. I can break tasks into milestones, write tests, configure CI/CD, and ship product features. I use AI tools professionally for decomposition, debugging, test generation, and documentation, and I validate all work through lint, typecheck, and automated tests. I’m looking for a role in a product team where I can grow backend and full-stack skills.

---

## Key Skills

- **Languages:** TypeScript, JavaScript, basic Python
- **Backend:** NestJS, Node.js, REST API, WebSocket / Socket.io, JWT, RBAC, database migrations
- **Frontend:** Next.js (App Router), React, Tailwind CSS
- **Database / Infra:** PostgreSQL, Prisma, Redis, Docker, Vercel, Render, Cloudflare
- **Testing / Quality:** Jest, Vitest, Testing Library, Supertest, Playwright
- **Tools:** Git, GitHub Actions, Swagger, AI-assisted development tools

---

## Projects

### LetsChat — production full-stack messenger / collaboration app | 2026

**Live demo:** https://lets-chat-web.vercel.app  
**Repo:** https://github.com/Mellowin/lets-chat-modern-rebuild  
**Stack:** NestJS 11 · PostgreSQL 15 · Prisma · Next.js 16 · React 19 · TypeScript · Tailwind CSS · Socket.io · S3-compatible storage · GitHub Actions · Render · Vercel

- Built a NestJS backend with modular controllers/services/repositories, JWT auth with access/refresh token rotation, bcrypt hashing, and multi-device session management.
- Delivered real-time messaging via Socket.io for channels, DMs, and group chats, with membership revalidation on every live event, typing indicators, reactions, replies, and read receipts.
- Implemented workspaces with OWNER/ADMIN/MEMBER RBAC, private channels that return 404 to non-members at REST/WebSocket/search layers, standalone group chats with expiring invite links, contacts, and global search.
- Secured file attachments through an authenticated API proxy for upload/download, MIME/extension validation, size limits, and Cyrillic filename support.
- Added Web Push notifications (VAPID), PWA installability with service worker and offline fallback, and EN/UK/RU localization with Cyrillic usernames.
- Set up CI/CD: GitHub Actions runs lint/typecheck/tests/builds, API E2E on a PostgreSQL service container, production migration, Render deploy hook, and Vercel frontend deploy; post-deploy verifiers cover auth, permissions, attachments, groups, contacts, and safety.

### NotGuilty Legal — commercial website for a law firm | 2025

**Stack:** Next.js · TypeScript · Tailwind CSS · Telegram API · Google Sheets · Resend · Cloudflare · Vercel

- Built a full commercial website for a law firm: landing pages, service pages, lead-capture forms.
- Integrated Telegram notifications, Google Sheets, and Resend for lead processing and client follow-up.
- Implemented rate limiting, JWT-protected admin panel with IP binding, and bot protection.
- Deployed on Vercel behind Cloudflare, achieving fast load times, HTTPS, and basic SEO.

### WagerPlay Backend — backend for a gaming platform | 2025

**Stack:** NestJS · TypeScript · PostgreSQL · Redis · WebSocket · JWT

- Developed a NestJS backend for a gaming platform: matchmaking, WebSocket game sessions, wallet, and transactions.
- Designed the PostgreSQL schema for users, matches, bets, and balances; used Redis for caching and state.
- Covered key flows with unit tests and set up API authentication and basic security measures.

### JSON ↔ CSV Converter — data conversion utility | 2024

**Stack:** TypeScript / Node.js · CLI

- Built a CLI utility for bidirectional JSON ↔ CSV conversion with structure validation and large-file support.
- Implemented streaming reads to reduce memory usage and clear error messages for malformed input.

---

## Work Style

- I work best with clear tasks and code review; I decompose features into milestones with tests and verifiers.
- Comfortable with production deployment, database migrations, and post-deploy checks.
- I use AI tools responsibly to speed up development, but final quality is always validated through tests, lint, and typecheck.
- Open to office / remote / hybrid in Kyiv and remote worldwide.

---

## Education / Additional

- [Add education or courses if desired]
- English: [level]
- Ukrainian: native
