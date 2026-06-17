# Project Status

> Last updated: 2026-06-17 (B203 production verification pack complete)  
> Code checkpoint: `main`  
> Docs checkpoint: `main`
>
> 🎓 **Portfolio status:** ready for presentation. The UI was polished in B192 (clean SaaS look, design-system components, improved dashboard/workspace/channel/DM/search/profile screens). See [`docs/portfolio-demo.md`](portfolio-demo.md) for demo flow and screenshots checklist.

---

## 1. Deployment Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Frontend (Vercel-ready)** | ✅ Prepared | `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` env wiring, production fallback guards, build docs |
| **Backend (external host)** | ✅ Migrated / B190 verified | Active service `lets-chat-api-v2` on Render; persistent Node.js + Socket.io; CORS via `CORS_ORIGIN` env; health endpoint. Auto-Deploy disabled; deploys only via GitHub Actions Render Deploy Hook. Old `lets-chat-api-wa43` returns 404 and is fully decommissioned. |
| **Database** | ✅ Ready | Prisma migrations; PostgreSQL 15+ |
| **Email** | ✅ Ready | Resend or console dev mode; `APP_WEB_URL` for link generation |

See [`docs/deployment-vercel.md`](deployment-vercel.md) for full deployment guide.

---

## 2. Current Implemented Features

### Authentication
- Registration with email, username, password
- Login with email + password
- Logout (clears sessionStorage and revokes the refresh-token session)
- Access/refresh token rotation
- **Silent access-token refresh** — when an API call returns `401` or the stored access token is expired on startup, the frontend uses the stored refresh token to obtain a new access token without interrupting the user. Concurrent `401` responses are coalesced into a single refresh request.
- **sessionStorage** isolates sessions per browser tab (no cross-tab logout collisions)
- **Session management** in Profile → Sessions:
  - Lists all refresh-token sessions with `isCurrent` flag, status (active/revoked/expired), creation/expiration timestamps, and device metadata when available.
  - Current session is clearly marked and cannot be revoked from the list (use Sign out instead).
  - "Revoke all other sessions" ends every active session except the current one.
  - Revoked/expired sessions are hidden by default and can be shown via a toggle.
  - Multi-session login is intentional: users can stay signed in on multiple devices/browsers.
- Cyrillic usernames supported (frontend regex + backend `RegisterDto` validation)
- Username case preserved on creation; lookup is case-insensitive

### Workspaces
- Create workspace (name + optional slug)
- Auto-generate slug from name via Russian/Ukrainian → Latin transliteration
- List own workspaces
- View workspace detail
- Manage workspace members — OWNER can change roles (promote/demote between ADMIN and MEMBER) and remove members; ADMIN can remove MEMBERs

### Channels
- Create channel inside workspace (name → auto-slug)
- List workspace channels
- View channel detail
- Archive/restore channels (OWNER only)
- Permanently delete channels (workspace OWNER only)
- Channel member management via Members drawer:
  - Channel roles (OWNER/ADMIN/MEMBER) are separate from workspace roles
  - OWNER/ADMIN can invite workspace members to the channel; ADMIN cannot create ADMIN invites
  - OWNER/ADMIN can remove members with role-aware rules (OWNER cannot be removed; ADMIN cannot remove another ADMIN)
  - Drawer shows explanatory copy and a link to manage workspace roles

### Messages
- Send message (text, max 4000 chars)
- **Enter to send**; Shift+Enter inserts newline
- Inline **edit** own message within 15 minutes
- Inline **delete** own message
- **Reply** to messages with parent threading
- **Forward** messages between channels
- **Reactions** — emoji toggle/replace (one per user)
- WebSocket live delivery:
  - `message:created` — new message appears instantly
  - `message:updated` — edited content updates instantly
  - `message:deleted` — message removed instantly
  - `message:reaction_changed` — reaction updates instantly
- **Channel unread counters** (B175 + B176):
  - Unread count / badge computed server-side from `ChannelReadState` and non-own messages
  - Badges update in real time when messages arrive in other channels of the active workspace
  - Opening a channel marks it read and clears the badge locally
  - Own messages and current-channel messages do not create unread badges
  - Focus regain and socket reconnect resync counts
- **Direct message unread counters** (B177):
  - Unread count / badge computed server-side from `DirectConversationParticipant.lastReadAt`
  - Opening a DM conversation marks it read and clears the badge locally
- **Global unread summary** (B178):
  - Total unread count across all channels and DMs
  - Browser tab title shows unread badge: `(N) lets-chat`
  - Sidebar shows global unread indicator when total > 0
  - Workspace-level unread badges show aggregated channel unread per workspace
  - Header shows global unread badge when total > 0
  - Realtime updates: channel and DM unread changes propagate to global total immediately
  - Limitations:
    - No push/browser notifications yet
    - No OS-level notifications yet
    - No email notifications yet

---

## 2. Current Intentional Decisions

