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
| Complete wrong message | `404 Not Found` — Attachment not found |
| Size mismatch (uploaded ≠ declared) | `422 Unprocessable Entity` — Uploaded file size does not match expected size |
| Content-type mismatch | `422 Unprocessable Entity` — Uploaded file type does not match expected type |
| Deleted message | `404 Not Found` |
| Private channel as non-member | `404 Not Found` |
| Without token | `401 Unauthorized` |

- Verifies object existence via MinIO `HEAD` before confirming.

**GET** `/api/v1/workspaces/:workspaceId/channels/:channelId/messages/:messageId/attachments/:attachmentId/download`

| Scenario | Expected |
|----------|----------|
| Download completed attachment | `200 OK` + `{ attachmentId, filename, mimeType, sizeBytes, downloadUrl, expiresInSeconds }` |
| Download never-uploaded attachment | `409 Conflict` — Upload not completed |
| Download fake attachmentId | `404 Not Found` — Attachment not found |
| Deleted message | `404 Not Found` |
| Private channel as non-member | `404 Not Found` |
| Without token | `401 Unauthorized` |

- `downloadUrl` is a presigned GET URL valid for 300 seconds.
- Object existence is verified via MinIO `HEAD` before generating the URL.

### 14. API Documentation (Swagger)

Open: http://localhost:3001/api/docs

- Lists all registered endpoints.
- Try out requests directly from the browser.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `database: "error"` in health | Ensure `docker compose up -d` ran and PostgreSQL is healthy. Check `DATABASE_URL` in `.env`. |
| Migration fails | Ensure PostgreSQL is running. Run `npx prisma migrate dev` from `packages/database`. |
| Port 3001 in use | Set `PORT=3002` in `.env` or kill the process using port 3001. |
| Swagger 404 | Ensure `pnpm --filter api build` passes and the server restarted. |
