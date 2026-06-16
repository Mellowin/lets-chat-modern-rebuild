# Security Audit (B195)

> **Scope:** authentication, sessions, RBAC/IDOR, workspace/channel permissions, invites, global search, uploads/attachments, CORS/environment secrets, XSS/rendering safety.
> **Date:** 2026-06-15 (updated 2026-06-16 for B197B, B198, and B200)
> **Commit:** `f1d55c4b44b9f1075eb88bcb4b98b3d76897ab47` (B195 baseline; B197B adds owner-only channel delete; B198 adds owner-only workspace delete)
> **Auditor:** Kimi Code CLI (automated code review + local tests + production probes)
> **Verdict:** No critical vulnerabilities found. Authorization boundaries are enforced server-side. A few hardening improvements were applied during this audit; remaining items are documented as known limitations.

---

## 1. Executive Summary

The application follows a reasonable security posture for a portfolio-grade realtime chat app:

- JWT access/refresh tokens are short-lived, signed with separate secrets, and refresh tokens are hashed and single-use-rotated.
- Every workspace/channel/DM access check is performed on the backend; the frontend cannot bypass authorization by changing IDs.
- Invites are token-hashed, expiring, scoped to workspace/channel, and role-restricted.
- Global search is backed by SQL that filters by workspace membership and channel participation before returning results.
- Attachment uploads use presigned S3 URLs, size/MIME validation, and path-traversal-safe storage keys.
- User-generated content is rendered through React text nodes; no `dangerouslySetInnerHTML` is used.
- Production CORS is pinned to the Vercel frontend origin; no wildcard.
- `.env`/secrets are not committed; the Render deploy hook uses a GitHub secret.

During this audit we:

- Disabled Swagger/OpenAPI in production to reduce endpoint enumeration.
- Added XSS regression tests for author names and search snippets.
- Added invite role-boundary regression tests for channel invites.
- Verified production headers and error responses manually.

---

## 2. Per-Area Findings

### 2.1 Auth / JWT / Sessions

| Check | Status | Notes |
|-------|--------|-------|
| Access token handling | ✅ | 15-minute expiry, `HS256`, signed with `JWT_ACCESS_SECRET` (min 32 chars enforced). |
| Refresh token/session storage | ✅ | Stored as SHA-256 hash in `RefreshToken`; raw token returned once at creation/refresh. |
| Expired token behavior | ✅ | Both HTTP guard and WebSocket connection reject expired tokens with generic messages. HTTP clients silently refresh expired access tokens using stored refresh tokens. |
| Silent access-token refresh | ✅ | `authFetch` intercepts `401`, refreshes once, retries the original request, and coalesces concurrent refreshes. `AuthProvider` refreshes on startup when the access token is expired. |
| Logout behavior | ✅ | Logout revokes the refresh-token hash; sessionStorage is cleared on the client. |
| Session revocation | ✅ | Users can list, revoke single, revoke all, and revoke all-other sessions. Current session is protected from accidental self-revoke. |
| Current session protection | ✅ | `revoke-others` requires the current `sessionId` (JWT `jti`). |
| Token exposure | ✅ | Tokens are not logged by the API filter; console dev-mail logs verification/reset links only when `MAIL_PROVIDER=console`. |

**Tests:** `auth.service.spec.ts`, `token.service.spec.ts`, `jwt-access.guard.spec.ts`, `auth-context.test.tsx`, `auth-fetch.test.ts`.

**Limitation:** Access tokens remain valid until expiry even after a password change; only refresh tokens are revoked. This is acceptable given the 15-minute access-token TTL but should be noted for high-security scenarios.

---

### 2.2 RBAC / IDOR Protection

