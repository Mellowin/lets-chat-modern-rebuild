# LetsChat — Resume Project Block

> Verified facts only. Source: `README.md`, `docs/project-status.md`, `docs/final-project-review.md`, `docs/production-verification.md`, `docs/group-chats.md`, `docs/contacts-and-invites.md`, `docs/b211-push-notifications.md`, `docs/pwa.md`.

---

## A. Ukrainian version

**LetsChat — production full-stack messenger / collaboration app | 2026**

- Побудував backend NestJS 11 + PostgreSQL 15 + Prisma з modular architecture (controllers / services / repositories), JWT-авторизацією з ротацією access/refresh токенів, bcrypt-хешуванням та керуванням сесіями.
- Реалізував real-time обмін повідомленнями через Socket.io (канали, DM, групові чати) із ревалідацією членства на кожній події, typing indicators, reactions, replies, read receipts.
- Розробив робочі простори з рольовою моделлю OWNER/ADMIN/MEMBER, приватні канали (404 для не-учасників на всіх рівнях), групові чати з invite links, контакти та глобальний пошук.
- Забезпечив безпечні файлові вкладення: автентифікований API-проксі для upload/download, валідація MIME/розширень, ліміти розміру, підтримка кириличних імен.
- Додав Web Push сповіщення (VAPID), PWA-встановлення з service worker та offline fallback, EN/UK/RU локалізацію з кириличними username.
- Налаштував CI/CD: GitHub Actions → lint/typecheck/tests/builds → API E2E на PostgreSQL service container → production міграція → Render deploy hook → Vercel frontend deploy; постдеплойні verifiers перевіряють auth, permissions, attachments, groups, contacts, safety.

---

## B. English version

**LetsChat — production full-stack messenger / collaboration app | 2026**

- Built a NestJS 11 + PostgreSQL 15 + Prisma backend with modular controllers/services/repositories, JWT auth with access/refresh token rotation, bcrypt hashing, and multi-device session management.
- Delivered real-time messaging via Socket.io for channels, DMs, and group chats, with membership revalidation on every live event, typing indicators, reactions, replies, and read receipts.
- Implemented workspaces with OWNER/ADMIN/MEMBER RBAC, private channels that return 404 to non-members at REST/WebSocket/search layers, standalone group chats with expiring invite links, contacts, and global search.
- Secured file attachments through an authenticated API proxy for upload/download, MIME/extension validation, size limits, and Cyrillic filename support.
- Added Web Push notifications (VAPID), PWA installability with service worker and offline fallback, and EN/UK/RU localization with Cyrillic usernames.
- Set up CI/CD: GitHub Actions runs lint/typecheck/tests/builds, API E2E on a PostgreSQL service container, production migration, Render deploy hook, and Vercel frontend deploy; post-deploy verifiers cover auth, permissions, attachments, groups, contacts, and safety.

---

## C. Short 3-bullet version (compact CV)

1. **Full-stack real-time chat app** — NestJS/Prisma/PostgreSQL backend, Next.js 16/React 19/Tailwind CSS frontend, Socket.io messaging, JWT auth, RBAC.
2. **Production-deployed** — Vercel frontend + Render backend, GitHub Actions CI/CD with PostgreSQL E2E tests, automated migrations, and post-deploy verifiers.
3. **1,600+ automated tests** — Jest API unit tests, Vitest + Testing Library web tests, Supertest E2E smoke tests; groups, contacts, invite links, push, PWA.

---

## D. LinkedIn / GitHub longer version

**LetsChat** is a production-deployed full-stack team chat and collaboration app rebuilt from the archived `lets-chat` open-source project. It demonstrates end-to-end ownership of a real-time messaging product.

**Live demo:** https://lets-chat-web.vercel.app  
**Repo:** https://github.com/Mellowin/lets-chat-modern-rebuild  
**Stack:** NestJS 11 · PostgreSQL 15 · Prisma · Next.js 16 · React 19 · TypeScript · Tailwind CSS · Socket.io · S3-compatible storage · GitHub Actions · Render · Vercel

- **Backend:** RESTful NestJS API with modular services/repositories, JWT access/refresh token rotation, bcrypt password hashing, role-based access control (OWNER/ADMIN/MEMBER), and multi-device session revocation.
- **Real-time messaging:** Socket.io rooms for channels, DMs, and group chats; membership is revalidated on every broadcast, so removed members stop receiving events immediately.
- **Security:** Private channels return 404 to non-members at REST, WebSocket, and search layers; file downloads require a valid access token; auth endpoints return generic messages to prevent account enumeration.
- **Groups, contacts, and invites:** Standalone group chats with OWNER/MEMBER roles, expiring tokenized invite links (SHA-256 hash stored), private contacts list, and one-click DM start.
- **Push & PWA:** Web Push notifications via VAPID, PWA install flow with service worker and offline fallback, multi-language UI (EN/UK/RU).
- **Quality & delivery:** 868 API unit tests, 706 web unit/page tests, 59 API E2E security smoke tests; GitHub Actions gates lint/typecheck/tests/builds, runs E2E against PostgreSQL, migrates the production DB, and triggers Render/Vercel deploys; production verifiers run after every deploy.