| Decision | Rationale |
|----------|-----------|
| **UUID routing** | URLs use `/workspaces/:workspaceId/channels/:channelId`. Slug is stored in DB for display/subtitles only. |
| **No slug-based URLs** | Experimented with `/workspaces/:slug/channels/:slug`, reverted to UUIDs for stability. |
| **No auto-dedupe for slugs** | No numeric suffixes (`-2`, `-3`) on collision. Uniqueness enforced by DB unique constraint + `ConflictException`. |
| **Slug length validation** | Workspace slug rejected if shorter than 3 chars after transliteration (prevents emoji-only names like `!!!`). |
| **Frontend + backend validation** | Both layers validate inputs independently (e.g., username regex, message length). |
| **DTO unit tests** | `UpdateAvatarDto`, `CreateMessageDto`, `UpdateMessageDto` have dedicated validation specs. More DTOs covered via service-level tests. |

---

## 3. Manual Test Checklist

Use these steps to verify core functionality after deploy or before release:

- [ ] **Register** with Cyrillic username (e.g., `Валера`)
- [ ] **Login** with existing credentials
- [ ] **Logout** — token removed from sessionStorage
- [ ] **Create workspace** with Cyrillic name (e.g., `Моя Команда`) → slug auto-generated as `moya-komanda`
- [ ] **Create invalid workspace** with name like `!!!` → expect rejection (`Invalid workspace slug`)
- [ ] **Create channel** with Cyrillic name (e.g., `Загальний`) → slug auto-generated
- [ ] **Invite workspace member to channel** — invitation sent, accept flow adds user with channel role
- [ ] **Remove channel member** — OWNER/ADMIN can remove lower-role members; OWNER cannot be removed
- [ ] **Global search** — search `к` from header finds messages across workspaces, channels and DMs; clicking result opens correct channel/DM and scrolls to message
- [ ] **Send message** by pressing Enter
- [ ] **Shift+Enter** in composer inserts newline instead of sending
- [ ] **Reply to message** — reply appears in thread
- [ ] **Forward message** — message appears in target channel
- [ ] **Add reaction** — emoji reaction toggles correctly
- [ ] **Edit message** within 15 minutes — content updates for all connected clients
- [ ] **Delete message** — message disappears for all connected clients
- [ ] **Direct message** — start 1-to-1 conversation, messages appear in real time
- [x] **Two tabs / two users** — realtime events propagate correctly across sessions
- [ ] **Session management** — sign in on two browsers; Profile → Sessions shows both, marks the current session, disables revoking the current session, and "Revoke all other sessions" signs out only the other browser.
- [ ] **Reset password with same current password** → expect rejection
- [ ] **Resend domain verified** — sender domain is active in Resend dashboard
- [ ] **Verify email real Gmail delivery** — registration email arrives in inbox
- [ ] **Password reset real Gmail delivery** — reset email arrives in inbox

---

## 4. Manual QA Result

- **Date:** 2026-06-04
- **Status:** Passed
- **Notes:** Browser QA completed by user; discovered issues were fixed during stabilization. All checklist items verified manually. Test suite expanded to 536 API + 504 web + 188 page tests.

---

## 5. Phase 5 Security Hardening

- **Channels authorization unit tests** added (`channels.service.spec.ts`) — workspace membership, PRIVATE channel access, role-based update/archive (OWNER/ADMIN/MEMBER).
- **Messages authorization unit tests** added (`messages.service.spec.ts`) — workspace/PRIVATE access, author-only edit with 15-min window, role-based delete permissions.
- **WebSocket typing access revalidation** added — `broadcastTyping` revalidates channel membership on every event; revoked access triggers `typing:error`, presence cleanup, and automatic room leave.
- **Private channel E2E security smoke tests** added (`channels.e2e-spec.ts`) — 7 tests proving private channel access control through real HTTP endpoints.
- **API tests count:** 716 unit tests (32 suites)
- **Web tests count:** 677 unit tests (29 files) + 239 page tests (2 files)
- **E2E tests:** 7 passing locally (2 suites); requires Docker PostgreSQL
- **CI:** green ✅ (unit tests, builds, lint, typecheck; e2e not yet in CI)
- **Remaining known risks:**
  - E2E tests are local-only for now; CI workflow lacks PostgreSQL service
  - No broad end-to-end coverage beyond private-channel smoke tests

---

## 6. B189 QA Cleanup Checkpoint

- **B188 production verified** — session list returns `isCurrent`, current session is protected from accidental revoke, "Revoke all other sessions" works and keeps the current session active, API and frontend smoke passed in production.
- **Old Render service** — `lets-chat-api-wa43.onrender.com` returns `404`; fully decommissioned. Active backend remains `lets-chat-api-v2.onrender.com`.
- **Disposable B188 test account** — `b188-session-test-1781544153@web-library.net` was created for production QA. The API has no user self-deletion endpoint, so the account cannot be safely removed without DB/admin access. It was verified harmless:
  - email is verified;
  - 0 visible workspaces;
  - 0 direct conversations;
  - no channel memberships;
  - 1 archived smoke workspace (`B189 Smoke Workspace`) created and archived during testing, hidden from normal UI.
