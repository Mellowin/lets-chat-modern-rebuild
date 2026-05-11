# API Design Specification

> **Style:** RESTful JSON  
> **Version:** `/api/v1`  
> **Auth:** JWT access token in `Authorization: Bearer <token>` header  
> **Date:** 2026-05-11  
> **Status:** Complete — all parts populated  

---

## 1. Overview & Principles

1. **REST only.** No GraphQL in MVP. WebSocket is for real-time broadcasts, not CRUD transport.
2. **All endpoints are versioned** under `/api/v1`. No unversioned routes.
3. **Soft delete is implicit.** `DELETE` requests set `deletedAt`. There is no hard-delete endpoint for business entities in MVP.
4. **Cursor pagination** on list endpoints (`cursor` + `limit`). No `skip`/`offset`.
5. **Idempotency keys** are not required in MVP. Retry safety is handled by client-side deduplication.
6. **Request/response bodies are camelCase.** Prisma models also use camelCase for consistency.
7. **File uploads use presigned URLs.** No `multipart/form-data` upload endpoints. Client requests a presigned URL, uploads directly to S3/MinIO, then references the `attachmentId` in message creation.

---

## 2. Base URL & Versioning

```
Base URL: https://api.example.com/api/v1
```

All routes below are relative to this base.

| Header | Required | Value Example |
|--------|----------|---------------|
| `Authorization` | Yes (except auth endpoints) | `Bearer eyJhbG...` |
| `Content-Type` | Yes (POST/PATCH) | `application/json` |
| `X-Request-Id` | No | UUID for tracing |

---

## 3. Part 1 — Authentication

### 3.1 Register

```http
POST /auth/register
```

Creates a local user account.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePass123!",
  "displayName": "John Doe"
}
```

**Validation:**
- `email`: valid email format, lowercased, unique
- `username`: `/^[a-zA-Z0-9_-]+$/`, 3–30 chars, unique
- `password`: min 8 chars, at least one letter + one number
- `displayName`: optional, max 100 chars

**Response 201:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "displayName": "John Doe",
    "avatarUrl": null,
    "createdAt": "2026-05-11T12:00:00Z"
  }
}
```

**Errors:**
- `400 VALIDATION_ERROR` — invalid payload
- `409 CONFLICT` — email or username already exists

---

### 3.2 Login

```http
POST /auth/login
```

Authenticates user and sets HTTP-only refresh token cookie.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": { /* same as register */ }
}
```

**Cookies:**
```
Set-Cookie: refresh_token=eyJhbG...; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

**Errors:**
- `401 UNAUTHORIZED` — invalid credentials
- `423 LOCKED` — account temporarily locked (auth throttling)

---

### 3.3 Refresh Token

```http
POST /auth/refresh
```

Rotates refresh token. Requires `refresh_token` HTTP-only cookie.

**Request:** No body. Cookie is sent automatically.

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

**Cookies:**
```
Set-Cookie: refresh_token=new_token...; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

**Errors:**
- `401 UNAUTHORIZED` — missing/invalid/expired refresh token cookie

---

### 3.4 Logout

```http
POST /auth/logout
```

Revokes current refresh token and clears cookie.

**Request:** No body. Cookie is sent automatically.

**Response 204:** Empty body.

**Cookies:**
```
Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0
```

---

## 4. Part 1 — User

### 4.1 Get Current User

```http
GET /users/me
```

**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "displayName": "John Doe",
  "avatarUrl": "https://...",
  "createdAt": "2026-05-11T12:00:00Z",
  "updatedAt": "2026-05-11T12:00:00Z"
}
```

---

### 4.2 Update Current User

```http
PATCH /users/me
```

**Request:**
```json
{
  "displayName": "Johnny",
  "avatarUrl": "https://..."
}
```

**Response 200:** Updated user object.

**Errors:**
- `400 VALIDATION_ERROR` — invalid fields

---

## 5. Part 1 — Workspace

### 5.1 Create Workspace

```http
POST /workspaces
```

**Permission:** Authenticated user.

**Request:**
```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "description": "Main workspace"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "description": "Main workspace",
  "ownerId": "user-uuid",
  "createdAt": "2026-05-11T12:00:00Z"
}
```

