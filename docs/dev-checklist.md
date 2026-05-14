# Developer Checklist

## Prerequisites

- Node.js 20+
- pnpm
- Docker Desktop

## Initial Setup

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# Run database migrations
cd packages/database
npx prisma migrate dev
```

## Start API

```bash
pnpm --filter api start:dev
```

## Verify

### 1. Health Check

**GET** `/api/v1/health`

Expected: `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2026-05-12T...",
  "uptime": 1.23,
  "environment": "development",
  "database": "ok",
  "requestId": "..."
}
```

- `status: "ok"` — API is healthy.
- `database: "ok"` — PostgreSQL connection works.
- `database: "error"` — check PostgreSQL container (`docker compose ps`) and DATABASE_URL in `.env`.

### 2. Register

**POST** `/api/v1/auth/register`

Body:

```json
{
  "email": "user@example.com",
  "username": "john_doe",
  "password": "SecurePass123!"
}
```

| Scenario | Expected |
|----------|----------|
| Valid data | `201 Created` + user object, accessToken, refreshToken |
| Duplicate email | `409 Conflict` — Email or username already in use |
| Duplicate username | `409 Conflict` — Email or username already in use |
| Invalid email format | `400 Bad Request` — Validation failed |
| Short password (< 8) | `400 Bad Request` — Validation failed |
| Extra field in body | `400 Bad Request` — Validation failed |

### 3. Login

**POST** `/api/v1/auth/login`

Body:

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

| Scenario | Expected |
|----------|----------|
| Valid credentials | `200 OK` + user object, accessToken, refreshToken |
| Wrong password | `401 Unauthorized` — Invalid credentials |
| Unknown email | `401 Unauthorized` — Invalid credentials |
| Invalid email format | `400 Bad Request` — Validation failed |
| Extra field in body | `400 Bad Request` — Validation failed |

### 4. Get Current User

**GET** `/api/v1/auth/me`

Headers:

```
Authorization: Bearer <accessToken>
```

| Scenario | Expected |
|----------|----------|
| Valid token | `200 OK` + `{ id, email, username, createdAt }` |
| Missing token | `401 Unauthorized` — Access token missing |
| Invalid token | `401 Unauthorized` — Invalid or expired access token |

### 5. Refresh Token

**POST** `/api/v1/auth/refresh`

Body:

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Scenario | Expected |
|----------|----------|
| Valid refresh token | `200 OK` + user object, new accessToken, new refreshToken |
| Reuse old refresh token | `401 Unauthorized` — Refresh token not found or revoked |
| Invalid refresh token | `401 Unauthorized` — Invalid or expired refresh token |
| Short/missing token | `400 Bad Request` — Validation failed |

### 6. Logout

**POST** `/api/v1/auth/logout`

Body:

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Scenario | Expected |
|----------|----------|
| Valid logout | `200 OK` + `{ success: true }` |
| Refresh after logout | `401 Unauthorized` — Refresh token not found or revoked |
| Repeated logout | `200 OK` + `{ success: true }` |
| Short/missing token | `400 Bad Request` — Validation failed |

### 7. Workspaces

**POST** `/api/v1/workspaces`

| Scenario | Expected |
|----------|----------|
| Without token | `401 Unauthorized` |
| Valid token | `201 Created` + workspace object |
| Duplicate slug | `409 Conflict` — Slug already in use |
| Invalid slug with spaces | `400 Bad Request` — Validation failed |
| Uppercase slug | `201 Created` — slug normalized to lowercase |

**GET** `/api/v1/workspaces`

| Scenario | Expected |
|----------|----------|
| Valid token | `200 OK` + list of workspaces where user is active member |
| Without token | `401 Unauthorized` |

**GET** `/api/v1/workspaces/:workspaceId`

| Scenario | Expected |
|----------|----------|
| Own workspace | `200 OK` + workspace object |
| Random workspaceId | `404 Not Found` |
| Without token | `401 Unauthorized` |

**PATCH** `/api/v1/workspaces/:workspaceId`

Body:

```json
{
  "name": "Updated Name"
}
```

| Scenario | Expected |
|----------|----------|
| As OWNER | `200 OK` + updated workspace |
| With slug field in body | `400 Bad Request` — Validation failed |

**POST** `/api/v1/workspaces/:workspaceId/archive`

| Scenario | Expected |
|----------|----------|
| As OWNER | `200 OK` + `{ success: true }` |
| Archived workspace in list | Disappears from `GET /workspaces` |

### 8. Channels

**POST** `/api/v1/workspaces/:workspaceId/channels`

| Scenario | Expected |
|----------|----------|
| Without token | `401 Unauthorized` |
| In own workspace | `201 Created` + channel object |
| Without `type` field | `201 Created` + type `PUBLIC` |
| Private channel | `201 Created` + type `PRIVATE` |
| Duplicate slug/name | `409 Conflict` — Channel slug already in use |
| Name `"Test!!!"` | Slug saved as `test` (no trailing dash) |

**GET** `/api/v1/workspaces/:workspaceId/channels`

| Scenario | Expected |
|----------|----------|
| Valid token | `200 OK` + list of public + own private channels |
| Random workspaceId | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Public channels are visible to all active workspace members.
- Private channels are visible only to explicit ChannelMembers.
- Any active WorkspaceMember may create a channel and becomes its ChannelMember OWNER.

**GET** `/api/v1/workspaces/:workspaceId/channels/:channelId`

| Scenario | Expected |
|----------|----------|
| Public channel as workspace member | `200 OK` + channel object |
| Private channel as creator | `200 OK` + channel object |
| Private channel as non-member | `404 Not Found` |
| Random channelId | `404 Not Found` |
| Without token | `401 Unauthorized` |

**PATCH** `/api/v1/workspaces/:workspaceId/channels/:channelId`

Body:

```json
{
  "name": "Updated Name"
}
```

| Scenario | Expected |
|----------|----------|
| As Channel OWNER | `200 OK` + updated channel |
| With slug/type in body | `400 Bad Request` — Validation failed |
| Public channel as workspace member without channel role | `403 Forbidden` |
| Private channel as non-member | `404 Not Found` |

**POST** `/api/v1/workspaces/:workspaceId/channels/:channelId/archive`

| Scenario | Expected |
|----------|----------|
| As Channel OWNER | `200 OK` + `{ success: true }` |
| Public channel as workspace member without channel role | `403 Forbidden` |
| Private channel as non-member | `404 Not Found` |
| Archived channel in list | Disappears from `GET /workspaces/:workspaceId/channels` |

### 9. Messages

**POST** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages`