| Resource | Authorization Gate |
|----------|--------------------|
| Workspace detail | Backend verifies active workspace membership; non-members receive `404`. |
| Workspace members/audit | OWNER/ADMIN only. |
| Workspace archive/restore/transfer | OWNER only. |
| Channel detail | Active workspace member **and** active channel member required. |
| Channel archive/restore | Channel OWNER only. |
| Channel permanent delete | Workspace OWNER only; admin/member/non-member rejected. |
| Channel member management | Channel OWNER/ADMIN; ADMIN cannot remove/change another ADMIN or OWNER. |
| DM messages | `DirectConversationParticipant` check on every read/write. |
| Sessions | Users can only see/revoke their own refresh sessions. |

**IDOR spot-checks performed:**
- Changing `workspaceId`/`channelId` in URLs to foreign resources → `404` or `403`.
- Requesting another user's sessions → `401` (no token) or only own sessions.
- Listing DMs without being a participant → `403 Access denied`.

**Tests:** `workspaces.service.spec.ts`, `channels.service.spec.ts`, `channels.e2e-spec.ts`, `messages.service.spec.ts`, `direct-conversations.service.spec.ts`.

---

### 2.3 Workspace / Channel Permissions

- Workspace roles: OWNER > ADMIN > MEMBER.
- Only OWNER can archive/restore workspace, transfer ownership, or change member roles.
- ADMIN can add/remove MEMBERs but not OWNER/ADMIN.
- Any workspace member can create a channel and becomes its channel OWNER.
- Channel OWNER can archive/restore and manage channel members.
- Workspace OWNER can permanently delete channels (active or archived).
- Workspace OWNER can permanently delete a workspace; ADMIN/MEMBER/outsider cannot.
- Deleted workspace makes channels, messages, invites, and members inaccessible through API/UI/search, but no rows are hard-deleted.
- Channel ADMIN can invite MEMBERs and remove MEMBERs; cannot create ADMIN invites.

These rules are enforced in `WorkspacesService` and `ChannelsService` and are covered by unit tests.

---

### 2.4 Invites Security

| Check | Status | Notes |
|-------|--------|-------|
| Public invite links | ✅ | Only OWNER/ADMIN can create; require `maxUses` (1–1000). |
| Targeted invites | ✅ | By registered email/username only; target must exist and not already be a member. |
| Role selection | ✅ | DTO restricts roles to `ADMIN`/`MEMBER`; service rejects `OWNER` as defense in depth. |
| Admin inviting admins | ❌ | Rejected for both workspace and channel invites. |
| Expired/used invites | ✅ | Accept returns `410` (expired/max-uses) or `409` (already used). |
| Revoke | ✅ | Only OWNER/ADMIN; used single-use invites cannot be revoked (idempotent conflict). |
| Invite link to archived workspace | ✅ | `accept` re-fetches the active workspace and returns `404` if archived. |
| Email mismatch | ✅ | Targeted invites require the accepting user's email to match. |
| Token storage | ✅ | SHA-256 hash stored; raw token returned only once at creation. |

**Tests:** `invites.service.spec.ts`, `channel-invites.service.spec.ts` (including new OWNER-role rejection tests).

**Note:** The UI labels some actions as "Add member" / "Invite" but the backend treats targeted email/username invites as single-use tokens. Public links are visually distinct and require `maxUses`.

---

### 2.5 Global Search Privacy

Backend query logic (`MessagesSearchService.searchGlobal`):

1. Builds `accessible_channels` CTE from workspaces the user is a member of, returning only `PUBLIC` channels **or** `PRIVATE` channels where the user is an active `ChannelMember`.
2. Builds `accessible_conversations` CTE from `DirectConversationParticipant` for the current user.
3. Searches `Message` and `DirectMessage` content with `ILIKE`, scoped to those CTEs.
4. Cursor resolution also checks both message tables, but the final query still applies visibility filters.

**Verified:**
- 1-character queries (`q: "к"`) still apply visibility filters.
- Private channel messages do not leak to non-members.
- DM messages do not leak to third parties.

**Tests:** `messages-search.service.spec.ts`.