**Errors:**
- `409 CONFLICT` — slug already exists

---

### 5.2 List My Workspaces

```http
GET /workspaces
```

Returns workspaces where the authenticated user is a member (OWNER, ADMIN, or MEMBER).

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "description": "Main workspace",
      "ownerId": "user-uuid",
      "myRole": "OWNER",
      "createdAt": "2026-05-11T12:00:00Z"
    }
  ],
  "nextCursor": null
}
```

**Query params:**
- `limit` — max 50, default 20
- `cursor` — pagination cursor (optional)

---

### 5.3 Get Workspace

```http
GET /workspaces/:workspaceId
```

**Permission:** `IsWorkspaceMember`

**Response 200:** Workspace object + `myRole`.

---

### 5.4 Update Workspace

```http
PATCH /workspaces/:workspaceId
```

**Permission:** `@RequireWorkspaceRole('OWNER', 'ADMIN')`

**Request:**
```json
{
  "name": "Acme Corp Updated",
  "description": "New description"
}
```

**Note:** `slug` is not mutable in MVP (see `decisions.md` D6).

---

### 5.5 Archive (Soft Delete) Workspace

```http
DELETE /workspaces/:workspaceId
```

**Permission:** `@RequireWorkspaceRole('OWNER')` only.

**Response 204.**

**Note:** Workspace OWNER cannot delete if they are the sole owner. Must transfer ownership first (`permissions.md` §4.2).

---

### 5.6 List Workspace Members

```http
GET /workspaces/:workspaceId/members
```

**Permission:** `IsWorkspaceMember`

**Response 200:**
```json
{
  "data": [
    {
      "userId": "uuid",
      "role": "ADMIN",
      "username": "johndoe",
      "displayName": "John Doe",
      "avatarUrl": "https://...",
      "joinedAt": "2026-05-11T12:00:00Z"
    }
  ],
  "nextCursor": null
}
```

---

### 5.7 Update Member Role

```http
PATCH /workspaces/:workspaceId/members/:userId/role
```

**Permission:** `@RequireWorkspaceRole('OWNER')`

**Request:**
```json
{
  "role": "ADMIN"
}
```

**Errors:**
- `403 FORBIDDEN` — only OWNER can change roles; cannot change own role; cannot demote/promote OWNER
- `400 VALIDATION_ERROR` — invalid role value

---

### 5.8 Remove Member

```http
DELETE /workspaces/:workspaceId/members/:userId
```

**Permission:** `@RequireWorkspaceRole('OWNER', 'ADMIN')`

**Errors:**
- `403 FORBIDDEN` — cannot remove workspace OWNER
- `400 BAD_REQUEST` — cannot remove yourself (use `POST /leave` instead)

---

### 5.9 Leave Workspace

```http
POST /workspaces/:workspaceId/leave
```

**Permission:** `IsWorkspaceMember`

**Errors:**
- `400 BAD_REQUEST` — OWNER cannot leave; must transfer ownership first

---

### 5.10 Create Invite

```http
POST /workspaces/:workspaceId/invites
```

**Permission:** `@RequireWorkspaceRole('OWNER', 'ADMIN')`

**Request:**
```json
{
  "role": "MEMBER",
  "invitedEmail": "newuser@example.com"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "token": "abc123...",
  "role": "MEMBER",
  "invitedEmail": "newuser@example.com",
  "expiresAt": "2026-05-18T12:00:00Z",
  "inviteUrl": "https://app.example.com/join?token=abc123..."
}
```

**Note:** `invitedEmail` is optional (null = generic link). See `decisions.md` D1.

---

### 5.11 List Invites

```http
GET /workspaces/:workspaceId/invites
```

**Permission:** `@RequireWorkspaceRole('OWNER', 'ADMIN')`

**Response 200:** Array of pending invites.

---

### 5.12 Revoke Invite

```http
DELETE /workspaces/:workspaceId/invites/:inviteId
```

**Permission:** `@RequireWorkspaceRole('OWNER', 'ADMIN')`

**Response 204.** Soft-deletes the invite (`deletedAt`).

---

### 5.13 Accept Invite

```http
POST /invites/:token/accept
```

**Permission:** Authenticated user (must match `invitedEmail` if set).

**Response 200:** `{ workspaceId, role }`

**Errors:**
- `410 GONE` — invite expired or revoked
- `403 FORBIDDEN` — email mismatch (if `invitedEmail` was set)

---

## 6. Events Summary (Part 1)

| Endpoint | Method | Auth | Permission | Notes |
|----------|--------|------|------------|-------|
| `/auth/register` | POST | No | — | Returns user, no token |
| `/auth/login` | POST | No | — | Sets refresh cookie, returns access token |
| `/auth/refresh` | POST | Cookie | — | Rotates refresh token |
| `/auth/logout` | POST | Cookie | — | Revokes refresh token |
| `/users/me` | GET | Bearer | — | Current user |
| `/users/me` | PATCH | Bearer | — | Update profile |
| `/workspaces` | POST | Bearer | — | Create workspace |
| `/workspaces` | GET | Bearer | — | List my workspaces |
| `/workspaces/:id` | GET | Bearer | `IsWorkspaceMember` | Get workspace |
| `/workspaces/:id` | PATCH | Bearer | `OWNER/ADMIN` | Update workspace |
| `/workspaces/:id` | DELETE | Bearer | `OWNER` | Archive workspace |
| `/workspaces/:id/members` | GET | Bearer | `IsWorkspaceMember` | List members |
| `/workspaces/:id/members/:uid/role` | PATCH | Bearer | `OWNER` | Change role |
| `/workspaces/:id/members/:uid` | DELETE | Bearer | `OWNER/ADMIN` | Remove member |
| `/workspaces/:id/leave` | POST | Bearer | `IsWorkspaceMember` | Self-remove |
| `/workspaces/:id/invites` | POST | Bearer | `OWNER/ADMIN` | Create invite |
| `/workspaces/:id/invites` | GET | Bearer | `OWNER/ADMIN` | List invites |
| `/workspaces/:id/invites/:id` | DELETE | Bearer | `OWNER/ADMIN` | Revoke invite |
| `/invites/:token/accept` | POST | Bearer | — | Accept invite |

---

## 7. Part 2 — Channel & Message Endpoints

### 7.1 Create Channel

```http
POST /workspaces/:workspaceId/channels
```

**Permission:** `IsWorkspaceMember`

**Request:**
```json
{
  "name": "Engineering",
  "slug": "engineering",
  "description": "Engineering discussions",
  "type": "PUBLIC"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "name": "Engineering",
  "slug": "engineering",
  "description": "Engineering discussions",
  "type": "PUBLIC",
  "workspaceId": "uuid",
  "createdById": "user-uuid",
  "createdAt": "2026-05-11T12:00:00Z"
}
```

**Errors:**
- `409 CONFLICT` — slug already exists in workspace
- `400 VALIDATION_ERROR` — invalid type (must be `PUBLIC` or `PRIVATE`)

---

### 7.2 List Channels

```http
GET /workspaces/:workspaceId/channels
```

**Permission:** `IsWorkspaceMember`

Returns channels the user can access (public + private where explicit member).

**Query params:**
- `limit` — max 50, default 20
- `cursor` — pagination cursor
- `type` — filter `PUBLIC` | `PRIVATE` (optional)
- `includeArchived` — boolean, default `false`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Engineering",
      "slug": "engineering",
      "type": "PUBLIC",
      "myRole": "MEMBER",
      "createdAt": "2026-05-11T12:00:00Z"
    }
  ],
  "nextCursor": "eyJpZCI6..."
}
```