Body:

```json
{
  "content": "Hello everyone!",
  "parentId": null
}
```

| Scenario | Expected |
|----------|----------|
| Public channel as workspace member | `201 Created` + message with author |
| Private channel as non-member | `404 Not Found` |
| Empty content | `400 Bad Request` — Validation failed |
| Content over 4000 chars | `400 Bad Request` — Validation failed |
| Thread reply with valid `parentId` | `201 Created` + reply message |
| Thread reply to reply | `400 Bad Request` — Cannot reply to a reply |

- Response shape includes `author: { id, username, displayName, avatarUrl }`.

**GET** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages`

Query params:

- `limit` — default `50`, max `100`
- `before` — ISO date cursor

| Scenario | Expected |
|----------|----------|
| Valid token | `200 OK` + list of messages with same shape as POST |
| Invalid `workspaceId`/`channelId` | `400 Bad Request` — Invalid UUID |
| Random `channelId` | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Messages are ordered newest first.
- Soft-deleted messages are excluded.

**PATCH** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId`

Body:

```json
{
  "content": "Updated content"
}
```

| Scenario | Expected |
|----------|----------|
| As author within 15 min | `200 OK` + updated message with `editedAt` set |
| As non-author | `403 Forbidden` — Only the author can edit |
| After 15 min window | `422 Unprocessable Entity` — Message edit window has expired |
| Random messageId | `404 Not Found` |
| Already deleted message | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Edit history is persisted in `MessageEdit` table (`oldContent`, `newContent`, `editedById`).

