# Group Chats (B213)

> Standalone multi-user conversations outside of workspaces and direct messages.
> Feature doc: [`docs/group-chats.md`](group-chats.md)

---

## Overview

Group chats are implemented as a self-contained domain in both the backend and frontend.
They are not tied to a workspace, do not reuse channel/DM models, and have a simple
permission model: the creator is the `OWNER`, everyone else is a `MEMBER`.

Key product rules:

- A group must have at least one other member besides the creator.
- A group can have up to 99 additional members (configurable via DTO validation).
- The `OWNER` can rename the group, add/remove members, and archive it.
- Any member can leave, except the sole owner.
- Archived groups disappear from lists and block new messages.
- Non-members receive `404` for group details and messages — no existence leakage.

---

## Models

Group chats use three Prisma models plus a dedicated enum. Read-state is stored on
`GroupMember.lastReadAt`; there is no separate read-state table.

### `GroupRole` enum

| Value | Description |
|-------|-------------|
| `OWNER` | Created the group; can manage/rename/archive it. |
| `MEMBER` | Regular participant; can send messages and leave. |

### `GroupConversation`

```prisma
model GroupConversation {
  id          String    @id @default(uuid()) @db.Uuid
  name        String
  createdById String    @db.Uuid
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  createdBy User           @relation(fields: [createdById], references: [id], onDelete: Cascade)
  members   GroupMember[]
  messages  GroupMessage[]

  @@index([updatedAt])
  @@index([archivedAt])
}
```

### `GroupMember`

```prisma
model GroupMember {
  id         String    @id @default(uuid()) @db.Uuid
  groupId    String    @db.Uuid
  userId     String    @db.Uuid
  role       GroupRole @default(MEMBER)
  joinedAt   DateTime  @default(now())
  leftAt     DateTime?
  lastReadAt DateTime?

  group GroupConversation @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user  User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
  @@index([groupId])
  @@index([userId])
  @@index([groupId, userId])
}
```

### `GroupMessage`

```prisma
model GroupMessage {
  id        String   @id @default(uuid()) @db.Uuid
  groupId   String   @db.Uuid
  authorId  String   @db.Uuid
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  group  GroupConversation @relation(fields: [groupId], references: [id], onDelete: Cascade)
  author User              @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([groupId, createdAt])
  @@index([authorId])
}
```

### Migration

`packages/database/prisma/migrations/20260624130000_add_group_chats`

---

## API Endpoints

All routes are prefixed with `/api/v1` and require a valid JWT access token.

| Endpoint | Method | Auth | Permission | Notes |
|----------|--------|------|------------|-------|
| `/groups` | GET | Bearer | Member of listed groups | Returns my groups with unread counts. |
| `/groups` | POST | Bearer | Authenticated | Create a group; `memberIds` must contain at least one other user. |
| `/groups/:groupId` | GET | Bearer | Active group member | Includes members, last message, `myRole`, unread count. |
| `/groups/:groupId` | PATCH | Bearer | Group `OWNER` only | Rename the group. |
| `/groups/:groupId` | DELETE | Bearer | Group `OWNER` only | Archive (soft-delete) the group. |
| `/groups/:groupId/members` | POST | Bearer | Group `OWNER` only | Add a member by `userId`. |
| `/groups/:groupId/members/:userId` | DELETE | Bearer | Group `OWNER` only | Remove a member. |
| `/groups/:groupId/leave` | POST | Bearer | Active group member | Owner cannot leave if sole owner. |
| `/groups/:groupId/messages` | GET | Bearer | Active group member | List messages (cursor-paginated, oldest-first page). Supports `limit` and `cursor`. |
| `/groups/:groupId/messages` | POST | Bearer | Active group member | Send a text message. `parentId` is rejected. |
| `/groups/:groupId/read` | POST | Bearer | Active group member | Mark group as read for current user. |
| `/users/search?q=` | GET | Bearer | Authenticated | Search users by username/email when adding members. |

### Create group request/response

**Request:**

```json
{
  "name": "Weekend trip",
  "memberIds": [
    "00000000-0000-0000-0000-000000000000",
    "11111111-1111-1111-1111-111111111111"
  ]
}
```

**Response 201:** full `GroupSummary` object with the creator as `OWNER`.

---

## WebSocket Events

Group chat events use the existing Socket.io connection. A client must emit
`group:join { groupId }` before receiving group room broadcasts. The server verifies
active membership on every join.

| Event | Direction | Room / Scope | Payload | When |
|-------|-----------|--------------|---------|------|
| `group:join` | Client → Server | — | `{ groupId }` | Subscribe to a group room. |
| `group:joined` | Server → Client | personal | `{ groupId }` | Ack after joining. |
| `group:leave` | Client → Server | — | `{ groupId }` | Leave the group room. |
| `group:left` | Server → Client | personal | `{ groupId }` | Ack after leaving. |
| `group:message:created` | Server → broadcast | `group-conversation:<id>` | message object | New message sent via REST. |
| `group:conversation:updated` | Server → targeted | `user:<userId>` | group summary | Create/rename/add/remove/archive. |
| `group:member:removed` | Server → broadcast | `group-conversation:<id>` | `{ userId }` | Member removed or left. |
| `group:conversation:read` | Server → broadcast | `group-conversation:<id>` | `{ groupId, userId, readAt }` | A member marked the group read. |
| `group:typing:start` / `group:typing:stop` | Client → Server | — | `{ groupId }` | Typing indicator. |
| `group:typing` | Server → broadcast | `group-conversation:<id>` | `{ groupId, user, isTyping }` | Forwarded typing state. |

---

## Security Rules

- JWT required on every endpoint via `JwtAccessGuard`.
- Non-members receive `404 Not Found` for group details and messages (no `403` leakage).
- Only the group `OWNER` can:
  - rename (`PATCH`);
  - add members (`POST /members`);
  - remove members (`DELETE /members/:userId`);
  - archive the group (`DELETE`).
- Members can leave (`POST /leave`), except the sole owner.
- Archived groups are inaccessible and block new messages.
- Creator is automatically added as `OWNER` and must not be included in `memberIds`.

---

## Push Notifications

New group messages trigger Web Push notifications for members who have opted in.

- Notification `data.type` is `group_message`.
- Payload includes only `groupId` and `messageId` — no full message content in push data.
- The sender is excluded from notifications.
- Push delivery is best-effort; failures are caught and do not block message sending.

---

## Frontend

- **`/groups`** — list of my groups with unread badges; create-group modal with user
  search (`GET /users/search?q=`).
- **`/groups/[groupId]`** — conversation view with message list, composer, and a
  settings button.
- **`GroupSettingsModal`** — rename, add/remove members, leave, and archive (owner-only
  archive/remove/rename).
- **Sidebar** — "Groups" link sits between DMs and Workspaces; group unread count is
  included in the global unread total and browser tab title.

---

## Tests / Verification

| Suite | Location | Coverage |
|-------|----------|----------|
| Service unit tests | `apps/api/src/groups/groups.service.spec.ts` | CRUD, membership, permissions, broadcasting hooks. |
| Push service tests | `apps/api/src/push/push.service.spec.ts` | `notifyGroupMessage` payload, sender exclusion, locale strings. |
| E2E security tests | `apps/api/test/groups.e2e-spec.ts` | Member vs non-member access, owner-only actions. |
| Production verifier | `scripts/verify-production-groups.mjs` | End-to-end happy path + access-control checks against production. |

Run the production verifier:

```bash
node scripts/verify-production-groups.mjs
```

The script creates disposable owner/member/stranger accounts, exercises group CRUD,
membership, messaging, read state, and security rules, then archives the test group.