**Known limitation:** `accessible_channels` includes public channels the user has **not** joined. The search result can therefore show public-channel message snippets to any workspace member, even though the channel-detail endpoint requires channel membership. This is a UX inconsistency, not a leak of private data.

---

### 2.6 Uploads / Attachments

| Check | Status | Notes |
|-------|--------|-------|
| File size limit | ✅ | 10 MB enforced in DTO and service. |
| Allowed MIME types | ✅ | PNG, JPEG, WebP, PDF, plain text only. |
| Path traversal protection | ✅ | Filenames are sanitized to `[a-zA-Z0-9._-]`; storage key is `attachments/{userId}/{uuid}-{sanitized}`. |
| Missing-avatar fallback | ✅ | `uploads-fallback.middleware` returns a transparent PNG with `Content-Type: image/png`. |
| Attachment URL exposure | ✅ | Download URLs are time-limited S3 presigned URLs; the service validates channel/message membership before issuing them. |
| Orphan uploads | ✅ | Cleanup script compares S3 objects against the `Attachment` table and dry-runs by default. |

**Tests:** `attachments.service.spec.ts`, `presign-attachment.dto.spec.ts`, `uploads-fallback.middleware.spec.ts`.

**Known limitation:** The current storage setup assumes the S3 bucket is not publicly listable. If the bucket policy is misconfigured, direct object URLs could be accessed without the presigned URL. This is an infrastructure concern, not a code bug.

---

### 2.7 CORS / Env / Headers