---

### 7.3 Get Channel

```http
GET /channels/:channelId
```

**Permission:** `CanAccessChannel`

**Response 200:** Channel object + `myRole`.

---

### 7.4 Update Channel

```http
PATCH /channels/:channelId
```

**Permission:** `@RequireChannelRole('OWNER', 'ADMIN')`

**Request:**
```json
{
  "name": "Engineering Team",
  "description": "Updated description"
}
```

**Note:** `type` (PUBLIC/PRIVATE) and `slug` are not mutable in MVP (see `decisions.md` D6).

---

### 7.5 Archive (Soft Delete) Channel

```http
DELETE /channels/:channelId
```

**Permission:** `@RequireChannelRole('OWNER', 'ADMIN')` (or workspace OWNER/ADMIN via moderation override).

**Response 204.**

**Broadcast:** `channel:archived` event to `channel:<id>` room.

---

### 7.6 List Channel Members

```http
GET /channels/:channelId/members
```

**Permission:** `CanAccessChannel`

**Response 200:** Array of members with explicit channel roles.

---

### 7.7 Add Channel Member

```http
POST /channels/:channelId/members
```

**Permission:** `@RequireChannelRole('OWNER', 'ADMIN')`

**Request:**
```json
{
  "userId": "user-uuid",
  "role": "MEMBER"
}
```

