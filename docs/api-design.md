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
- `429 RATE_LIMITED` — too many login attempts

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

**Note:** Workspace OWNER can archive the workspace. The "sole owner cannot leave" rule applies only to `POST /workspaces/:workspaceId/leave`, not to archive.

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

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "role": "MEMBER",
      "invitedEmail": "user@example.com",
      "expiresAt": "2026-05-18T12:00:00Z",
      "createdAt": "2026-05-11T12:00:00Z"
    }
  ]
}
```

**Note:** Raw invite token is never returned from list endpoint.

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
POST /invites/accept
```

**Permission:** Authenticated user (must match `invitedEmail` if set).

**Request:**
```json
{
  "token": "raw-invite-token"
}
```

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
| `/workspaces/:workspaceId` | GET | Bearer | `IsWorkspaceMember` | Get workspace |
| `/workspaces/:workspaceId` | PATCH | Bearer | `OWNER/ADMIN` | Update workspace |
| `/workspaces/:workspaceId` | DELETE | Bearer | `OWNER` | Archive workspace |
| `/workspaces/:workspaceId/members` | GET | Bearer | `IsWorkspaceMember` | List members |
| `/workspaces/:workspaceId/members/:userId/role` | PATCH | Bearer | `OWNER` | Change role |
| `/workspaces/:workspaceId/members/:userId` | DELETE | Bearer | `OWNER/ADMIN` | Remove member |
| `/workspaces/:workspaceId/leave` | POST | Bearer | `IsWorkspaceMember` | Self-remove |
| `/workspaces/:workspaceId/invites` | POST | Bearer | `OWNER/ADMIN` | Create invite |
| `/workspaces/:workspaceId/invites` | GET | Bearer | `OWNER/ADMIN` | List invites |
| `/workspaces/:workspaceId/invites/:inviteId` | DELETE | Bearer | `OWNER/ADMIN` | Revoke invite |
| `/invites/accept` | POST | Bearer | — | Accept invite |

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
GET /workspaces/:workspaceId/channels/:channelId/messages
```

**Permission:** `CanAccessChannel`

**Query params:**
- `limit` — max 100, default 50
- `cursor` — pagination cursor (`createdAt:messageId`) returned by a previous page

**Response 200:**
```json
{
  "items": [ /* message objects, oldest-first within the page */ ],
  "nextCursor": "2026-06-30T12:00:00.000Z:msg-id",
  "hasMore": true
}
```

- Pages are ordered by `(createdAt DESC, id DESC)` internally and reversed so each `items` array is oldest-first.
- `nextCursor` points to the oldest message in the current page; pass it to load the next page of older messages.
- The cursor is a stable composite key on `(createdAt, id)`; it is **not** an offset.

**Note:** Soft-deleted messages are returned with `deletedAt != null` and `content: null` only where user is allowed to see deletion context. Regular members do not receive deleted messages in normal list responses.

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
- `422 UNPROCESSABLE_ENTITY` — edit window expired (> 15 min)

---

### 7.13 Delete Message

```http
DELETE /messages/:messageId
```

**Permission:** Author OR `@RequireChannelRole('OWNER', 'ADMIN')` (moderation).

**Response 204.**

**Broadcast:** `message:deleted` to `channel:<id>` room.

**Note:** Admin moderation is audit-logged (`action: channel:moderation_override_used`).

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
| `/workspaces/:workspaceId/channels` | POST | Bearer | `IsWorkspaceMember` | Create channel |
| `/workspaces/:workspaceId/channels` | GET | Bearer | `IsWorkspaceMember` | List channels |
| `/channels/:channelId` | GET | Bearer | `CanAccessChannel` | Get channel |
| `/channels/:channelId` | PATCH | Bearer | `OWNER/ADMIN` | Update channel |
| `/channels/:channelId` | DELETE | Bearer | `OWNER/ADMIN` | Archive channel |
| `/channels/:channelId/members` | GET | Bearer | `CanAccessChannel` | List members |
| `/channels/:channelId/members` | POST | Bearer | `OWNER/ADMIN` | Add member |
| `/channels/:channelId/members/:userId` | DELETE | Bearer | `OWNER/ADMIN` | Remove member |
| `/channels/:channelId/messages` | POST | Bearer | `CanAccessChannel` | Create message |
| `/channels/:channelId/messages` | GET | Bearer | `CanAccessChannel` | List messages |
| `/messages/:messageId` | GET | Bearer | `CanAccessChannel` | Get message |
| `/messages/:messageId` | PATCH | Bearer | `@IsMessageAuthor` | Edit (15 min) |
| `/messages/:messageId` | DELETE | Bearer | `Author or OWNER/ADMIN` | Soft delete |
| `/messages/:messageId/reactions` | POST | Bearer | `CanAccessChannel` | Toggle reaction |
| `/attachments/presigned-url` | POST | Bearer | `CanAccessChannel` | Get upload URL |

---

## 8. Part 3 — Search, Audit, Notifications

### 8.1 Search Messages

```http
GET /search/messages
```

**Permission:**
- User must be workspace member.
- If `channelId` is provided: validate `CanAccessChannel(channelId)`.
- If `channelId` is omitted: search only channels the user can read (public + private where explicit member).
- Private channel messages require explicit membership unless workspace `OWNER`/`ADMIN` uses audited moderation override.

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
| `/workspaces/:workspaceId/audit-logs` | GET | Bearer | `OWNER/ADMIN` | Immutable audit trail |
| `/notifications` | GET | Bearer | — | Own notifications |
| `/notifications/:notificationId/read` | PATCH | Bearer | Own only | Mark read |
| `/notifications/read-all` | POST | Bearer | — | Bulk mark read |
| `/channels/:channelId/read-receipts` | POST | Bearer | `CanAccessChannel` | Batch write receipts |
| `/channels/:channelId/messages/:messageId/read-receipts` | GET | Bearer | `CanAccessChannel` | Per-message readers |

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
| `409` | `CONFLICT` | Unique constraint (slug, email) |
| `410` | `GONE` | Invite expired or revoked |
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
| Invite create | 10 | 1 min | `POST /workspaces/:workspaceId/invites` |
| Message create | 60 | 1 min | `POST /channels/:channelId/messages` |
| Search | 30 | 1 min | `GET /search/messages` |
| Presigned URL | 20 | 1 min | `POST /attachments/presigned-url` |
| Invite accept | 10 | 1 min | `POST /invites/accept` |

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

Idempotency keys are **not implemented in MVP**.

Retry safety is handled by:
- Client-side deduplication in message composer and form submits.
- Unique constraints on slug, email, username preventing duplicate creates.

Server-side idempotency with `Idempotency-Key` header is a **post-MVP** feature.

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

---

## 10. Group Chat Endpoints

Group chats live outside workspaces and channels. All routes require Bearer auth and use UUID identifiers.

### 10.1 Create Group

```http
POST /groups
```

**Permission:** Authenticated user.

**Request:**

```json
{
  "name": "Weekend trip",
  "memberIds": ["user-uuid-1", "user-uuid-2"]
}
```

**Validation:**

- `name`: required, max 100 chars.
- `memberIds`: at least one UUID; creator must not include themselves.

**Response 201:** `GroupSummary` with creator as `OWNER`.

### 10.2 List My Groups

```http
GET /groups
```

Returns groups where the user is an active member, ordered by `updatedAt DESC`.

### 10.3 Get Group

```http
GET /groups/:groupId
```

**Permission:** Active group member. Non-members receive `404`.

### 10.4 Rename Group

```http
PATCH /groups/:groupId
```

**Permission:** Group `OWNER` only.

**Request:** `{ "name": "New name" }`

### 10.5 Archive Group

```http
DELETE /groups/:groupId
```

**Permission:** Group `OWNER` only.

**Response 200:** `{ "success": true }`

### 10.6 Add Member

```http
POST /groups/:groupId/members
```

**Permission:** Group `OWNER` only.

**Request:** `{ "userId": "user-uuid" }`

### 10.7 Remove Member

```http
DELETE /groups/:groupId/members/:userId
```

**Permission:** Group `OWNER` only. Owner cannot remove themselves.

### 10.8 Leave Group

```http
POST /groups/:groupId/leave
```

**Permission:** Active group member. The sole owner cannot leave.

### 10.9 List Group Messages

```http
GET /groups/:groupId/messages
```

**Permission:** Active group member.

Returns messages oldest-first.

### 10.10 Send Group Message

```http
POST /groups/:groupId/messages
```

**Permission:** Active group member.

**Request:** `{ "content": "Hello everyone!" }`

Replies (`parentId`) are not supported in groups.

### 10.11 Mark Group as Read

```http
POST /groups/:groupId/read
```

**Permission:** Active group member.

**Response 200:** `{ "success": true, "lastReadAt": "..." }`

### 10.12 Search Users

```http
GET /users/search?q=<query>
```

**Permission:** Authenticated user.

Used by the create-group modal to find users to add.

### 10.13 Events Summary

| Endpoint | Method | Auth | Permission | Notes |
|----------|--------|------|------------|-------|
| `/groups` | GET | Bearer | Active member | List my groups |
| `/groups` | POST | Bearer | Authenticated | Create group |
| `/groups/:groupId` | GET | Bearer | Active member | Group details |
| `/groups/:groupId` | PATCH | Bearer | `OWNER` | Rename |
| `/groups/:groupId` | DELETE | Bearer | `OWNER` | Archive |
| `/groups/:groupId/members` | POST | Bearer | `OWNER` | Add member |
| `/groups/:groupId/members/:userId` | DELETE | Bearer | `OWNER` | Remove member |
| `/groups/:groupId/leave` | POST | Bearer | Active member | Leave group |
| `/groups/:groupId/messages` | GET | Bearer | Active member | List messages |
| `/groups/:groupId/messages` | POST | Bearer | Active member | Send message |
| `/groups/:groupId/read` | POST | Bearer | Active member | Mark as read |
| `/users/search` | GET | Bearer | Authenticated | User search |
| `/groups/:groupId/invites` | POST | Bearer | `OWNER` | Create invite link |
| `/groups/:groupId/invites` | GET | Bearer | `OWNER` | List invite links |
| `/groups/:groupId/invites/:inviteId` | DELETE | Bearer | `OWNER` | Revoke invite link |
| `/group-invites/:token` | GET | No | Public | Preview invite |
| `/group-invites/:token/accept` | POST | Bearer | Authenticated | Accept invite and join group |

---

## 11. Contacts & Group Invite Links

### 11.1 List My Contacts

```http
GET /contacts
```

**Permission:** Authenticated user.

Returns the current user's active contacts, sorted by `createdAt DESC`.

**Response 200:**

```json
[
  {
    "id": "uuid",
    "ownerUserId": "uuid",
    "contactUserId": "uuid",
    "nickname": "Work buddy",
    "username": "alice",
    "displayName": "Alice Smith",
    "avatarUrl": null,
    "createdAt": "2026-06-24T12:00:00Z",
    "updatedAt": "2026-06-24T12:00:00Z"
  }
]
```

---

### 11.2 Add a Contact

```http
POST /contacts
```

**Permission:** Authenticated user.

**Request:**

```json
{
  "userId": "uuid",
  "email": "alice@example.com",
  "username": "alice",
  "nickname": "Work buddy"
}
```

At least one of `userId`, `email`, or `username` is required. Adding the same contact twice is idempotent and restores a soft-deleted row.

**Errors:**

- `400 BAD_REQUEST` — self-add or no identifier provided.
- `404 NOT_FOUND` — target user not found.

---

### 11.3 Remove a Contact

```http
DELETE /contacts/:contactUserId
```

**Permission:** Authenticated user (owner only).

Soft-deletes the contact. Existing direct conversations are not affected.

**Response 200:** `{ "success": true }`

---

### 11.4 Start DM with a Contact

```http
POST /contacts/:contactUserId/start-dm
```

**Permission:** Authenticated user; requires an active contact.

Returns the existing direct conversation or creates a new one.

---

### 11.5 Create Group Invite Link

```http
POST /groups/:groupId/invites
```

**Permission:** Group `OWNER` only.

**Request:**

```json
{
  "expiresInHours": 24,
  "maxUses": 10
}
```

Both fields are optional. Default expiry is 7 days.

**Response 201:**

```json
{
  "id": "uuid",
  "groupId": "uuid",
  "token": "64-char-hex-token",
  "expiresAt": "2026-06-25T12:00:00Z",
  "maxUses": 10,
  "createdAt": "2026-06-24T12:00:00Z"
}
```

**Errors:**

- `403 FORBIDDEN` — not the group owner.
- `404 NOT_FOUND` — group not found or archived.
- `400 BAD_REQUEST` — `expiresInHours` not positive.

---

### 11.6 List Group Invite Links

```http
GET /groups/:groupId/invites
```

**Permission:** Group `OWNER` only.

Returns invite links with a `valid` boolean computed from `revokedAt`, `expiresAt`, `maxUses`, and `useCount`. Raw tokens are not returned.

---

### 11.7 Revoke Group Invite Link

```http
DELETE /groups/:groupId/invites/:inviteId
```

**Permission:** Group `OWNER` only.

Sets `revokedAt`. Does not delete the row.

**Response 200:** `{ "id": "uuid", "revokedAt": "2026-06-24T12:00:00Z" }`

---

### 11.8 Preview Group Invite Link

```http
GET /group-invites/:token
```

**Permission:** None (public).

Returns safe metadata only.

**Response 200:**

```json
{
  "groupName": "Weekend trip",
  "expiresAt": "2026-06-25T12:00:00Z",
  "valid": true
}
```

---

### 11.9 Accept Group Invite Link

```http
POST /group-invites/:token/accept
```

**Permission:** Authenticated user.

Joins the group as `MEMBER` if not already a member. Idempotent for existing members.

**Errors:**

- `401 UNAUTHORIZED` — missing/invalid token.
- `404 NOT_FOUND` — invite or group not found.
- `410 GONE` — invite revoked, expired, or max uses reached.

