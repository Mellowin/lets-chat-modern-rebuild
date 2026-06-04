# Project Status

> Last updated: 2026-06-04  
> Code checkpoint: `de8330d`  
> Docs checkpoint: `de8330d`

---

## 1. Current Implemented Features

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

### Channels
- Create channel inside workspace (name → auto-slug)
- List workspace channels
- View channel detail
- Archive/restore channels (OWNER only)

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
- [ ] **Send message** by pressing Enter
- [ ] **Shift+Enter** in composer inserts newline instead of sending
- [ ] **Reply to message** — reply appears in thread
- [ ] **Forward message** — message appears in target channel
- [ ] **Add reaction** — emoji reaction toggles correctly
- [ ] **Edit message** within 15 minutes — content updates for all connected clients
- [ ] **Delete message** — message disappears for all connected clients
- [ ] **Direct message** — start 1-to-1 conversation, messages appear in real time
- [x] **Two tabs / two users** — realtime events propagate correctly across sessions

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
- **API tests count:** 536 unit tests (24 suites)
- **Web tests count:** 504 unit tests (18 files) + 188 page tests (2 files)
- **E2E tests:** 7 passing locally (2 suites); requires Docker PostgreSQL
- **CI:** green ✅ (unit tests, builds, lint, typecheck; e2e not yet in CI)
- **Remaining known risks:**
  - E2E tests are local-only for now; CI workflow lacks PostgreSQL service
  - No broad end-to-end coverage beyond private-channel smoke tests

---

## 6. Known Limitations

- **No slug-based URLs** — routing is strictly UUID-based; slugs are cosmetic only.
- **No auto-dedupe** — duplicate slugs return `409 Conflict`; user must pick a different name.
- **No file attachments** — text-only messages.
- **No message search** — not implemented.