**Errors:**
- `400 BAD_REQUEST` — user must be workspace member
- `409 CONFLICT` — user already explicit member (active)

---

### 7.8 Remove Channel Member

```http
DELETE /channels/:channelId/members/:userId
```

**Permission:** `@RequireChannelRole('OWNER', 'ADMIN')`

**Errors:**
- `403 FORBIDDEN` — cannot remove workspace OWNER from channel

---

### 7.9 Create Message

```http
POST /channels/:channelId/messages
```

**Permission:** `CanAccessChannel`

**Request:**
```json
{
  "content": "Hello team!",
  "parentId": null,
  "attachmentIds": ["attachment-uuid"]
}
```

**Validation:**
- `content`: required, max 4000 chars
- `parentId`: optional, must be a top-level message (`parentId IS NULL`) in the same channel
- `attachmentIds`: optional, attachments must exist and have `messageId = null`

**Response 201:**
```json
{
  "id": "msg-uuid",
  "channelId": "channel-uuid",
  "authorId": "user-uuid",
  "author": {
    "id": "user-uuid",
    "username": "johndoe",
    "displayName": "John Doe",
    "avatarUrl": "https://..."
  },
  "content": "Hello team!",
  "parentId": null,
  "editedAt": null,
  "deletedAt": null,
  "createdAt": "2026-05-11T12:00:00Z",
  "attachments": [
    {
      "id": "attachment-uuid",
      "filename": "doc.pdf",
      "originalName": "Document.pdf",
      "mimeType": "application/pdf",
      "size": 204800,
      "url": "https://s3.example.com/..."
    }
  ],
  "reactions": []
}
```

**Broadcast:** `message:created` to `channel:<id>` room.

---

### 7.10 List Messages

```http
GET /channels/:channelId/messages
```

**Permission:** `CanAccessChannel`

**Query params:**
- `limit` — max 50, default 20
- `cursor` — pagination cursor (messageId)
- `parentId` — filter by thread parent; null = top-level only
- `search` — full-text search query (optional, uses `tsvector`)
- `authorId` — filter by author
- `from` / `to` — ISO 8601 date range

**Response 200:**
```json
{
  "data": [ /* message objects */ ],
  "nextCursor": "eyJpZCI6...",
  "hasMore": true
}
```

**Note:** Soft-deleted messages are included with `"deleted": true` and `content: null` for admin/owner; hidden for regular members unless explicitly fetched.

---

### 7.11 Get Message

```http
GET /messages/:messageId
```

