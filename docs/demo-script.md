# Demo Script — lets-chat-modern-rebuild

Use this script when presenting the project to recruiters, hiring managers, or in a portfolio review. It tells a coherent story in about **2–3 minutes** and highlights the engineering decisions behind the features.

---

## What This Project Is

`lets-chat-modern-rebuild` is a full-stack, real-time team chat application — a modern rebuild of the archived `lets-chat` open-source project. It supports workspaces, public/private channels, direct messages, authenticated file attachments, global search, multi-device session management, and EN/UK/RU localization.

It is intentionally **portfolio-grade**: the scope is large enough to show real architecture, authorization, real-time messaging, testing, and CI/CD, while remaining small enough to reason about in an interview.

**Live demo**

- Frontend: https://lets-chat-web.vercel.app
- Backend API: https://lets-chat-api-v2.onrender.com/api/v1
- WebSocket: wss://lets-chat-api-v2.onrender.com

Screenshots: [`docs/portfolio-media/screenshots/`](portfolio-media/screenshots/)  
Demo guide: [`docs/portfolio-demo.md`](portfolio-demo.md)  
Interview notes: [`docs/interview-notes.md`](interview-notes.md)

---

## 30-Second Elevator Pitch

> "I rebuilt `lets-chat` as a modern Slack-like team chat app. Users can create workspaces, join public or private channels, send direct messages, upload files, search across every conversation, and manage active sessions.
>
> The backend is **NestJS + PostgreSQL + Prisma** with JWT access/refresh token rotation, role-based authorization, and WebSocket rooms. The frontend is **Next.js 16 + React 19 + Tailwind CSS**. Everything deploys automatically: GitHub Actions runs lint, typecheck, tests, and builds, then triggers a Render deploy hook for the API; Vercel deploys the frontend.
>
> The part I'm proudest of is the security model: private channels return a 404 to non-members at the REST, WebSocket, and search layers, and sessions are stored per device so you can revoke every other session without affecting your current tab."

---

## 2–3 Minute Demo Script

### 0:00–0:10 — Intro

Open https://lets-chat-web.vercel.app and log in.

> "This is a real-time team collaboration app. I'm logged in as Diana, the owner of the `Acme Product Team` workspace."

### 0:10–0:30 — Dashboard & Workspaces

Navigate to the dashboard.

> "From the dashboard I can see my workspaces, create a new one, and manage invitations. Workspaces have OWNER, ADMIN, and MEMBER roles, and destructive actions like delete or archive are owner-only."

Optional: create a workspace with a Cyrillic name and show the auto-generated Latin slug.

### 0:30–1:00 — Channels & Messages

Open the `general` channel.

> "Inside the workspace we have channels. Here's a short release-planning thread: a question from Diana, a reply from Alex, and a follow-up. Replies are nested under the parent message. I can edit within 15 minutes, delete, react, or forward to another channel."

Point out:

- polished message bubbles;
- reply preview with the original author;
- real-time feel (if a second browser is open).

### 1:00–1:30 — Attachments & Drag-and-Drop

Scroll to the attachment messages or upload a new file.

> "Files are uploaded through an authenticated proxy. The backend validates the file type and size, then stores it in S3-compatible object storage. Downloads require a valid access token, so attachments aren't publicly accessible."

Demonstrate:

- a PDF card;
- an inline image preview;
- an Excel/Word card;
- a file with a Cyrillic filename;
- drag-and-drop into the composer.

### 1:30–1:50 — Search & Direct Messages

Open global search and type `release`.

> "Search spans workspaces, channels, and DMs. Clicking a result jumps straight to the message context."

Switch to the direct-message conversation with Alex.

> "Direct messages are 1-to-1, participant-only, and also delivered in real time through Socket.io rooms."

### 1:50–2:10 — Profile, Sessions & Security

Open **Profile → Sessions**.

> "Here I can see every active refresh-token session. The current session is protected. I can revoke all other sessions, which signs out every other device without affecting this tab."

> "Behind the scenes, if my access token expires while the tab is open, the frontend intercepts the 401, refreshes once, and retries the original request — I never see a login screen."

### 2:10–2:30 — Production Pipeline

Show the GitHub Actions run or describe it.