**DELETE** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId`

| Scenario | Expected |
|----------|----------|
| As author | `204 No Content` — soft deleted |
| As channel OWNER/ADMIN | `204 No Content` — can delete any message |
| As non-author without channel role | `403 Forbidden` — Insufficient permissions |
| Random messageId | `404 Not Found` |
| Already deleted message | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Soft delete sets `deletedAt`; message disappears from list.

### 10. Reactions

**POST** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/reactions`

Body:

```json
{
  "emoji": "👍"
}
```

| Scenario | Expected |
|----------|----------|
| Add new reaction | `201 Created` + reaction object |
| Duplicate active reaction | `409 Conflict` — Reaction already exists |
| Deleted message | `404 Not Found` |
| Private channel as non-member | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Adding the same emoji after soft-delete restores the previous row (`deletedAt: null`).

**DELETE** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/reactions/:emoji`

| Scenario | Expected |
|----------|----------|
| Remove own reaction | `204 No Content` — soft deleted |
| Remove missing reaction | `404 Not Found` |
| Invalid/empty emoji | `400 Bad Request` |
| Deleted message | `404 Not Found` |
| Without token | `401 Unauthorized` |

**GET** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/reactions`

| Scenario | Expected |
|----------|----------|
| List reactions | `200 OK` + `[{ emoji, count, reactedByMe }]` |
| Deleted message | `404 Not Found` |
| Without token | `401 Unauthorized` |

### 11. Read Receipts

**POST** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/read`

| Scenario | Expected |
|----------|----------|
| Mark message as read | `201 Created` + read receipt object |
| Mark same message again | `201 Created` — idempotent upsert, updates `readAt` |
| Deleted message | `404 Not Found` |
| Private channel as non-member | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Duplicate read receipts for the same user/message are prevented by unique index.

**GET** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/read-receipts`

| Scenario | Expected |
|----------|----------|
| List read receipts | `200 OK` + `[{ id, messageId, userId, channelId, readAt, createdAt, user }]` |
| Deleted message | `404 Not Found` |
| Without token | `401 Unauthorized` |

### 12. Search

**GET** `/api/v1/workspaces/:workspaceId/search/messages`

Query params:

- `q` — search query, min 2, max 100
- `channelId` — optional UUID filter
- `limit` — default `20`, max `50`

| Scenario | Expected |
|----------|----------|
| Search public messages | `200 OK` + ranked results with author and channel |
| Search with `channelId` | `200 OK` + results filtered to channel |
| Short `q` (< 2) | `400 Bad Request` |
| Invalid `channelId` | `400 Bad Request` |
| Private channel as non-member (with channelId) | `404 Not Found` |
| Random workspaceId | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Uses PostgreSQL full-text search (`searchVector` + GIN index).
- Deleted messages are excluded.
- Results ordered by relevance desc, then `createdAt` desc.

### 13. Attachments

**POST** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/attachments/presign`

Body:

```json
{
  "filename": "document.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 123456
}
```

| Scenario | Expected |
|----------|----------|
| Valid presign | `201 Created` + `{ attachmentId, uploadUrl, objectKey, expiresInSeconds }` |
| Invalid mimeType | `400 Bad Request` |
| Too large sizeBytes (>10MB) | `400 Bad Request` |
| Deleted message | `404 Not Found` |
| Private channel as non-member | `404 Not Found` |
| Without token | `401 Unauthorized` |

- `mimeType` allowlist: `image/png`, `image/jpeg`, `image/webp`, `application/pdf`, `text/plain`.
- `objectKey` pattern: `workspaces/{ws}/channels/{ch}/messages/{msg}/{uuid}-{sanitizedFilename}`.

> **Note:** Presign validates requested metadata only. Actual uploaded object size/content-type must be verified later by a complete/confirm endpoint or cleanup job. The Attachment row is created before upload, so abandoned uploads may create orphan/pending rows.

**POST** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/attachments/:attachmentId/complete`