**Permission:** `CanAccessChannel` (via message's channel)

---

### 7.12 Update Message

```http
PATCH /messages/:messageId
```

**Permission:** `@IsMessageAuthor()` + 15-minute window.

**Request:**
```json
{
  "content": "Hello team! (edited)"
}
```

**Response 200:** Updated message.

**Errors:**
- `403 FORBIDDEN` — not author
- `410 GONE` — edit window expired (> 15 min)

---

### 7.13 Delete Message

```http
DELETE /messages/:messageId
```

**Permission:** Author OR `@RequireChannelRole('OWNER', 'ADMIN')` (moderation).

**Response 204.**

**Broadcast:** `message:deleted` to `channel:<id>` room.

**Note:** Admin moderation is audit-logged (`action: MODERATION_OVERRIDE`).

---

### 7.14 List Thread Replies

```http
GET /channels/:channelId/messages?parentId=:parentMessageId
```

**Permission:** `CanAccessChannel`

Same response format as List Messages, filtered to replies.

---

### 7.15 Toggle Reaction

```http
POST /messages/:messageId/reactions
```

**Permission:** `CanAccessChannel`

**Request:**
```json
{
  "emoji": "👍"
}
```

**Response 200:**
```json
{
  "messageId": "msg-uuid",
  "emoji": "👍",
  "userId": "user-uuid",
  "count": 5,
  "hasReacted": true
}
```

**Idempotent:** adds if absent, removes (soft-deletes) if present.

---

### 7.16 Generate Presigned Upload URL

```http
POST /attachments/presigned-url
```

**Permission:** `CanAccessChannel` (requires active channel context; channelId in body)

**Request:**
```json
{
  "channelId": "channel-uuid",
  "filename": "image.png",
  "mimeType": "image/png",
  "size": 1048576
}
```

**Response 201:**
```json
{
  "attachmentId": "uuid",
  "uploadUrl": "https://s3.example.com/bucket/uuid-image.png?X-Amz-...",
  "expiresIn": 300,
  "headers": {
    "Content-Type": "image/png"
  }
}
```

**Flow:**
1. Client requests presigned URL
2. Server creates `Attachment` row with `messageId = null`, returns upload URL
3. Client PUTs file directly to S3/MinIO
4. Client includes `attachmentId` in `POST /messages` request
5. Server links attachment to message on creation

---

### 7.17 Events Summary (Part 2)

| Endpoint | Method | Auth | Permission | Notes |
|----------|--------|------|------------|-------|
| `/workspaces/:id/channels` | POST | Bearer | `IsWorkspaceMember` | Create channel |
| `/workspaces/:id/channels` | GET | Bearer | `IsWorkspaceMember` | List channels |
| `/channels/:id` | GET | Bearer | `CanAccessChannel` | Get channel |
| `/channels/:id` | PATCH | Bearer | `OWNER/ADMIN` | Update channel |
| `/channels/:id` | DELETE | Bearer | `OWNER/ADMIN` | Archive channel |
| `/channels/:id/members` | GET | Bearer | `CanAccessChannel` | List members |
| `/channels/:id/members` | POST | Bearer | `OWNER/ADMIN` | Add member |
| `/channels/:id/members/:uid` | DELETE | Bearer | `OWNER/ADMIN` | Remove member |
| `/channels/:id/messages` | POST | Bearer | `CanAccessChannel` | Create message |
| `/channels/:id/messages` | GET | Bearer | `CanAccessChannel` | List messages / search |
| `/messages/:id` | GET | Bearer | `CanAccessChannel` | Get message |
| `/messages/:id` | PATCH | Bearer | `@IsMessageAuthor` | Edit (15 min) |
| `/messages/:id` | DELETE | Bearer | `Author or OWNER/ADMIN` | Soft delete |
| `/messages/:id/reactions` | POST | Bearer | `CanAccessChannel` | Toggle reaction |
| `/attachments/presigned-url` | POST | Bearer | `CanAccessChannel` | Get upload URL |

---

## 8. Part 3 — Search, Audit, Notifications

### 8.1 Search Messages

```http
GET /search/messages
```

**Permission:** `IsWorkspaceMember` (search is workspace-scoped; channel-level filtering optional)

**Query params:**
- `query` — search string (required)
- `workspaceId` — required workspace scope
- `channelId` — optional channel filter
- `authorId` — optional author filter
- `from` — optional start date (ISO 8601)
- `to` — optional end date (ISO 8601)
- `limit` — max 50, default 20
- `cursor` — pagination cursor

**Response 200:**
```json
{
  "data": [
    {
      "id": "msg-uuid",
      "channelId": "channel-uuid",
      "channelName": "engineering",
      "authorId": "user-uuid",
      "author": {
        "username": "johndoe",
        "displayName": "John Doe"
      },
      "content": "Hello team, welcome to the project!",
      "createdAt": "2026-05-11T12:00:00Z",
      "rank": 0.567
    }
  ],
  "nextCursor": "eyJyYW5rIj...",
  "hasMore": true
}
```

**Implementation:** Uses PostgreSQL `tsvector` GIN index (see `database-schema.md` §7).

**Errors:**
- `400 VALIDATION_ERROR` — `query` or `workspaceId` missing
- `403 FORBIDDEN` — user not member of workspace

---

### 8.2 Get Audit Log

```http
GET /workspaces/:workspaceId/audit-logs
```

**Permission:** `@RequireWorkspaceRole('OWNER', 'ADMIN')`

**Query params:**
- `limit` — max 100, default 20
- `cursor` — pagination cursor (timestamp + id)
- `action` — filter by action type (optional)
- `entityType` — filter by entity (optional: `Message`, `Channel`, `Workspace`)
- `actorId` — filter by user (optional)
- `from` / `to` — date range

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "actorId": "user-uuid",
      "actor": {
        "username": "johndoe",
        "displayName": "John Doe"
      },
      "action": "DELETE",
      "entityType": "Message",
      "entityId": "msg-uuid",
      "metadata": {
        "reason": "user_action",
        "deletedAt": "2026-05-11T12:05:00Z"
      },
      "ipAddress": "192.168.1.1",
      "createdAt": "2026-05-11T12:05:00Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkQXQi...",
  "hasMore": true
}
```

**Note:** Audit log is append-only. No write/delete endpoints for users.

---

### 8.3 List Notifications

```http
GET /notifications
```

**Permission:** Bearer (returns own notifications only)

**Query params:**
- `limit` — max 50, default 20
- `cursor` — pagination cursor
- `unreadOnly` — boolean, default `false`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "MENTION",
      "title": "New mention",
      "body": "@johndoe mentioned you in #engineering",
      "entityType": "Message",
      "entityId": "msg-uuid",
      "workspaceId": "ws-uuid",
      "channelId": "ch-uuid",
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-05-11T12:00:00Z"
    }
  ],
  "nextCursor": null,
  "unreadCount": 3
}
```

