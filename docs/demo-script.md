# Recruiter Demo Script — lets-chat-modern-rebuild

Use this script when presenting the project to recruiters, hiring managers, or in a portfolio review. It tells a coherent story in about three minutes and highlights the engineering decisions behind the features.

---

## What This Project Is

`lets-chat-modern-rebuild` is a full-stack, real-time team chat application — a modern rebuild of the archived `lets-chat` open-source project. It supports workspaces, public/private channels, direct messages, file attachments, global search, multi-device session management, and EN/UK/RU localization.

It is intentionally **portfolio-grade**: the scope is large enough to show real architecture, authorization, real-time messaging, testing, and CI/CD, while remaining small enough to reason about in an interview.

**Live demo**

- Frontend: https://lets-chat-web.vercel.app
- Backend API: https://lets-chat-api-v2.onrender.com/api/v1
- WebSocket: wss://lets-chat-api-v2.onrender.com

Screenshots: [`docs/portfolio-media/`](portfolio-media/)  
Summary & resume bullets: [`docs/portfolio-summary.md`](portfolio-summary.md)

---

## 60-Second Overview (Elevator Pitch)

> "I rebuilt `lets-chat` as a modern Slack-like team chat app. Users can create workspaces, join public or private channels, send direct messages, upload files, search across every conversation, and manage active sessions.
>
> The backend is **NestJS + PostgreSQL + Prisma** with JWT access/refresh token rotation, role-based authorization, and WebSocket rooms. The frontend is **Next.js 16 + React 19 + Tailwind CSS**. Everything deploys automatically: GitHub Actions runs lint, typecheck, tests, and builds, then triggers a Render deploy hook for the API; Vercel deploys the frontend.
>
> The part I'm proudest of is the security model: private channels return a 404 to non-members at the REST, WebSocket, and search layers, and sessions are stored per device so you can revoke every other session without affecting your current tab."

---

## 3-Minute Demo Path

**Setup**

1. Open https://lets-chat-web.vercel.app.
2. Wait for the backend cold-start hint to clear if the Render instance was idle (~30–60 s).
3. Register a new account, or log in if you already have one.

**The walkthrough**

| Time | Step | What to say |
|------|------|-------------|
| 0:00 | **Create a workspace** | "I create a workspace with a Cyrillic name — `Моя Команда`. The backend transliterates it to a URL-safe Latin slug, `moya-komanda`." |
| 0:20 | **Create a channel and a DM** | "Inside the workspace I create a public channel. I also start a direct message with another user." |
| 0:35 | **Send and interact with messages** | "I send a message, add an emoji reaction, reply to a message, and edit within the 15-minute window." |
| 0:50 | **Real-time in a second browser** | "Now I open an incognito window as a second user. Every message, edit, delete, reply, and reaction appears live because each channel and DM is a Socket.io room." |
| 1:10 | **Private channel security** | "If I create a private channel and the second user isn't a member, they get a 404 — not a 403. The app intentionally leaks no information about the channel's existence." |
| 1:25 | **Global search** | "I search for a single character like `к`. The search spans workspaces, channels, and DMs, and clicking a result jumps straight to that message." |
| 1:40 | **Session management** | "I go to Profile → Sessions. I can see every active device session. I click 'Revoke all other sessions' and the second browser is signed out while my current tab stays logged in." |
| 1:55 | **Silent token refresh** | "Behind the scenes, if my access token expires while the tab is open, the frontend intercepts the 401, refreshes once, and retries the request — I never see a login screen." |
| 2:10 | **CI/CD** | "Every push to `main` runs the full GitHub Actions pipeline. Only after tests and builds pass does the Render deploy hook fire. Vercel builds the frontend in parallel." |
| 2:25 | **Test coverage** | "The project has over 1,681 automated tests: 745 API unit tests, 688 web unit tests, and 248 page-level tests, plus local E2E smoke tests for authorization." |

**Closing line**

> "So this project shows end-to-end full-stack ownership: auth, authorization, real-time messaging, search, file uploads, session management, testing, and production deployment."

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

> "Render Auto-Deploy is disabled. The only automatic path is GitHub Actions → Render deploy hook. That means the API never deploys unless lint, typecheck, tests, and builds all pass. The frontend deploys through Vercel in parallel. After deploy, a smoke script hits 10 public and protected endpoints to confirm health."

### "Why sessionStorage instead of localStorage?"

> "It gives per-tab session isolation. That makes 'Revoke all other sessions' meaningful — revoking a session on one device doesn't blow up every open tab on that device, and a shared computer can't accidentally reuse someone else's tokens."

---

## Known Limitations — State Them Honestly

These are not excuses; they are intentional scope boundaries and next steps.

- **Render free tier cold start** — the backend can take ~1 minute to wake up after idle. The frontend shows a cold-start hint.
- **E2E tests are local-only** — CI does not yet spin up PostgreSQL for the 7 Supertest smoke tests.
- **Email delivery** — real Gmail delivery requires a verified Resend sender domain; otherwise auth emails fall back to console/dev mode.
- **Presence is in-memory** — there is no Redis Socket.io adapter yet, so presence doesn't scale across multiple backend instances.
- **No cursor pagination** — messages and audit logs use limit-based pagination.
- **No push notifications** — browser/push notifications for mentions and DMs are not implemented.
- **No demo video yet** — only screenshots are included; a short screen recording is on the roadmap.

---

## Checklist Before Showing the Demo

- [ ] Backend is awake: https://lets-chat-api-v2.onrender.com/api/v1/health returns `status: ok`.
- [ ] Frontend loads: https://lets-chat-web.vercel.app returns 200 with HTML.
- [ ] You have a second browser or incognito window ready for real-time/session tests.
- [ ] You have a throwaway email/username ready for registration.
- [ ] You know the live test counts if asked: **745 API / 688 web / 248 page tests**.