| Check | Status | Notes |
|-------|--------|-------|
| Production CORS wildcard | ✅ | Confirmed via `OPTIONS` probe: `Access-Control-Allow-Origin: https://lets-chat-web.vercel.app` (not `*`). |
| Allowed origins | ✅ | HTTP CORS reads `CORS_ORIGIN`; WebSocket CORS splits comma-separated values. Render dashboard must set `CORS_ORIGIN`. |
| `NEXT_PUBLIC_*` secrets | ✅ | Only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` are used; no secrets exposed to the browser bundle. |
| Deploy hook/API secrets committed | ✅ | `RENDER_API_V2_DEPLOY_HOOK_URL` is a GitHub secret; not in source. |
| Production error stack traces | ✅ | Probed a non-existent route; response contains status, code, message, requestId, timestamp, path — no stack trace. |
| Security headers | ⚠️ | No `Helmet` or equivalent headers (HSTS, CSP, X-Frame-Options, etc.). This is a recommended hardening item, not a vulnerability. |

**Files:** `main.ts`, `websocket.gateway.ts`, `.github/workflows/ci.yml`, `render.yaml`, `apps/web/src/lib/env.ts`.

---

### 2.8 XSS / Rendering Safety

| Surface | Rendering Method | Safe? |
|---------|------------------|-------|
| Message content | React text nodes / `highlightText` | ✅ No `dangerouslySetInnerHTML`. |
| Usernames / display names | React text nodes | ✅ |
| Workspace / channel names | React text nodes | ✅ |
| Filenames | React text nodes | ✅ |
| Search snippets | `highlightText` returns React elements | ✅ |
| Invite token in URL | Read from query param, used in API body | ✅ |
| Avatar `src` | `<img src={avatarUrl}>` | ✅ Preset URLs only; uploaded avatars get random filenames. |

**Tests added:**
- `MessageAuthor.test.tsx` — HTML in displayName/username is escaped.
- `GlobalMessageSearch.test.tsx` — HTML in message content and search highlight is escaped.

---

## 3. Fixes Made During B195

1. **Disabled Swagger/OpenAPI in production** (`apps/api/src/main.ts`)
   - Reduces endpoint enumeration attack surface.
   - Docs remain available in development.
2. **Added channel-invite OWNER-role rejection tests** (`apps/api/src/channel-invites/channel-invites.service.spec.ts`)
   - Ensures `create` rejects `OWNER` role assignment.
   - Ensures `acceptById` rejects OWNER-role invites.
3. **Added frontend XSS regression tests**
   - `apps/web/src/components/MessageAuthor.test.tsx`
   - `apps/web/src/components/GlobalMessageSearch.test.tsx`

---

## 4. Tests Added / Updated

| File | What was added |
|------|----------------|
| `apps/api/src/channel-invites/channel-invites.service.spec.ts` | `should reject OWNER role assignment in channel invite`, `should reject accept for OWNER role invite` |
| `apps/web/src/components/MessageAuthor.test.tsx` | `escapes HTML in displayName and username to prevent XSS` |
| `apps/web/src/components/GlobalMessageSearch.test.tsx` | `escapes HTML in message content and search highlighting does not inject scripts` |

Existing security-relevant test suites (not changed) that remain green:

- `apps/api/src/auth/**/*.spec.ts`
- `apps/api/src/workspaces/workspaces.service.spec.ts`
- `apps/api/src/channels/channels.service.spec.ts`
- `apps/api/src/channels/channels.e2e-spec.ts`
- `apps/api/src/messages/messages.service.spec.ts`
- `apps/api/src/messages/messages-search.service.spec.ts`
- `apps/api/src/messages/attachments.service.spec.ts`
- `apps/api/src/direct-conversations/direct-conversations.service.spec.ts`
- `apps/api/src/invites/invites.service.spec.ts`
- `apps/web/src/lib/auth-context.test.tsx`

---

## 5. Known Remaining Limitations

1. **No rate limiting** — login, register, forgot-password, and invite endpoints could be abused for brute-force or email spam. Infrastructure-level rate limiting (e.g., Render/Vercel edge rules) or an API middleware is recommended.
2. **Email/username enumeration** — registration and login responses disclose whether an email/username exists or whether an account is unverified.
3. **Access-token window after password change** — access tokens live up to 15 minutes after a password reset/change.
4. **Public avatar URLs** — uploaded avatars are served as static files with unguessable random filenames. They are not authenticated, so anyone with the URL can view them.
5. **S3 bucket policy dependency** — attachment security relies on the bucket not being publicly listable and on presigned URLs.
6. **No HTTP security headers** — HSTS, CSP, X-Frame-Options, etc. are not configured.
7. **Console mail provider logs tokens in development** — only use `MAIL_PROVIDER=resend` in production.
8. **Swagger disabled in production** — confirmed as intentional hardening.

---

## 6. Recommended Future Hardening

- Add rate limiting (e.g., `@nestjs/throttler`) to auth and invite flows.
- Introduce `helmet`-style security headers, configured to allow cross-origin avatar image requests.
- Consider signing avatar URLs or proxying them through an authenticated endpoint for sensitive deployments.
- Review public-channel search behavior and decide whether non-members should see snippets.
- Add periodic secret rotation for JWT and S3 credentials.
- Add Content Security Policy once the frontend is stable.
- Run periodic dependency audits (`pnpm audit`).

---

## 7. Verification Commands (B195)

Run locally:

```bash
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web test:pages
pnpm --filter web build
pnpm run build:api:prod
node scripts/smoke-deploy.mjs
```

Local B195 results: API lint/typecheck/test ✅ (718 tests), web lint/typecheck/test ✅ (679 tests), web test:pages ✅ (239 tests), web build ✅, `build:api:prod` ✅, smoke 10/10 ✅.

Production probes performed:

```bash
# CORS origin check
curl -I -X OPTIONS \
  -H "Origin: https://lets-chat-web.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  https://lets-chat-api-v2.onrender.com/api/v1/health

# Error response check (no stack trace)
curl https://lets-chat-api-v2.onrender.com/api/v1/this-does-not-exist

# Swagger/OpenAPI disabled in production
curl -I https://lets-chat-api-v2.onrender.com/api/docs
# Expected: HTTP 404
```

Expected production headers:

- `access-control-allow-origin: https://lets-chat-web.vercel.app`
- Error JSON contains `statusCode`, `code`, `message`, `requestId`, `timestamp`, `path` — no `stack`.