---

### 8.4 Mark Notification Read

```http
PATCH /notifications/:notificationId/read
```

**Permission:** Own notification only.

**Response 200:** Updated notification.

---

### 8.5 Mark All Notifications Read

```http
POST /notifications/read-all
```

**Permission:** Bearer.

**Request body:** Optional filter.
```json
{
  "workspaceId": "ws-uuid"
}
```

**Response 204.**

---

### 8.6 Batch Read Receipts

```http
POST /channels/:channelId/read-receipts
```

**Permission:** `CanAccessChannel`

**Request:**
```json
{
  "messageIds": ["msg-1", "msg-2", "msg-3"]
}
```

**Response 204.** Server creates/updates `ReadReceipt` rows.

**Note:** WebSocket event `message:read` is also sent by client, but this REST endpoint is used for:
1. Initial bulk sync when opening channel
2. Fallback if WebSocket is disconnected
3. Read receipts for threads loaded via REST

---

### 8.7 Get Read Receipts for Messages

```http
GET /channels/:channelId/messages/:messageId/read-receipts
```

**Permission:** `CanAccessChannel`

**Response 200:**
```json
{
  "data": [
    {
      "userId": "user-uuid",
      "username": "johndoe",
      "readAt": "2026-05-11T12:01:00Z"
    }
  ]
}
```

**Note:** Returns per-message read status. For channel-wide "last read" position, client tracks locally or uses channel-level aggregation.

---

### 8.8 Events Summary (Part 3)

| Endpoint | Method | Auth | Permission | Notes |
|----------|--------|------|------------|-------|
| `/search/messages` | GET | Bearer | `IsWorkspaceMember` | Full-text search |
| `/workspaces/:id/audit-logs` | GET | Bearer | `OWNER/ADMIN` | Immutable audit trail |
| `/notifications` | GET | Bearer | — | Own notifications |
| `/notifications/:id/read` | PATCH | Bearer | Own only | Mark read |
| `/notifications/read-all` | POST | Bearer | — | Bulk mark read |
| `/channels/:id/read-receipts` | POST | Bearer | `CanAccessChannel` | Batch write receipts |
| `/channels/:id/messages/:id/read-receipts` | GET | Bearer | `CanAccessChannel` | Per-message readers |

---

## 9. Part 4 — Global Concerns

### 9.1 Standard Error Format