- **Production smoke summary**:
  - login/logout via API works;
  - dashboard, workspace, channel, direct page, profile, sessions tab load;
  - "Current session" badge and "Revoke all other sessions" button render;
  - global search opens;
  - WebSocket connects to `wss://lets-chat-api-v2.onrender.com/socket.io/` only;
  - health endpoint `ok`;
  - `node scripts/smoke-deploy.mjs` passes 10/10.

---

## 7. B190 Render Deploy Hook

- **Deployment strategy** — GitHub Actions is the source of truth for `lets-chat-api-v2` deploys. After CI is green on `main`, the workflow POSTs to a Render Deploy Hook stored in the GitHub secret `RENDER_API_V2_DEPLOY_HOOK_URL`.
- **Render Auto-Deploy** — disabled via `render.yaml` (`autoDeploy: false`). Verified end-to-end: pushes to `main` do **not** trigger Render auto-deploy; the service deploys only after the GitHub Actions hook is called.
- **One-time setup required:**
  - Render dashboard → `lets-chat-api-v2` → **Settings** → **Deploy Hook** → create and copy URL.
  - GitHub repo → **Settings** → **Secrets and variables** → **Actions** → add `RENDER_API_V2_DEPLOY_HOOK_URL`.
- **Verification** — confirmed: CI green → `Deploy API v2 to Render` job runs → Render deploys latest commit → `GET /api/v1/health` returns `ok`.

---

## 8. B191 Portfolio Readiness Checkpoint

- **Goal** — prepare the project for portfolio/resume presentation without adding new product features.
- **Docs updated:**
  - `README.md` — refreshed description, stack, production links, features, test counts, deployment flow, known limitations, and roadmap.
  - `docs/portfolio-demo.md` — new step-by-step demo guide, suggested demo flow, and screenshots checklist.
  - `docs/deployment-vercel.md` — updated smoke check counts (10 automated checks) and confirmed Auto-Deploy is off.
- **Production links:**
  - Frontend: `https://lets-chat-web.vercel.app`
  - Backend: `https://lets-chat-api-v2.onrender.com/api/v1`
  - WebSocket: `wss://lets-chat-api-v2.onrender.com`
- **Demo highlights:** auth (Cyrillic support), workspaces/channels, DMs, global search, real-time messaging, reactions, replies/forwarding, session management, attachments, localization.
- **Known limitations documented honestly:** no silent token refresh, free Render cold start, API-domain favicon 404 harmless, disposable QA account, E2E local-only, no push notifications, in-memory presence.
- **Smoke check:** `node scripts/smoke-deploy.mjs` passes 10/10.
- **Status:** project is ready for portfolio showcase.

---

## 9. B192 Product UI Polish