| Scenario | Expected |
|----------|----------|
| Complete after successful upload | `201 Created` + `{ id, filename, mimeType, sizeBytes, storageKey, createdAt }` |
| Complete before upload | `409 Conflict` — Upload not completed |
| Complete fake attachmentId | `404 Not Found` — Attachment not found |
| Attachment does not belong to this message | `404 Not Found` — Attachment not found |
| Size mismatch (uploaded ≠ declared) | `422 Unprocessable Entity` — Uploaded file size does not match expected size |
| Content-type mismatch | `422 Unprocessable Entity` — Uploaded file type does not match expected type |
| Deleted message | `404 Not Found` |
| Private channel as non-member | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Verifies object existence via MinIO `HEAD` before confirming.
- Only the attachment creator (`createdById`) can confirm upload completion.

**GET** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/attachments/:attachmentId/download`

| Scenario | Expected |
|----------|----------|
| Download completed attachment | `200 OK` + `{ attachmentId, filename, mimeType, sizeBytes, downloadUrl, expiresInSeconds }` |
| Download never-uploaded attachment | `409 Conflict` — Upload not completed |
| Download fake attachmentId | `404 Not Found` — Attachment not found |
| Attachment does not belong to this message | `404 Not Found` — Attachment not found |
| Deleted message | `404 Not Found` |
| Private channel as non-member | `404 Not Found` |
| Without token | `401 Unauthorized` |

- `downloadUrl` is a presigned GET URL valid for 300 seconds.
- Object existence is verified via MinIO `HEAD` before generating the URL.

### 14. API Documentation (Swagger)

Open: http://localhost:3001/api/docs

- Lists all registered endpoints.
- Try out requests directly from the browser.

### 15. WebSocket Realtime Events

Connect via Socket.io to `ws://localhost:3001` with `auth: { token }`.

| Event | Direction | Trigger |
|-------|-----------|---------|
| `connected` | Server → Client | Successful auth handshake |
| `auth:error` | Server → Client | Missing/invalid token or user not found |
| `auth:expired` | Server → Client | Expired or malformed JWT |
| `channel:joined` | Server → Client | `channel:join` with valid access |
| `channel:left` | Server → Client | `channel:leave` from a joined room |
| `channel:error` | Server → Client | Invalid UUID, no access, or room not joined |
| `message:created` | Server → Client | REST `POST /messages` succeeds |
| `message:updated` | Server → Client | REST `PATCH /messages/:id` succeeds |
| `message:deleted` | Server → Client | REST `DELETE /messages/:id` succeeds |
| `reaction:added` | Server → Client | REST `POST /messages/:id/reactions` succeeds |
| `reaction:removed` | Server → Client | REST `DELETE /messages/:id/reactions/:emoji` succeeds |
| `read:updated` | Server → Client | REST `POST /messages/:id/read` succeeds |
| `typing:start` | Client → Server | User starts typing in a channel |
| `typing:stop` | Client → Server | User stops typing in a channel |
| `typing:started` | Server → Client | `typing:start` received and broadcast |
| `typing:stopped` | Server → Client | `typing:stop` received and broadcast |
| `typing:error` | Server → Client | Invalid UUID, no access, or not joined room |
| `presence:online` | Server → Client | User joins a channel room |
| `presence:offline` | Server → Client | User's last socket disconnects from a channel room |

**Auth handshake**

| Scenario | Expected |
|----------|----------|
| Missing token | `auth:error` + disconnect |
| Empty string token | `auth:error` + disconnect |
| Whitespace-only token | `auth:error` + disconnect |
| Non-string token (object) | `auth:error` + disconnect |
| Invalid string token | `auth:expired` + disconnect |
| Valid token | `connected` + `{ userId }` |

**Channel join/leave**

| Scenario | Expected |
|----------|----------|
| Join valid public channel | `channel:joined` + `{ workspaceId, channelId }` |
| Join valid private channel as member | `channel:joined` + `{ workspaceId, channelId }` |
| Join private channel as non-member | `channel:error` |
| Invalid UUID | `channel:error` |
| Leave joined channel | `channel:left` + `{ channelId }` |
| Leave not-joined channel | `channel:error` |

**Message broadcasts**

| Scenario | Expected |
|----------|----------|
| REST create message, joined socket | `message:created` with public shape |
| REST update message, joined socket | `message:updated` with public shape |
| REST delete message, joined socket | `message:deleted` + `{ id, channelId, deletedAt }` |
| REST create message, non-joined socket | Nothing |

**Reaction broadcasts**

