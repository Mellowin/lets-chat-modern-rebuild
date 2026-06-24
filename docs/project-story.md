# Project Story — lets-chat-modern-rebuild

Ready-to-tell project pitches and a technical deep-dive for interviews and portfolio reviews.

---

## 30-Second Pitch

### English

> "I rebuilt the archived `lets-chat` project as a modern Slack-like team chat app. It has workspaces, public and private channels, direct messages, group chats with invite links, a contacts list for quick discovery, secure file attachments, global search, and multi-device session management. The backend is NestJS + PostgreSQL + Prisma, the frontend is Next.js 16 + React 19 + Tailwind CSS, and everything deploys automatically through GitHub Actions, Render, and Vercel."

### Ukrainian

> "Я переписав архівний проєкт `lets-chat` у сучасний командний чат, схожий на Slack. Там є робочі простори, публічні та приватні канали, особисті повідомлення, групові чати з посиланнями-запрошеннями, список контактів для швидкого пошуку, безпечні файлові вкладення, глобальний пошук і керування сесіями. Backend — NestJS + PostgreSQL + Prisma, frontend — Next.js 16 + React 19 + Tailwind CSS, а все деплоїться автоматично через GitHub Actions, Render і Vercel."

---

## 2-Minute Story

### English

1. **The product:** A real-time team collaboration app. Users create workspaces, join public or private channels, send direct messages, start group chats via invite links, keep a private contacts list, share files, search conversations, and manage active sessions.
2. **The stack:** NestJS REST API, Prisma ORM, PostgreSQL, Next.js 16 App Router, React 19, Tailwind CSS v4, Socket.io for real-time events, S3-compatible storage for files.
3. **Security:** Private channels return 404 to non-members at REST, WebSocket, and search layers. JWT access tokens expire in 15 minutes and live in `sessionStorage`; refresh tokens are stored in PostgreSQL and rotated on every refresh.
4. **Quality:** 1,500+ automated tests, including API E2E smoke tests that run in CI with a PostgreSQL service container.
5. **Deployment:** GitHub Actions runs lint, typecheck, tests, and builds; then migrates the production database and triggers the Render deploy hook. Vercel deploys the frontend in parallel.
6. **The part I’m proudest of:** making private channels truly private — it required consistent authorization across controllers, services, search queries, and the WebSocket gateway.

### Ukrainian

1. **Продукт:** чат для командної співпраці в реальному часі. Користувачі створюють робочі простори, долучаються до публічних або приватних каналів, надсилають особисті повідомлення, створюють групові чати через запрошувальні посилання, ведуть приватний список контактів, діляться файлами, шукають у листуванні та керують активними сесіями.
2. **Стек:** NestJS REST API, Prisma ORM, PostgreSQL, Next.js 16 App Router, React 19, Tailwind CSS v4, Socket.io для real-time подій, S3-сумісне сховище для файлів.
3. **Безпека:** приватні канали повертають 404 для не-учасників на рівні REST, WebSocket і пошуку. JWT access токени дійсні 15 хвилин і зберігаються в `sessionStorage`; refresh токени — в PostgreSQL і ротуються при кожному оновленні.
4. **Якість:** 1500+ автоматичних тестів, включно з API E2E smoke-тестами в CI з PostgreSQL service container.
5. **Деплой:** GitHub Actions запускає lint, typecheck, тести та збірки; потім виконує production-міграцію бази даних і викликає Render deploy hook. Vercel деплоїть frontend паралельно.
6. **Тим, чим я пишаюся найбільше:** зробив приватні канали по-справжньому приватними — це вимагало послідовної авторизації в controllers, services, пошукових запитах і WebSocket gateway.

---

## Technical Deep-Dive

Use this when the interviewer asks for details.

### Architecture

- **Monorepo:** `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared` (types/utilities), `packages/database` (Prisma schema, client, migrations).
- **API:** RESTful NestJS controllers, services, and repositories. Guards enforce workspace/channel/DM membership before returning data.
- **Frontend:** Next.js 16 App Router, React Server Components where useful, client components for real-time UI, Tailwind CSS design-system primitives.
- **Real-time:** Socket.io namespaces/rooms per channel and DM. The server revalidates membership on every live event.

Standalone group chats were added in B213 as a separate Prisma domain (`GroupConversation`, `GroupMember`, `GroupMessage`) so DM and workspace logic could stay untouched. They use a minimal OWNER/MEMBER permission model, their own REST and WebSocket events, and are surfaced in the sidebar between DMs and workspaces. B214 added expiring group invite links and a private `UserContact` list for quick user discovery.

### Database

- PostgreSQL 15 managed by Prisma.
- Models: User, Workspace, WorkspaceMember, Channel, ChannelMember, Message, Reaction, Attachment, DirectConversation, DirectMessage, RefreshToken, AuditLog.
- Raw SQL migrations add partial unique indexes, lower-case unique indexes for email/username, and a full-text search `tsvector` column on messages.

### Auth

- JWT access tokens (15 minutes) signed with `JWT_ACCESS_SECRET`.
- Refresh tokens (7 days) stored as hashed sessions in PostgreSQL with device metadata.
- Refresh tokens are single-use and rotated; reuse detection invalidates the whole session family.
- Tokens live in `sessionStorage` for per-tab isolation.
- `authFetch` intercepts 401s, refreshes once, and retries the original request with a shared in-flight lock.

### Attachments

- File is uploaded through an authenticated API proxy endpoint.
- The API validates the file and stores it in S3-compatible storage.
- Backend validates MIME type, extension, and category-specific size limits.
- Download goes through `/attachments/:id/download`, which checks the access token and proxies the file.
- Supports Cyrillic filenames and inline image previews.

### CI/CD

```text
push main
  → GitHub Actions
      → lint / typecheck / unit tests / web page tests / API build
      → API E2E tests (PostgreSQL service container)
      → production database migration
      → Render deploy hook (API)
      → Vercel production deploy (frontend)
```

- Render Auto-Deploy is disabled; GitHub Actions is the only automatic path to production.
- Post-deploy scripts verify public endpoints, auth flows, permissions, and attachments.

### E2E Tests

- `apps/api/test/app.e2e-spec.ts` — health check.
- `apps/api/test/channels.e2e-spec.ts` — private-channel security smoke tests.
- Run in CI against a temporary PostgreSQL database.
- StorageService is overridden in-memory so no real S3/R2 credentials are needed.