- **Goal** — make the app look like a clean modern SaaS chat product for portfolio/demo without adding new product features or changing backend behavior.
- **Design direction** — clean SaaS/chat app with indigo primary accent, zinc surfaces, rounded cards, consistent buttons/inputs/badges, Lucide icons, improved spacing and hierarchy.
- **What changed:**
  - Added `lucide-react` for consistent iconography.
  - Added design-system CSS variables (`primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `ring`) and updated `globals.css`.
  - Created reusable UI primitives: `Button`, `Card`, `Badge`, `Input`, `Select`, `EmptyState`, `PageHeader`, `Avatar`.
  - Polished app shell: `Header`, `Sidebar`, `layout` — better spacing, active states, icons.
  - Polished pages: `dashboard`, `workspace overview`, `channel`, `DM`, `global search`, `workspace/channel search`, `profile/sessions`, `auth` pages, `invites`, `project-status`.
  - Improved message bubbles, composer, reactions, attachments/lightbox, empty states, loading/error states.
  - Updated tests that were coupled to old CSS class names (`bg-emerald-50`, `bg-yellow-100/70`, etc.) to match the new design tokens.
- **Checks:** web lint/typecheck/test/test:pages/build ✅, API lint/typecheck/test/build:api:prod ✅, smoke 10/10 ✅.
- **Status:** UI is portfolio-ready.

---

## 10. B195 Security Audit

- **Goal** — perform a focused security audit before adding destructive features (workspace/channel delete). No product features, UI redesign, or mobile work.
- **Scope** — auth/JWT/sessions, RBAC/IDOR, workspace/channel permissions, invites, global search, uploads/attachments, CORS/env/headers, XSS/rendering safety.
- **Full report:** [`docs/security-audit.md`](security-audit.md)
- **Key findings:**
  - Authorization is enforced server-side for every workspace/channel/DM boundary; changing IDs in URLs does not grant access.
  - Invites are hashed, expiring, single-use or max-use, and role-restricted (ADMIN/MEMBER only; OWNER assignment rejected).
  - Global search applies workspace-membership and channel-participation filters before returning results; 1-character queries do not bypass visibility rules.
  - Attachments use presigned S3 URLs, 10 MB / allow-listed MIME limits, and path-traversal-safe storage keys.
  - No `dangerouslySetInnerHTML` in the frontend; React text nodes escape user-generated content.
  - Production CORS is pinned to `https://lets-chat-web.vercel.app`; no wildcard.
  - `.env`/secrets are gitignored; Render deploy hook uses a GitHub secret.
- **Fixes applied in B195:**
  - Disabled Swagger/OpenAPI in production (`apps/api/src/main.ts`) to reduce endpoint enumeration.
  - Added channel-invite OWNER-role rejection tests.
  - Added frontend XSS regression tests for author names and search snippets.
- **Known limitations documented honestly:** no rate limiting, email/username enumeration possible, 15-minute access-token window after password change, public avatar URLs are unguessable but not authenticated, S3 bucket policy dependency, no HTTP security headers yet, console mail provider logs tokens in dev only.
- **Checks:** API lint/typecheck/test ✅ (718 tests), web lint/typecheck/test ✅ (679 tests), web test:pages ✅ (239 tests), web build ✅, `build:api:prod` ✅, smoke 10/10 ✅.
- **Commit:** `f1d55c4b44b9f1075eb88bcb4b98b3d76897ab47`
- **Status:** security posture verified and documented; ready for B196 mobile responsiveness and later destructive owner actions.

---

## 11. B196 Mobile Responsiveness

- **Goal** — make the app comfortable to use on mobile/tablet for portfolio/demo without adding features or working on delete/archive behavior.
- **Scope** — auth pages, dashboard, workspace overview, channel page, DM list/conversation, global search modal, profile sessions, and the app shell sidebar.
- **Key changes:**
  - Added a mobile drawer for the sidebar: hamburger button in the header, slide-in navigation, backdrop close, auto-close on route change.
  - Made lists and cards stack vertically on narrow viewports (dashboard workspaces, workspace channels/members/invites, DM list, session cards).
  - Reduced own-message left indentation in DMs from `ml-28` to `ml-4` on mobile and widened message bubbles.
  - Made search forms, invite forms, and channel-create forms stack vertically on mobile.
  - Tuned header padding and PageHeader title size for small screens.
  - Updated public/auth page wrapper padding for narrow screens.
- **Files changed:**
  - `apps/web/src/components/AppShell.tsx`
  - `apps/web/src/components/Header.tsx`
  - `apps/web/src/components/Sidebar.tsx`
  - `apps/web/src/components/ui/PageHeader.tsx`
  - `apps/web/src/lib/locale.ts`
  - `apps/web/src/app/dashboard/page.tsx`
  - `apps/web/src/app/workspaces/[workspaceId]/page.tsx`
  - `apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx`
  - `apps/web/src/app/direct/page.tsx`
  - `apps/web/src/app/direct/[conversationId]/page.tsx`
  - `apps/web/src/components/WorkspaceInvitesSection.tsx`
  - `apps/web/src/components/ChannelMessageSearch.tsx`
  - `apps/web/src/components/WorkspaceMessageSearch.tsx`
  - `apps/web/src/components/GlobalMessageSearch.tsx`
  - `apps/web/src/app/profile/page.tsx`
  - Public/auth page wrappers
- **Visual QA:** `visual-qa/visual-qa.js` updated to capture desktop, mobile (390×844 / 375×812), and tablet (768×1024) screenshots for login, dashboard, workspace, channel, global search, DM, and profile sessions. Screenshots are generated in `visual-qa/screenshots/` (gitignored artifacts).
- **Checks:** web lint ✅, web typecheck ✅, web test ✅ (679 tests), web test:pages ✅ (239 tests), web build ✅, smoke-deploy ✅ (10/10), visual QA ✅ (16 screenshots across desktop/mobile/tablet).
- **Commit:** `ef4c4ff9c91aca05c4c300e3a02f67ee16228e2d`
- **Status:** mobile/tablet responsive pass complete; production UX verified; ready for B197 owner-only delete.

---

## 13. B197A Production Migration Hardening + B197B Owner-Only Channel Delete

### B197A — Migration hardening

- **Goal** — fix the deployment/migration gap that caused the first B197 production outage.
- **Root cause** — API code referenced `Channel.permanentlyDeletedAt` before the production PostgreSQL column was created. `render.yaml` changes did not apply to the existing Render service, so the migration never ran.
- **Chosen strategy** — GitHub Actions `migrate` job:
  - Runs `pnpm --filter @lets-chat/database migrate:deploy` with the `PRODUCTION_DATABASE_URL` secret.
  - Runs after the `ci` job and before the `deploy` job.
  - If the migration fails, the Render deploy hook is not called, so production stays on the previous working API version.
  - If `PRODUCTION_DATABASE_URL` is missing, the job warns and skips, and deployment is skipped too.
- **Docs updated** — `docs/deployment-vercel.md`, `docs/database-schema.md`.
- **Required secrets:**
  - `PRODUCTION_DATABASE_URL`
  - `RENDER_API_V2_DEPLOY_HOOK_URL`

### B197B — Owner-only channel delete

- **Goal** — allow workspace OWNER to permanently delete channels, reintroduced only after B197A pipeline was proven.
- **Schema change** — `Channel.permanentlyDeletedAt DateTime?` added via migration `20260616173000_add_channel_permanently_deleted_at`.
- **Soft-delete decision** — deleting sets both `deletedAt` and `permanentlyDeletedAt` timestamps; messages and attachments rows are kept (they no longer appear in search because the channel is excluded).
- **Permission rules:**
  - Only workspace `OWNER` can delete a channel.
  - Workspace `ADMIN`/`MEMBER` and non-members receive `403`/`404`.
  - Archived channels can also be deleted by the workspace owner.
  - Already-deleted channels return `404` on repeat delete.
- **Backend endpoint** — `DELETE /api/v1/workspaces/:workspaceId/channels/:channelId`.
- **Frontend UI** — workspace overview shows a red **Delete** button for workspace owner on active and archived channels; confirmation dialog shows channel name and explains the action is destructive; successful delete refreshes both channel lists; failure shows an inline error.
- **Visibility after delete** — deleted channels disappear from active list, archived list, direct channel fetch, and global/workspace/channel message search.
- **Tests added/updated:**
  - API: owner delete active/archived, admin/member/non-member rejection, wrong workspace, already deleted, list/search exclusion.
  - Web: owner sees Delete, non-owner does not, successful delete refreshes lists, failed delete shows error.
- **Docs updated** — `docs/project-status.md`, `docs/security-audit.md`, `docs/database-schema.md`, `docs/portfolio-demo.md`.
- **Production verification (2026-06-16):**
  - GitHub Actions run [`#27632670133`](https://github.com/Mellowin/lets-chat-modern-rebuild/actions/runs/27632670133) for commit `449243d0e09410a7d7b8f13897e1de2f0095a516` — `ci` ✅, `Migrate production database` ✅, `Deploy API v2 to Render` ✅.
  - Authenticated production smoke test against `https://lets-chat-api-v2.onrender.com/api/v1`:
    - Registered a disposable member account via catchmail.io, verified email, and accepted a workspace invite.
    - Owner `DELETE /workspaces/:ws/channels/:ch` → `200 { success: true }`.
    - Member `DELETE` on the same channel → `403 Only workspace owner can delete channels`.
    - After delete, channel absent from active list, archived list, and direct fetch (`404 Channel not found`).
  - Test workspace archived after verification to keep production tidy.

## 14. B198 Owner-Only Workspace Delete

- **Goal** — allow workspace OWNER to safely delete a workspace without physically destroying data.
- **Soft-delete decision** — workspace delete sets both `deletedAt` and `permanentlyDeletedAt` timestamps, mirroring the channel delete pattern. Channels, messages, attachments, memberships, and invites are left in the database but become inaccessible through normal UI/API/search routes.
- **Archive vs delete difference** — archived workspace has only `deletedAt` set and can be restored by the owner. Deleted workspace has both timestamps set and cannot be restored or discovered by members/non-members.
- **Schema change** — `Workspace.permanentlyDeletedAt DateTime?` added via migration `20260616202600_add_workspace_permanently_deleted_at` with index `(ownerId, permanentlyDeletedAt)`.
- **Backend endpoint** — `DELETE /api/v1/workspaces/:workspaceId`, workspace OWNER only.
- **Permission rules:**
  - Only workspace `OWNER` can delete.
  - `ADMIN`/`MEMBER` receive `403 Only owner can delete workspace`.
  - Outsiders and already-deleted workspaces return `404 Workspace not found`.
- **Cascading visibility** — all active workspace queries, channel queries, and message search CTEs exclude workspaces where `permanentlyDeletedAt IS NOT NULL`. Invite acceptance and direct channel access also fail safely for deleted workspaces.
- **Frontend UI** — workspace overview has a **Danger zone** card visible only to owner. It shows the workspace name, explains the destructive effect, and requires typing the exact workspace name before the confirm button is enabled. After success the user is redirected to `/dashboard` and the workspace is removed from sidebar/dashboard via the `workspaces:changed` event.
- **Tests added/updated:**
  - API: owner delete, admin/member/non-member rejection, already-deleted workspace, controller endpoint.
  - Web: owner sees Danger zone, non-owner does not, confirm disabled until name matches, success redirects, failure shows error.
- **Docs updated** — `docs/project-status.md`, `docs/security-audit.md`, `docs/database-schema.md`, `docs/portfolio-demo.md`.
- **Production verification** — completed 2026-06-16.
  - GitHub Actions CI/deploy run: [#27641586675](https://github.com/Mellowin/lets-chat-modern-rebuild/actions/runs/27641586675) ✅
  - API probes: owner can delete; admin/member get 403; deleted workspace/channel fetch returns 404; workspace/member lists exclude it; global search excludes its messages; workspace search on deleted workspace returns 404; invite accept fails; DMs remain available.
  - UI probe: owner can log in, open a workspace, use the Danger Zone name-confirmation flow, and is redirected to `/dashboard` after deletion.

## 15. B199 CI/CD Action Cleanup

- **Goal** — remove GitHub Actions Node.js 20 runtime deprecation warnings and document the final deployment pipeline before adding more product features.
- **Scope** — only `.github/workflows/ci.yml` and docs; no backend/frontend behavior changed.
- **Action upgrades:**
  - `actions/checkout@v4` → `actions/checkout@v6`
  - `pnpm/action-setup@v4` → `pnpm/action-setup@v6`
  - `actions/setup-node@v4` → `actions/setup-node@v6`
- **Node/pnpm strategy unchanged:** CI still builds with `node-version: 20`; pnpm version is read from `package.json#packageManager` (`pnpm@9.1.0`).
- **Pipeline safety preserved:**
  - `ci` job → `migrate` job (`needs: ci`) → `deploy` job (`needs: [ci, migrate]`).
  - `migrate` requires the `PRODUCTION_DATABASE_URL` secret; if it is missing, `should_deploy=false` and `deploy` is skipped.
  - `deploy` depends on `needs.migrate.outputs.should_deploy == 'true'` and uses the `RENDER_API_V2_DEPLOY_HOOK_URL` secret.
  - Render Auto-Deploy remains **Off**.
  - Render Start Command remains `pnpm --filter api start:prod`.
- **Docs updated** — `docs/deployment-vercel.md` (action versions, secrets, pipeline order), `docs/project-status.md`.
- **Production verification** — completed 2026-06-16.
  - GitHub Actions CI/deploy run: [#27643895631](https://github.com/Mellowin/lets-chat-modern-rebuild/actions/runs/27643895631) ✅
  - No Node.js 20 action runtime warnings remain in `.github/workflows/ci.yml`; all used actions (`actions/checkout@v6`, `pnpm/action-setup@v6`, `actions/setup-node@v6`) target Node.js 24.
  - `ci` → `migrate` → `deploy` ordering verified in the workflow and confirmed green on `main`.
  - Render health `ok`; `node scripts/smoke-deploy.mjs` public checks 10/10; Vercel production frontend responds.

## 16. B200 Silent Access-Token Refresh

- **Goal** — eliminate the user-facing logout that happened when a 15-minute access token expired while a tab stayed open.
- **Backend behavior (already implemented)** — `POST /api/v1/auth/refresh`:
  - Verifies the refresh JWT.
  - Consumes the matching active refresh-token row (sets `revokedAt`) so the same refresh token cannot be replayed.
  - Issues a new access token and a new refresh token.
  - Persists the new refresh session.
  - Logout, password change, password reset, and explicit session revocation all mark refresh-token rows as revoked.
- **Frontend behavior (new)**:
  - `apps/web/src/lib/auth-fetch.ts` wraps authenticated `fetch` calls. On `401`, it attempts a single refresh, retries the original request once with the new access token, and clears tokens if refresh fails.
  - `apps/web/src/lib/auth-fetch.ts` exports `performSilentRefresh`, a shared in-flight refresh lock used by both `authFetch` and `AuthProvider`. This coalesces startup refresh and concurrent `401` API calls into a single `POST /auth/refresh`.
  - `AuthProvider` attempts silent refresh on startup when the stored access token is expired or `/auth/me` fails.
  - Authenticated API modules route through `authFetch` so the refresh is transparent to call sites.
- **Tests added/updated:**
  - API: refresh success, invalid/expired refresh token rejection, revoked/consumed refresh token rejection, logout revokes refresh token, session revocation blocks refresh.
  - Web: `auth-fetch.test.ts` (7 tests) covers 401 refresh, refresh failure logout, concurrent 401 coalescing, and no infinite retry.
  - Web: `auth-context.test.tsx` updated to cover startup refresh from expired token, startup refresh after a rejected `/auth/me`, and refresh failure clearing state.
- **Docs updated** — `docs/security-audit.md`, `docs/portfolio-summary.md`, `README.md` (removed the "no silent token refresh" limitation).
- **Checks:** API lint/typecheck/test ✅ (745 tests), web lint/typecheck/build ✅, web test ✅ (688 tests), web test:pages ✅ (248 tests).
- **Production verification** — completed 2026-06-16.
  - GitHub Actions CI/deploy run: [#27649548286](https://github.com/Mellowin/lets-chat-modern-rebuild/actions/runs/27649548286) ✅ — `ci` ✅, `Migrate production database` ✅, `Deploy API v2 to Render` ✅.
  - `node scripts/smoke-deploy.mjs` public checks 10/10 ✅.
  - Backend refresh probe (`scripts/verify-b200-refresh.mjs`) against `https://lets-chat-api-v2.onrender.com/api/v1`:
    - registered a disposable account via catchmail.io, verified email, and logged in;
    - `POST /auth/refresh` returned new access and refresh tokens;
    - `GET /auth/me` with the new access token succeeded;
    - `POST /auth/logout` succeeded;
    - reusing the logged-out refresh token returned `401`.
  - Browser silent-refresh acceptance (`scripts/verify-b200-browser.mjs`) against `https://lets-chat-web.vercel.app` using Playwright:
    - injected valid tokens → dashboard loads authenticated;
    - replaced access token with an expired token and reloaded → exactly one `POST /auth/refresh`, `/auth/me` succeeded, user stayed logged in;
    - forced an authenticated API call (`/profile`) with expired access token → exactly one `POST /auth/refresh`, request retried and succeeded, no infinite loop;
    - revoked the current refresh token and reloaded with expired access token → `sessionStorage` cleared and UI showed auth required;
    - no tokens were printed to the browser console.

## 12. B203 Production Verification Automation Pack

- **Goal** — create a clean, repeatable production verification pack for portfolio/stability without adding product features.
- **Scripts added:**
  - `scripts/verify-production-public.mjs` — public smoke wrapper (10/10 checks).
  - `scripts/verify-production-auth.mjs` — register, verify email, login, refresh, logout, revoked-token rejection.
  - `scripts/verify-production-permissions.mjs` — owner/member workspace and channel permissions; destructive delete tests require `VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE=1`.
  - `scripts/verify-production-browser.mjs` — Playwright desktop + mobile sanity, B202C search validation, owner/non-owner delete UI.
  - `scripts/lib/verify-helpers.mjs` — shared Mail.tm + API helpers; no tokens/passwords printed.
- **Package scripts:**
  - `pnpm verify:prod:public`
  - `pnpm verify:prod:auth`
  - `pnpm verify:prod:permissions`
  - `pnpm verify:prod:browser`
  - `pnpm verify:prod:all`
- **GitHub Actions:** `.github/workflows/production-verify.yml` is manual-only (`workflow_dispatch`) with selectable suites; no automatic destructive tests.
- **Docs:** `docs/production-verification.md` created; `docs/final-qa-checklist.md` and `docs/project-status.md` updated.
- **Safety:** no hardcoded passwords; no committed credentials; disposable accounts named with timestamp; workspaces deleted after verification; public smoke requires no secrets.
- **Verification result (2026-06-17):**
  - `pnpm verify:prod:public` — 10/10 ✅
  - `pnpm verify:prod:auth` — 5/5 ✅
  - `VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE=1 pnpm verify:prod:permissions` — 17/17 ✅
  - `pnpm verify:prod:browser` — 9/9 ✅

## 13. Known Limitations

- **Invite link QA is manual** — email delivery of targeted invites and end-to-end invite accept flow are not covered by automated E2E tests; manual verification in production (or a local environment with SMTP) is required. Targeted email invites require the recipient's account email to match the invite email exactly.
- **No slug-based URLs** — routing is strictly UUID-based; slugs are cosmetic only.
- **No auto-dedupe** — duplicate slugs return `409 Conflict`; user must pick a different name.
- **Password reset and authenticated password change revoke existing refresh sessions** — old devices must re-login after password change.
- **Authenticated users can list their refresh sessions and revoke active sessions** — via `GET /auth/sessions`, `POST /auth/sessions/:sessionId/revoke`, and `POST /auth/sessions/revoke-others` (keeps the current session active). `POST /auth/sessions/revoke-all` still revokes every session including the current one.
- **Profile page includes grouped settings layout** — Account (info, email change, avatar, display name), Security (change password with show/hide toggles), Sessions (collapsed by default with explanation and active count, expandable list with revoke-all), and Language (interface language selector).
- **Email change flow invalidates older pending requests** — when a user requests a new email change, any previous pending email-change token is overwritten and becomes invalid. Only the latest confirmation link works. Requests to change to the current email are rejected.
  - Password fields have eye icon show/hide toggles per field.
  - Sessions are hidden behind a "Show sessions" toggle with a short explanation of what sessions are.
  - Device/IP metadata is displayed when captured; it may be unavailable for sessions created before this improvement or when requests pass through proxies/CDNs that strip the headers.
- **Production smoke verifies protected auth/session endpoints reject anonymous requests** — `GET /auth/sessions`, `POST /auth/sessions/revoke-all`, `POST /auth/sessions/revoke-others`, `POST /auth/change-password` checked for `401` without token.
- **Public `/project-status` page added for portfolio/employer review** — honest overview of implemented and planned features, tech stack, and production links.
- **Production smoke verifies public `/project-status` page** — checked for `200` and expected content.
- **B200 silent access-token refresh** — `AuthProvider` attempts to refresh an expired or rejected access token on startup and during authenticated API calls. The refresh endpoint rotates refresh tokens (single-use consumption) and rejects revoked or expired sessions. Concurrent `401` responses are coalesced into one refresh request. If refresh fails, the client clears its tokens and requires re-login.
- **Channel attachments support file picker, drag-and-drop, image previews, upload progress, retry, presigned upload, message rendering, authenticated download URLs, and orphaned upload cleanup** — frontend composer supports selecting up to 5 files (validated MIME/size), drag-and-drop into the composer, thumbnail previews for images before send, upload progress per file with retry on failure, inline image previews in the message list, file cards for non-image attachments, presigned upload to storage, secure download via backend download-url endpoint, and a cleanup script that removes orphaned storage objects older than a configurable threshold by comparing against the Attachment table; gallery/lightbox is still in progress.
- **Frontend API timeout and recovery UX** — all API requests have a 15-second `AbortController` timeout. When the backend is cold-starting or unreachable, login stops loading and shows a human-friendly message with a cold-start hint instead of hanging forever on "Signing in…". Users can retry immediately.
- **Workspace invite links are available end-to-end** — OWNER/ADMIN can create targeted email/username invites and public invite links with `maxUses` from the workspace page, copy the generated link, list/revoke active invites, and preview the invite at `/invites/:token` without authentication. Recipients can open the invite link, see workspace name and expiry, and accept the invite (authenticated users) or sign in first (unauthenticated users). `POST /invites/:token/accept` adds the user to the workspace; already-member users receive a safe current-membership response. Expired, revoked, or max-uses-reached links are rejected.
- **Global message search is available** — backend endpoint `GET /api/v1/me/search/messages` searches all messages the current user can access across workspaces (public channels + private channels they are a member of) and direct messages; supports 1-character substring queries, newest-first sorting, cursor pagination; frontend modal reachable from the header shows mixed results with source labels and navigates to the correct channel or DM message. Limitation: uses `ILIKE` substring matching, so very large message histories may need a dedicated search index in the future.
- **Workspace message search is available** — backend endpoint `GET /api/v1/workspaces/:workspaceId/search/messages` plus frontend UI with search panel, results list, load-more pagination, safe query highlighting, attachment-only fallback, and jump-to-message.
- **Channel message search is available** — backend endpoint `GET /api/v1/workspaces/:workspaceId/channels/:channelId/messages/search` plus frontend UI with search panel, results list, load-more pagination, safe query highlighting, attachment-only fallback, and jump-to-message.
- **Channel unread counters** — read-state tracking and realtime badge sync are implemented. Limitations:
  - No push/browser notifications yet
  - Realtime unread updates are scoped to the active workspace (channels in non-active workspaces update only on next refetch/focus)
  - No per-thread unread counts (only channel-level)
  - Cross-device read sync relies on the next channel-list refetch; other devices do not get immediate badge-clear events
  - Backend message context API is available for search-result jump support: `GET /api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/context` returns target message with configurable before/after surrounding messages.
  - **Search result context mode**: when a user clicks a search result that is not currently loaded in the timeline, the frontend fetches the message context via the backend API, temporarily replaces the message list with the context window (target + surrounding messages), and provides a "Back to latest messages" banner to return to the normal timeline. The target message is highlighted and scrolled into view automatically.
  - Limitations: channel-only search (no global/workspace-wide search via this endpoint), message content only (attachment filename search is not implemented), no DM search yet.

---

## 9. Orphaned Attachment Cleanup

A cleanup script removes storage objects that were uploaded but never attached to a message.

**Script:** `apps/api/scripts/cleanup-orphaned-attachments.mjs`

**How it works:**
- Lists all storage objects under the `attachments/` prefix.
- Compares object keys against active `Attachment.storageKey` rows in the database.
- Skips objects newer than the age threshold (default: 24 hours) to avoid deleting in-progress uploads.
- Defaults to **dry-run**; no objects are deleted unless `--delete` is passed.

**Run dry-run (safe, recommended first step):**
```bash
node apps/api/scripts/cleanup-orphaned-attachments.mjs
```

**Actually delete orphaned objects:**
```bash
node apps/api/scripts/cleanup-orphaned-attachments.mjs --delete
```

**Environment variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `S3_ENDPOINT` | — | S3/MinIO endpoint |
| `S3_REGION` | — | S3 region |
| `S3_ACCESS_KEY` | — | S3 access key |
| `S3_SECRET_KEY` | — | S3 secret key |
| `S3_BUCKET` | — | Bucket name |
| `S3_FORCE_PATH_STYLE` | `true` | Use path-style URLs |
| `CLEANUP_AGE_HOURS` | `24` | Minimum age in hours to consider an object orphaned |

**Recommended schedule:** Run dry-run periodically (e.g., weekly). Run with `--delete` after confirming the dry-run output looks correct.

**Safety measures:**
- Dry-run by default.
- Requires explicit `--delete` flag for destructive operations.
- Age threshold prevents deletion of recently uploaded files that may still be in a user's composer.
- DB comparison ensures valid attachments are never deleted.