| Scenario | Expected |
|----------|----------|
| REST add reaction, joined socket | `reaction:added` + `{ messageId, channelId, emoji, user }` |
| REST remove reaction, joined socket | `reaction:removed` + `{ messageId, channelId, emoji, user }` |
| Duplicate reaction 409 | No broadcast |
| Missing reaction 404 | No broadcast |

**Read receipt broadcasts**

| Scenario | Expected |
|----------|----------|
| REST mark as read, joined socket | `read:updated` + `{ messageId, channelId, user, readAt }` |
| GET read-receipts | No broadcast |

**Typing indicators**

| Scenario | Expected |
|----------|----------|
| `typing:start` with valid joined channel | `typing:started` to room (sender excluded) |
| `typing:stop` with valid joined channel | `typing:stopped` to room (sender excluded) |
| Not joined channel | `typing:error` |
| Invalid channelId | `typing:error` |
| Missing channelId | `typing:error` |
| Missing user data | `typing:error` |

Typing payload:

```json
{
  "channelId": "uuid",
  "user": {
    "id": "uuid",
    "username": "string"
  }
}
```

**Presence**

| Scenario | Expected |
|----------|----------|
| Join channel | `presence:online` to room (sender excluded) |
| Leave channel (no other same-user socket in room) | `presence:offline` to that room |
| Leave channel (another same-user socket still in room) | No `presence:offline` |
| Socket disconnect (no other same-user socket in that room) | `presence:offline` to that room |
| Socket disconnect (another same-user socket still in that room) | No `presence:offline` |
| Last socket disconnect (different rooms) | `presence:offline` to all rooms the user was in |
| Multi-tab same room: close one tab | No `presence:offline` |
| Multi-tab different rooms: close room1 tab | `presence:offline` to room1 only |
| Unauthenticated socket | Not tracked, no presence events |

Presence payload:

```json
{
  "user": {
    "id": "uuid",
    "username": "string"
  },
  "status": "online" | "offline"
}
```

- All broadcasts are **best-effort**: REST succeeds even if WebSocket emit fails.
- `message:created` and `message:updated` payloads use the **public message contract** (no `authorId`, no `deletedAt`).
- `message:deleted` payload intentionally includes `deletedAt`: `{ id, channelId, deletedAt }`.
- `reaction:added`, `reaction:removed`, and `read:updated` payloads use their own public event contracts.
- Presence is **in-memory only**: no DB, no Redis, no `lastSeen`. Server restart clears all presence state. Multi-tab support: closing one tab does not emit `offline` if another tab (socket) remains connected.

**Invites**

| Endpoint | Method | Access |
|----------|--------|--------|
| `POST /workspaces/:workspaceId/invites` | Create invite | OWNER or ADMIN |
| `GET /workspaces/:workspaceId/invites` | List invites | OWNER or ADMIN |
| `POST /invites/accept` | Accept invite | Authenticated user |
| `DELETE /workspaces/:workspaceId/invites/:inviteId` | Revoke invite | OWNER or ADMIN |

Create invite rules:
- `email` is normalized to lowercase.
- `role` allowed: `ADMIN` or `MEMBER`. `OWNER` is rejected.
- Raw token returned **once** in response.
- `SHA-256(tokenHash)` stored in DB.
- `expiresAt` set to 7 days from creation.
- `workspaceId` must be active (not archived).

List invite rules:
- Only `OWNER` or `ADMIN` can list.
- Results are scoped to `workspaceId` only.
- Sorted by `createdAt DESC`.
- Response never includes `tokenHash` or raw `token`.
- Status mapping:
  - `deletedAt != null` → `REVOKED`
  - `usedAt != null` or `usedById != null` → `USED`
  - `expiresAt < now` → `EXPIRED`
  - otherwise → `PENDING`

Accept invite rules:
- Raw token is hashed with `SHA-256` before DB lookup.
- Invite must exist, not deleted, not used, not expired.
- `invitedEmail` must match current user's normalized email.
- Workspace must still be active.
- User must not already be an active member.
- `OWNER` role invites cannot be accepted.
- Transaction: mark invite used + create `WorkspaceMember`.
- Race against revoke is handled atomically (conditional update).