All errors use the same envelope:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "issue": "must be a valid email" }
    ],
    "traceId": "req-uuid"
  }
}
```

**Error codes:**

| HTTP | Code | When |
|------|------|------|
| `400` | `VALIDATION_ERROR` | Zod schema / body / query invalid |
| `400` | `MALFORMED_REQUEST` | Unparseable JSON, invalid JSON syntax |
| `401` | `UNAUTHORIZED` | Missing / invalid / expired JWT |
| `403` | `FORBIDDEN` | Authenticated, but lacks permission |
| `404` | `NOT_FOUND` | Resource does not exist or user lacks access (always 404, never 403 for security) |
| `409` | `CONFLICT` | Unique constraint (slug, email), idempotency conflict |
| `410` | `GONE` | Edit window expired, invite revoked |
| `422` | `UNPROCESSABLE_ENTITY` | Business rule violation (cannot remove last OWNER) |
| `429` | `RATE_LIMITED` | Rate limit exceeded |
| `500` | `INTERNAL_ERROR` | Unhandled exception |

**Rules:**
- `details` is optional; always present for `VALIDATION_ERROR`.
- `traceId` is the request ID (logged server-side).
- For `NOT_FOUND`, the message is generic ("Resource not found") to prevent resource enumeration.
- Admin endpoints may return 404 instead of 403 for unauthorized access to non-existent audit records.

---

### 9.2 Cursor Pagination

All list endpoints use **cursor pagination** (not offset/limit) to avoid performance degradation on large tables.

**Query params:**
- `limit` — integer, max 50 (100 for audit logs), default 20
- `cursor` — opaque base64-encoded string (never expose raw DB cursor)

**Response envelope:**
```json
{
  "data": [...],
  "nextCursor": "eyJpZCI6...",
  "hasMore": true
}
```

**Cursor construction (server-side):**
```ts
const cursor = btoa(JSON.stringify({ id: lastItem.id, createdAt: lastItem.createdAt }));
```

**Cursor decoding:**
```ts
const { id, createdAt } = JSON.parse(atob(cursor));
```

**Ordering:**
- Default: `createdAt DESC, id DESC`
- Search results: `rank DESC, createdAt DESC`

**Empty result:**
```json
{
  "data": [],
  "nextCursor": null,
  "hasMore": false
}
```

**Backward pagination:** Not required in MVP (see `decisions.md` D8).

---

### 9.3 Rate Limiting

Rate limits are applied per authenticated user, or per IP for unauthenticated requests.

**Headers (on every response):**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
X-RateLimit-Reset: 1715431200
```

**Limits:**

| Scope | Limit | Window | Applies to |
|-------|-------|--------|------------|
| Global (auth) | 300 | 1 min | All authenticated requests combined |
| Auth | 5 | 1 min | `POST /auth/login`, `POST /auth/register` |
| Invite create | 10 | 1 min | `POST /workspaces/:id/invites` |
| Message create | 60 | 1 min | `POST /channels/:id/messages` |
| Search | 30 | 1 min | `GET /search/messages` |
| Presigned URL | 20 | 1 min | `POST /attachments/presigned-url` |
| Invite accept | 10 | 1 min | `POST /invites/:token/accept` |

**Exceeding limit:**
```http
429 Too Many Requests
X-RateLimit-Retry-After: 42
```

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Retry after 42 seconds.",
    "traceId": "req-uuid"
  }
}
```

**WebSocket rate limiting:**
- Client messages throttled at 60 msg/min per socket
- Exceeding = socket receives `error:rate_limited` and is disconnected

---

### 9.4 Idempotency

`POST` endpoints that mutate state support an optional idempotency key:

```http
Idempotency-Key: <uuid>
```

- Key is stored for 24 hours
- Duplicate key within 24h returns the original response (HTTP 200/201) without side effects
- Key scope: per-user, per-endpoint

**Endpoints supporting idempotency:**
- `POST /auth/register`
- `POST /workspaces`
- `POST /workspaces/:id/invites`
- `POST /workspaces/:id/channels`
- `POST /channels/:id/messages`

---

### 9.5 HTTP & Content Types

- All requests/responses use `application/json` unless otherwise noted.
- Binary uploads bypass REST — clients upload directly to S3 via presigned URL (see §7.16).
- Date/times in request bodies: ISO 8601 with timezone (e.g. `2026-05-11T12:00:00Z`).
- Date/times in query params: same format, URL-encoded.

---

### 9.6 Deprecation & Versioning

- API version is URL-prefixed: `/api/v1/...`
- `X-API-Version: v1` header included in every response.
- Breaking changes require new version path (`/api/v2/...`).
