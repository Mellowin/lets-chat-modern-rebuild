# Project Status

> Last updated: 2026-06-12  
> Code checkpoint: `5fbc023729414b8d7ecab8222c76f368a627daf5`  
> Docs checkpoint: `main`

---

## 1. Deployment Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Frontend (Vercel-ready)** | ✅ Prepared | `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` env wiring, production fallback guards, build docs |
| **Backend (external host)** | ✅ Ready | Persistent Node.js + Socket.io; CORS via `CORS_ORIGIN` env; health endpoint |
| **Database** | ✅ Ready | Prisma migrations; PostgreSQL 15+ |
| **Email** | ✅ Ready | Resend or console dev mode; `APP_WEB_URL` for link generation |

See [`docs/deployment-vercel.md`](deployment-vercel.md) for full deployment guide.

---

## 2. Current Implemented Features

### Authentication
- Registration with email, username, password
- Login with email + password
- Logout (clears sessionStorage)
- Access/refresh token rotation
- **sessionStorage** isolates sessions per browser tab (no cross-tab logout collisions)
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
- [ ] **Send message** by pressing Enter
- [ ] **Shift+Enter** in composer inserts newline instead of sending
- [ ] **Reply to message** — reply appears in thread
- [ ] **Forward message** — message appears in target channel
- [ ] **Add reaction** — emoji reaction toggles correctly
- [ ] **Edit message** within 15 minutes — content updates for all connected clients
- [ ] **Delete message** — message disappears for all connected clients
- [ ] **Direct message** — start 1-to-1 conversation, messages appear in real time
- [x] **Two tabs / two users** — realtime events propagate correctly across sessions
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
- **API tests count:** 695 unit tests (31 suites)
- **Web tests count:** 649 unit tests (28 files) + 239 page tests (2 files)
- **E2E tests:** 7 passing locally (2 suites); requires Docker PostgreSQL
- **CI:** green ✅ (unit tests, builds, lint, typecheck; e2e not yet in CI)
- **Remaining known risks:**
  - E2E tests are local-only for now; CI workflow lacks PostgreSQL service
  - No broad end-to-end coverage beyond private-channel smoke tests

---

## 6. Known Limitations

- **Invite link QA is manual** — email delivery of targeted invites and end-to-end invite accept flow are not covered by automated E2E tests; manual verification in production (or a local environment with SMTP) is required. Targeted email invites require the recipient's account email to match the invite email exactly.
- **No slug-based URLs** — routing is strictly UUID-based; slugs are cosmetic only.
- **No auto-dedupe** — duplicate slugs return `409 Conflict`; user must pick a different name.
- **Password reset and authenticated password change revoke existing refresh sessions** — old devices must re-login after password change.
- **Authenticated users can list their refresh sessions and revoke active sessions** — via `GET /auth/sessions` and `POST /auth/sessions/revoke-all`.
- **Profile page includes grouped settings layout** — Account (info, email change, avatar, display name), Security (change password with show/hide toggles), Sessions (collapsed by default with explanation and active count, expandable list with revoke-all), and Language (interface language selector).
- **Email change flow invalidates older pending requests** — when a user requests a new email change, any previous pending email-change token is overwritten and becomes invalid. Only the latest confirmation link works. Requests to change to the current email are rejected.
  - Password fields have eye icon show/hide toggles per field.
  - Sessions are hidden behind a "Show sessions" toggle with a short explanation of what sessions are.
- **Production smoke verifies protected auth/session endpoints reject anonymous requests** — `GET /auth/sessions`, `POST /auth/sessions/revoke-all`, `POST /auth/change-password` checked for `401` without token.
- **Public `/project-status` page added for portfolio/employer review** — honest overview of implemented and planned features, tech stack, and production links.
- **Production smoke verifies public `/project-status` page** — checked for `200` and expected content.
- **Channel attachments support file picker, drag-and-drop, image previews, upload progress, retry, presigned upload, message rendering, authenticated download URLs, and orphaned upload cleanup** — frontend composer supports selecting up to 5 files (validated MIME/size), drag-and-drop into the composer, thumbnail previews for images before send, upload progress per file with retry on failure, inline image previews in the message list, file cards for non-image attachments, presigned upload to storage, secure download via backend download-url endpoint, and a cleanup script that removes orphaned storage objects older than a configurable threshold by comparing against the Attachment table; gallery/lightbox is still in progress.
- **Frontend API timeout and recovery UX** — all API requests have a 15-second `AbortController` timeout. When the backend is cold-starting or unreachable, login stops loading and shows a human-friendly message with a cold-start hint instead of hanging forever on "Signing in…". Users can retry immediately.
- **Workspace invite links are available end-to-end** — OWNER/ADMIN can create targeted email/username invites and public invite links with `maxUses` from the workspace page, copy the generated link, list/revoke active invites, and preview the invite at `/invites/:token` without authentication. Recipients can open the invite link, see workspace name and expiry, and accept the invite (authenticated users) or sign in first (unauthenticated users). `POST /invites/:token/accept` adds the user to the workspace; already-member users receive a safe current-membership response. Expired, revoked, or max-uses-reached links are rejected.
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

## 7. Orphaned Attachment Cleanup

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