Revoke invite rules:
- Soft delete: sets `deletedAt`.
- Cannot revoke already used invite (`409`).
- Cannot revoke already deleted invite (`404`).
- Invite must belong to the specified workspace.
- Race against accept is handled atomically (conditional updateMany).

**Audit logging:**
- Create invite → `workspace.invite.created` (`entityType: invitation`, metadata: `{ role, expiresAt }`).
- Accept invite → `workspace.invite.accepted` (`entityType: invitation`, metadata: `{ role }`).
- Revoke invite → `workspace.invite.revoked` (`entityType: invitation`, metadata: `{ role }`).
- Raw token and `tokenHash` are **never** stored in audit metadata.

Invite state machine:
```text
created → accepted (usedAt set, WorkspaceMember created)
created → revoked (deletedAt set)
accepted → terminal (no further action)
revoked → terminal (no further action)
```

Current limitations:
- No email delivery.
- No frontend.
- Audit is recorded after successful action; not yet transactional with the main action.
- No audit listing endpoint yet.

### 16. Members

**GET** `/api/v1/workspaces/:workspaceId/members`

| Scenario | Expected |
|----------|----------|
| Any active workspace member | `200 OK` + list of active members |
| Non-member | `404 Not Found` |
| Inactive workspace | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Returns only active memberships (`deletedAt: null`).
- Sorted by `createdAt ASC` (oldest first).
- Response excludes `passwordHash` and other sensitive user fields.

**PATCH** `/api/v1/workspaces/:workspaceId/members/:memberId/role`

Body:

```json
{
  "role": "ADMIN"
}
```

| Scenario | Expected |
|----------|----------|
| OWNER promoting MEMBER to ADMIN | `200 OK` + updated member |
| OWNER demoting ADMIN to MEMBER | `200 OK` + updated member |
| ADMIN requester | `403 Forbidden` |
| MEMBER requester | `403 Forbidden` |
| Non-member requester | `404 Not Found` |
| Inactive workspace | `404 Not Found` |
| Target member from another workspace | `404 Not Found` |
| Deleted target member | `404 Not Found` |
| Target is current OWNER | `400 Bad Request` |
| Role `OWNER` in body | `400 Bad Request` |

- Only workspace OWNER can update member roles.
- Allowed roles in body: `ADMIN` | `MEMBER`.
- Current OWNER role cannot be changed.
- No ownership transfer.
- **Audit:** successful role update records `workspace.member.role_updated` with metadata `{ targetUserId, oldRole, newRole }`.

**DELETE** `/api/v1/workspaces/:workspaceId/members/:memberId`

| Scenario | Expected |
|----------|----------|
| OWNER removing MEMBER | `200 OK` + `{ id, workspaceId, deletedAt }` |
| OWNER removing ADMIN | `200 OK` + `{ id, workspaceId, deletedAt }` |
| ADMIN requester | `403 Forbidden` |
| MEMBER requester | `403 Forbidden` |
| Non-member requester | `404 Not Found` |
| Inactive workspace | `404 Not Found` |
| Target member from another workspace | `404 Not Found` |
| Already removed target member | `404 Not Found` |
| Target is workspace OWNER | `400 Bad Request` |
| Requester removes themselves | `400 Bad Request` |

- Only workspace OWNER can remove members.
- Removal is a **soft delete**: `deletedAt` is set to current timestamp.
- Removed members are excluded from `GET /workspaces/:workspaceId/members`.
- User account, messages, and invites are not affected.
- **Audit:** successful removal records `workspace.member.removed` with metadata `{ targetUserId, removedRole }`.

Current limitations:
- No ownership transfer.
- No frontend.
- Audit is recorded after successful action; not yet transactional with the main action.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `database: "error"` in health | Ensure `docker compose up -d` ran and PostgreSQL is healthy. Check `DATABASE_URL` in `.env`. |
| Migration fails | Ensure PostgreSQL is running. Run `npx prisma migrate dev` from `packages/database`. |
| Port 3001 in use | Set `PORT=3002` in `.env` or kill the process using port 3001. |
| Swagger 404 | Ensure `pnpm --filter api build` passes and the server restarted. |