> "Every push to `main` runs the full GitHub Actions pipeline: lint, typecheck, tests, builds, then a production database migration, then the Render deploy hook for the API. Vercel deploys the frontend in parallel. After deploy, automated scripts hit public endpoints and verify attachments end-to-end."

### 2:30–2:40 — Closing

> "So this project shows end-to-end full-stack ownership: auth, authorization, real-time messaging, secure file uploads, search, session management, localization, testing, and production deployment."

---

## Security Story

Use this section when an interviewer asks "How did you think about security?"

1. **Authentication**
   - JWT access tokens expire in 15 minutes; refresh tokens expire in 7 days and are stored in PostgreSQL with device metadata.
   - Refresh tokens are single-use and rotated on every refresh. Reuse detection invalidates the whole session family.
   - Tokens live in `sessionStorage`, so each browser tab has an independent session.

2. **Authorization**
   - Private channels return `404` to non-members — no title, ID, or membership leakage.
   - Message edit is restricted to the author within a 15-minute window; delete is restricted to author, admins, and owners.
   - Direct messages are accessible only to the two participants.
   - Workspace deletion is restricted to the workspace OWNER.

3. **WebSocket security**
   - The server revalidates channel/DM membership on every live event.
   - If a user is removed from a channel or workspace, they are forced to leave the Socket.io room and their presence is cleaned up.

4. **Session hygiene**
   - Users can see every active session and revoke all others.
   - The current session is protected and cannot be revoked accidentally from the list.

5. **Error handling**
   - Auth endpoints return generic success messages for forgot-password and resend-verification to avoid account enumeration.
   - When silent refresh fails, tokens are cleared and the UI returns to the login screen without leaking raw tokens to the console.

---

## What to Say in an Interview

### "Tell me about a hard problem you solved."

> "The hardest problem was keeping private channels truly private. It's easy to guard the REST endpoint, but we also had to make sure search results, WebSocket events, and invite flows didn't leak the channel's existence. We ended up with a consistent rule: if you aren't a member, you get a 404 everywhere — REST, search, and WebSocket rooms. That required authorization checks in controllers, service layers, search queries, and the gateway."

### "How did you handle real-time messaging?"

> "We use Socket.io rooms scoped by channel and DM. When a message is created, updated, deleted, or reacted to, the server emits to the relevant room. Typing indicators and presence work the same way. The important detail is that every live event revalidates membership on the server, so access revocation takes effect immediately."

### "How do you deploy safely?"

> "Render Auto-Deploy is disabled. The only automatic path is GitHub Actions → Render deploy hook. That means the API never deploys unless lint, typecheck, tests, and builds all pass. The frontend deploys through Vercel in parallel. After deploy, smoke and attachment verification scripts run against production."

### "Why sessionStorage instead of localStorage?"

> "It gives per-tab session isolation. That makes 'Revoke all other sessions' meaningful — revoking a session on one device doesn't blow up every open tab on that device, and a shared computer can't accidentally reuse someone else's tokens."

---

## Known Limitations — State Them Honestly

These are not excuses; they are intentional scope boundaries and next steps.

- **Render free tier cold start** — the backend can take ~1 minute to wake up after idle.
- **E2E tests are local-only** — CI does not yet spin up PostgreSQL for the 7 Supertest smoke tests.
- **Email delivery** — real Gmail delivery requires a verified Resend sender domain; otherwise auth emails fall back to console/dev mode.
- **Presence is in-memory** — there is no Redis Socket.io adapter yet, so presence doesn't scale across multiple backend instances.
- **No cursor pagination** — messages and audit logs use limit-based pagination.
- **No push notifications** — browser/push notifications for mentions and DMs are not implemented.
- **No demo video yet** — screenshots are included; a short screen recording is on the roadmap.

---

## Checklist Before Showing the Demo

- [ ] Backend is awake: https://lets-chat-api-v2.onrender.com/api/v1/health returns `status: ok`.
- [ ] Frontend loads: https://lets-chat-web.vercel.app returns 200 with HTML.
- [ ] You have a second browser or incognito window ready for real-time/session tests.
- [ ] You have a throwaway email/username ready for registration, or request demo access.
