# Database Schema Specification

> **Project:** Secure Team Collaboration Platform  
> **Database:** PostgreSQL 15+  
> **ORM:** Prisma 5.x  
> **Date:** 2026-05-11  
> **Status:** Draft — for Phase 1 review  

---

## 1. Design Principles

1. **All user-facing entities are soft-deleted** via `deletedAt?: DateTime` (nullable timestamp). No `DELETE` statements in application code for business entities.
2. **Audit log is append-only.** No `updatedAt`, no `deletedAt` on `AuditLog`.
3. **Threads are flat.** A thread is a message with replies; replies are messages with `parentId`. No separate `Thread` table.
4. **Workspace role is the floor for channel access.** Channel membership is explicit in `ChannelMember` even for public channels to support role elevation and audit.
5. **Search is database-native.** PostgreSQL `tsvector` generated column + GIN index on `Message.content`.
6. **Polymorphic references use `{entityType, entityId}` pairs**, not foreign keys, to avoid tight coupling and circular dependencies.

---

## 2. Enums

| Enum | Values | Used By | Notes |
|------|--------|---------|-------|
| `WorkspaceRole` | `OWNER`, `ADMIN`, `MEMBER` | `WorkspaceMember.role` | Hierarchical. Only one `OWNER` per workspace at any time. |
| `ChannelType` | `PUBLIC`, `PRIVATE` | `Channel.type` | Immutable in MVP (see `decisions.md` D6). |
| `ChannelRole` | `OWNER`, `ADMIN`, `MEMBER` | `ChannelMember.role` | Effective role = `max(workspaceRole, channelRole)`. |
| `NotificationType` | `MENTION`, `THREAD_REPLY`, `CHANNEL_INVITE`, `SYSTEM` | `Notification.type` | Extensible enum for in-app bell. |
| `StorageBackend` | `LOCAL`, `S3`, `MINIO` | `Attachment.storageBackend` | Local for dev; S3/MinIO for prod. |
| `AuditAction` | `CREATE`, `UPDATE`, `DELETE`, `MODERATION_OVERRIDE`, `LOGIN`, `LOGOUT`, `INVITE_ACCEPT` | `AuditLog.action` | Extendable string enum. |

---

## 3. Entity Specifications

### 3.1 User

```prisma
model User {
  id            String    @id @default(uuid())
  email         String
  username      String    @unique
  passwordHash  String
  displayName   String?
  avatarUrl     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  // Relations
  ownedWorkspaces       Workspace[]
  workspaceMemberships  WorkspaceMember[]
  channelMemberships    ChannelMember[]
  messages              Message[]
  reactions             Reaction[]
  attachments           Attachment[]
  sentInvitations       Invitation[]    @relation("InvitationSentBy")
  acceptedInvitations   Invitation[]    @relation("InvitationAcceptedBy")
  notifications         Notification[]
  readReceipts          ReadReceipt[]
  refreshTokens         RefreshToken[]
  auditLogs             AuditLog[]      @relation("AuditLogActor")
  messageEdits          MessageEdit[]

  @@index([email])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `email` | String | NOT NULL | B-tree index | Lowercased in app layer; unique enforced via partial index `idx_user_email_lower`. |
| `username` | String | Unique, NOT NULL | B-tree unique | Regex: `^[a-zA-Z0-9_-]+$`. Used for mentions and login. |
| `passwordHash` | String | NOT NULL | — | Bcrypt output. |
| `displayName` | String | — | — | Defaults to email prefix if empty. |
| `avatarUrl` | String | — | — | Gravatar or uploaded file URL. |
| `createdAt` | DateTime | NOT NULL | B-tree | — |
| `updatedAt` | DateTime | NOT NULL | — | Auto-updated by Prisma. |
| `deletedAt` | DateTime | — | B-tree | Soft delete. `IS NULL` filter on all queries by default. |

---

### 3.2 Workspace

```prisma
model Workspace {
  id            String    @id @default(uuid())
  name          String
  slug          String    @unique
  description   String?
  ownerId       String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  // Relations
  owner     User              @relation(fields: [ownerId], references: [id])
  members   WorkspaceMember[]
  channels  Channel[]
  auditLogs AuditLog[]
  invitations Invitation[]
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `name` | String | NOT NULL | — | Display name. |
| `slug` | String | Unique, NOT NULL | B-tree unique | URL-friendly. Regexp: `^[a-z0-9-]+$`. |
| `description` | String | — | — | — |
| `ownerId` | UUID | FK → User.id, NOT NULL | B-tree | Transferable. |
| `deletedAt` | DateTime | — | B-tree | Soft delete. |

**Note on `slug` uniqueness:** Global unique in MVP. If soft-deleted workspaces must free slugs, handle via app-layer suffix or post-MVP partial unique index.

---

### 3.3 WorkspaceMember

Junction + role between User and Workspace.

```prisma
model WorkspaceMember {
  id          String        @id @default(uuid())
  workspaceId String
  userId      String
  role        WorkspaceRole
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  deletedAt   DateTime?

  // Relations
  workspace Workspace @relation(fields: [workspaceId], references: [id])
  user      User      @relation(fields: [userId], references: [id])

  @@index([workspaceId, userId])
  @@index([workspaceId, role])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `workspaceId` | UUID | FK, NOT NULL | B-tree composite | Part of partial unique index `idx_workspace_member_active`. |
| `userId` | UUID | FK, NOT NULL | B-tree composite | — |
| `role` | Enum | NOT NULL | B-tree | `OWNER`, `ADMIN`, `MEMBER`. |
| `deletedAt` | DateTime | — | B-tree | Soft delete preserves membership history. |

---

### 3.4 Channel

```prisma
model Channel {
  id          String      @id @default(uuid())
  workspaceId String
  name        String
  slug        String
  type        ChannelType
  createdById String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  deletedAt   DateTime?

  // Relations
  workspace   Workspace     @relation(fields: [workspaceId], references: [id])
  createdBy   User          @relation(fields: [createdById], references: [id])
  members     ChannelMember[]
  messages    Message[]
  auditLogs   AuditLog[]
  notifications Notification[]

  @@unique([workspaceId, slug])
  @@index([workspaceId, deletedAt])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `workspaceId` | UUID | FK, NOT NULL | B-tree composite | Part of `@@unique([workspaceId, slug])`. |
| `name` | String | NOT NULL | — | Display name. |
| `slug` | String | NOT NULL | B-tree composite | Unique per workspace. |
| `type` | Enum | NOT NULL, DEFAULT `PUBLIC` | — | `PUBLIC` or `PRIVATE`. Immutable in MVP (see `decisions.md` D6). |
| `createdById` | UUID | FK → User.id, NOT NULL | B-tree | Creator gets explicit `OWNER` in `ChannelMember`. |
| `deletedAt` | DateTime | — | B-tree | Soft delete. |

---

### 3.5 ChannelMember

Junction + explicit channel role. Required for **all** channels (see §10 for rationale).

```prisma
model ChannelMember {
  id        String      @id @default(uuid())
  channelId String
  userId    String
  role      ChannelRole
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  deletedAt DateTime?

  // Relations
  channel Channel @relation(fields: [channelId], references: [id])
  user    User    @relation(fields: [userId], references: [id])

  @@index([channelId, userId])
  @@index([channelId, role])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `channelId` | UUID | FK, NOT NULL | B-tree composite | Part of partial unique index `idx_channel_member_active`. |
| `userId` | UUID | FK, NOT NULL | B-tree composite | — |
| `role` | Enum | NOT NULL | B-tree | `OWNER`, `ADMIN`, `MEMBER`. |
| `deletedAt` | DateTime | — | B-tree | Soft delete preserves join history. |

---

### 3.6 Message

Self-referencing for threads. `parentId` is the threading mechanism.

```prisma
model Message {
  id            String    @id @default(uuid())
  channelId     String
  authorId      String
  parentId      String?
  content       String
  editedAt      DateTime?
  searchVector  Unsupported("tsvector")?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  // Relations
  channel     Channel       @relation(fields: [channelId], references: [id])
  author      User          @relation(fields: [authorId], references: [id])
  parent      Message?      @relation("ThreadReplies", fields: [parentId], references: [id])
  replies     Message[]     @relation("ThreadReplies")
  reactions   Reaction[]
  attachments Attachment[]
  edits       MessageEdit[]
  readReceipts ReadReceipt[]
  notifications Notification[]

  @@index([channelId, createdAt, id])
  @@index([parentId, createdAt])
  // Note: GIN index on searchVector is added via raw migration (see §7.2)
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `channelId` | UUID | FK, NOT NULL | B-tree composite | Part of cursor-pagination index. |
| `authorId` | UUID | FK → User.id, NOT NULL | B-tree | Soft-deleted users still referenced (no cascade). |
| `parentId` | UUID | FK → Message.id, nullable | B-tree composite | Self-reference for threads. |
| `content` | String | NOT NULL | — | Max length 4000 enforced in app. |
| `editedAt` | DateTime | — | — | Set on first edit; null if never edited. |
| `searchVector` | `tsvector` | Generated | GIN | See §8. Prisma `Unsupported` type; managed via raw migration. |
| `deletedAt` | DateTime | — | B-tree | Soft delete. |

**Why no separate `Thread` table:** A thread is a temporal view of messages sharing a `parentId`. Adding a `Thread` table would require synchronizing two write paths (message insert + thread upsert) with no benefit for MVP scope. The `parentId` pattern is used by Slack, Discord, and Mastodon.

---

### 3.7 MessageEdit

Append-only edit history. Required per locked `scope.md` §2.4.

```prisma
model MessageEdit {
  id          String   @id @default(uuid())
  messageId   String
  oldContent  String
  newContent  String
  editedById  String
  createdAt   DateTime @default(now())

  // Relations
  message  Message @relation(fields: [messageId], references: [id])
  editedBy User    @relation(fields: [editedById], references: [id])

  @@index([messageId, createdAt])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `messageId` | UUID | FK, NOT NULL | B-tree composite | — |
| `oldContent` | String | NOT NULL | — | Snapshot before edit. |
| `newContent` | String | NOT NULL | — | Snapshot after edit. |
| `editedById` | UUID | FK → User.id, NOT NULL | B-tree | Usually equals message.authorId; stored for audit. |
| `createdAt` | DateTime | NOT NULL | B-tree | — |

**No `deletedAt`**: edit history is immutable audit data.

---

### 3.8 Reaction

```prisma
model Reaction {
  id        String   @id @default(uuid())
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  // Relations
  message Message @relation(fields: [messageId], references: [id])
  user    User    @relation(fields: [userId], references: [id])

  @@index([messageId, userId, emoji])
  @@index([messageId, deletedAt])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `messageId` | UUID | FK, NOT NULL | B-tree composite | Part of partial unique index `idx_reaction_active`. |
| `userId` | UUID | FK, NOT NULL | B-tree composite | — |
| `emoji` | String | NOT NULL | B-tree composite | Unicode emoji string. |
| `deletedAt` | DateTime | — | B-tree | Toggle = soft-delete + re-create if needed. |

---

### 3.9 Attachment (File)

Metadata only. Binary data lives in object storage (local/S3/MinIO).

```prisma
model Attachment {
  id              String         @id @default(uuid())
  messageId       String?
  filename        String
  originalName    String
  mimeType        String
  size            Int
  storageKey      String         @unique
  storageBackend  StorageBackend
  createdById     String
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  deletedAt       DateTime?

  // Relations
  message   Message? @relation(fields: [messageId], references: [id])
  createdBy User     @relation(fields: [createdById], references: [id])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `messageId` | UUID | FK, nullable | B-tree | Nullable because upload may precede message creation. |
| `filename` | String | NOT NULL | — | Server-generated UUID + ext. |
| `originalName` | String | NOT NULL | — | Original client filename for display. |
| `mimeType` | String | NOT NULL | — | Whitelist enforced in app. |
| `size` | Int | NOT NULL | — | Bytes. Max 10MB enforced in app. |
| `storageKey` | String | Unique, NOT NULL | B-tree unique | Path/key in storage backend. |
| `storageBackend` | Enum | NOT NULL | — | `LOCAL`, `S3`, `MINIO`. |
| `createdById` | UUID | FK, NOT NULL | B-tree | — |
| `deletedAt` | DateTime | — | B-tree | Async cleanup job via Bull. |

---

### 3.10 AuditLog

Append-only. No FK on `entityId` because references are polymorphic.

```prisma
model AuditLog {
  id          String      @id @default(uuid())
  actorId     String?
  action      AuditAction
  entityType  String
  entityId    String
  workspaceId String?
  channelId   String?
  metadata    Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime    @default(now())

  // Relations
  actor     User?      @relation("AuditLogActor", fields: [actorId], references: [id])
  workspace Workspace? @relation(fields: [workspaceId], references: [id])
  channel   Channel?   @relation(fields: [channelId], references: [id])

  @@index([workspaceId, createdAt])
  @@index([entityType, entityId])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `actorId` | UUID | FK → User.id, nullable | B-tree | Null for system actions. |
| `action` | Enum | NOT NULL | B-tree | See enum `AuditAction`. |
| `entityType` | String | NOT NULL | B-tree composite | E.g. `Message`, `Channel`, `Workspace`. |
| `entityId` | String | NOT NULL | B-tree composite | UUID string; not a foreign key. |
| `workspaceId` | UUID | FK, nullable | B-tree composite | For workspace-scoped filtering. |
| `channelId` | UUID | FK, nullable | B-tree | Optional context. |
| `metadata` | JSON | — | — | Arbitrary context (old/new values, reason). |
| `ipAddress` | String | — | — | For security forensics. |
| `userAgent` | String | — | — | For security forensics. |
| `createdAt` | DateTime | NOT NULL | B-tree | — |

**No `updatedAt`, no `deletedAt`.** Immutable by design.

---

### 3.11 RefreshToken

Stored hashed. Supports rotation and revocation.

```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  ipAddress String?
  userAgent String?
  createdAt DateTime  @default(now())
  deletedAt DateTime?

  // Relations
  user User @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([tokenHash])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `userId` | UUID | FK, NOT NULL | B-tree | — |
| `tokenHash` | String | Unique, NOT NULL | B-tree unique | SHA-256 of the raw token. Raw token never stored. |
| `expiresAt` | DateTime | NOT NULL | B-tree | TTL enforced in app + DB cleanup job. |
| `revokedAt` | DateTime | — | — | Explicit revocation (logout, rotation, security event). |
| `deletedAt` | DateTime | — | B-tree | Soft delete for consistency with other entities. |

**Rotation flow:** On refresh, mark current token `revokedAt = now()`, create new token row, return new raw token to client.

---

### 3.12 Invitation (Workspace)

Token-based invite. No email delivery in MVP; token is copied/shared manually.

```prisma
model Invitation {
  id          String        @id @default(uuid())
  workspaceId String
  invitedById String
  role        WorkspaceRole
  invitedEmail String?
  token       String        @unique
  expiresAt   DateTime
  usedById    String?
  usedAt      DateTime?
  createdAt   DateTime      @default(now())
  deletedAt   DateTime?

  // Relations
  workspace Workspace @relation(fields: [workspaceId], references: [id])
  invitedBy User      @relation("InvitationSentBy", fields: [invitedById], references: [id])
  usedBy    User?     @relation("InvitationAcceptedBy", fields: [usedById], references: [id])

  @@index([workspaceId, createdAt])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `workspaceId` | UUID | FK, NOT NULL | B-tree | — |
| `invitedById` | UUID | FK, NOT NULL | B-tree | — |
| `role` | Enum | NOT NULL, DEFAULT `MEMBER` | — | Role assigned upon acceptance. |
| `invitedEmail` | String | — | — | Optional email binding. If set, acceptor must match. |
| `token` | String | Unique, NOT NULL | B-tree unique | Cryptographically random string (32+ bytes). |
| `expiresAt` | DateTime | NOT NULL | B-tree | Default 7 days. |
| `usedById` | UUID | FK, nullable | B-tree | Set when accepted. |
| `usedAt` | DateTime | — | — | Set when accepted. |
| `deletedAt` | DateTime | — | B-tree | Revocation / cleanup. |

---

### 3.13 Notification

In-app only. No email delivery in MVP.

```prisma
model Notification {
  id          String           @id @default(uuid())
  userId      String
  type        NotificationType
  title       String
  body        String
  entityType  String?
  entityId    String?
  workspaceId String?
  channelId   String?
  isRead      Boolean          @default(false)
  readAt      DateTime?
  createdAt   DateTime         @default(now())
  deletedAt   DateTime?

  // Relations
  user      User      @relation(fields: [userId], references: [id])
  workspace Workspace? @relation(fields: [workspaceId], references: [id])
  channel   Channel?  @relation(fields: [channelId], references: [id])

  @@index([userId, isRead, createdAt])
  @@index([userId, createdAt])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `userId` | UUID | FK, NOT NULL | B-tree composite | Recipient. |
| `type` | Enum | NOT NULL | — | `MENTION`, `THREAD_REPLY`, `CHANNEL_INVITE`, `SYSTEM`. |
| `title` | String | NOT NULL | — | Short display text. |
| `body` | String | NOT NULL | — | Detail text. |
| `entityType` | String | — | — | Polymorphic ref (e.g. `Message`). |
| `entityId` | String | — | — | Polymorphic ref UUID. |
| `isRead` | Boolean | NOT NULL, DEFAULT false | B-tree composite | Part of unread query index. |
| `readAt` | DateTime | — | — | Set on first read. |
| `deletedAt` | DateTime | — | B-tree | Soft delete for dismissed notifications. |

---

### 3.14 ReadReceipt

Per-user, per-message read tracking.

```prisma
model ReadReceipt {
  id        String   @id @default(uuid())
  messageId String
  userId    String
  channelId String
  readAt    DateTime @default(now())
  createdAt DateTime @default(now())

  // Relations
  message Message @relation(fields: [messageId], references: [id])
  user    User    @relation(fields: [userId], references: [id])

  @@unique([messageId, userId])
  @@index([channelId, userId, readAt])
}
```

| Field | Type | Constraints | Index | Notes |
|-------|------|-------------|-------|-------|
| `id` | UUID | PK | — | — |
| `messageId` | UUID | FK, NOT NULL | B-tree composite | Part of `@@unique([messageId, userId])`. |
| `userId` | UUID | FK, NOT NULL | B-tree composite | — |
| `channelId` | UUID | NOT NULL | B-tree composite | Denormalized for fast channel-level queries. |
| `readAt` | DateTime | NOT NULL | — | — |

---

## 4. Entity Relationship Diagram (Text)

```
User ||--o{ WorkspaceMember : "member of"
User ||--o{ Workspace : "owns"
User ||--o{ ChannelMember : "member of"
User ||--o{ Message : "author"
User ||--o{ Reaction : "reacts"
User ||--o{ Attachment : "uploads"
User ||--o{ RefreshToken : "has"
User ||--o{ Notification : "receives"
User ||--o{ ReadReceipt : "reads"
User ||--o{ Invitation : "sends"
User ||--o{ Invitation : "accepts"
User ||--o{ AuditLog : "actor"

Workspace ||--o{ WorkspaceMember : "has"
Workspace ||--o{ Channel : "contains"
Workspace ||--o{ AuditLog : "logged"
Workspace ||--o{ Invitation : "has"
Workspace ||--o{ Notification : "scoped"

Channel ||--o{ ChannelMember : "has"
Channel ||--o{ Message : "contains"
Channel ||--o{ AuditLog : "logged"
Channel ||--o{ Notification : "scoped"

Message ||--o{ Message : "replies (parentId)"
Message ||--o{ Reaction : "has"
Message ||--o{ Attachment : "attached to"
Message ||--o{ MessageEdit : "edited"
Message ||--o{ ReadReceipt : "read by"
Message ||--o{ Notification : "referenced"
```

---

## 5. Soft Delete Strategy

| Entity | `deletedAt` | Behavior | Notes |
|--------|-------------|----------|-------|
| User | Yes | User row retained; auth blocked; profile anonymized | Display name → `[Deleted User]` per legacy pattern. |
| Workspace | Yes | Hidden from lists; data retained | Owner transfer required before delete. |
| WorkspaceMember | Yes | Membership history preserved | Re-join possible by creating new row. |
| Channel | Yes | Hidden from lists; messages readable by admins | Direct links still work for admins. |
| ChannelMember | Yes | Join/leave history preserved | Re-join possible. |
| Message | Yes | Content masked; metadata retained | Returns `{ deleted: true }` in API. |
| MessageEdit | No | Immutable audit data | No soft delete. |
| Reaction | Yes | Toggle via soft-delete + recreate | Unique constraint respects `deletedAt` via partial index in raw SQL if needed. |
| Attachment | Yes | Async storage cleanup via Bull | Metadata retained for audit. |
| AuditLog | **No** | Append-only | Never updated, never deleted. |
| RefreshToken | Yes | Revoked tokens soft-deleted after TTL | Periodic cleanup job. |
| Invitation | Yes | Revoked invites soft-deleted | Prevents reuse. |
| Notification | Yes | Dismissed notifications soft-deleted | Or hard delete if privacy needed; soft delete for consistency. |
| ReadReceipt | **No** | Hard delete or update | Event/fact entity; not soft-deleted per Decision D5. |

---

## 6. Audit Log Design

### 6.1 Logged Actions
Every `CREATE`, `UPDATE`, `DELETE` on business entities is logged.

| Action | Entity Types | Metadata Example |
|--------|--------------|------------------|
| `CREATE` | Workspace, Channel, Message, Reaction, Attachment | `{ after: object }` |
| `UPDATE` | Workspace, Channel, Message | `{ before: object, after: object }` |
| `DELETE` (soft) | All soft-deletable | `{ reason: "user_action", deletedAt: "..." }` |
| `MODERATION_OVERRIDE` | Channel, Message | `{ overrideReason: "admin_delete", actorRole: "ADMIN" }` |
| `LOGIN` / `LOGOUT` | User | `{ ipAddress, userAgent }` |
| `INVITE_ACCEPT` | Invitation | `{ token: "...", role: "MEMBER" }` |

### 6.2 Write Path
Audit rows are written by a centralized `AuditService`, not by controllers directly. The service is called at the end of successful transactions (after-commit hook or explicit call in service layer).

### 6.3 Retention
MVP does not implement retention policies. Audit data accumulates indefinitely. v2 may add partition-based archiving.

---

## 7. Full-Text Search Strategy

### 7.1 Generated Column
`Message.searchVector` is a PostgreSQL generated column:

```sql
ALTER TABLE "Message" ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
```

Prisma schema uses `Unsupported("tsvector")` for this field. The generated column is added via a raw migration (`prisma migrate dev --create-only` + SQL), not via Prisma's declarative schema.

### 7.2 GIN Index
```sql
CREATE INDEX idx_message_search_vector ON "Message"
USING GIN ("searchVector");
```

### 7.3 Query Pattern (pseudo-SQL)
```sql
SELECT m.*, ts_rank(m."searchVector", query) as rank
FROM "Message" m, plainto_tsquery('english', $1) query
WHERE m."searchVector" @@ query
  AND m."channelId" = $2
  AND m."deletedAt" IS NULL
ORDER BY rank DESC, m."createdAt" DESC
LIMIT 20;
```

### 7.4 Prisma Integration
Because `searchVector` is `Unsupported`, Prisma Client cannot read/write it. Searches use `$queryRaw` or `$queryRawUnsafe` with parameterized inputs. Rank is computed in SQL, not stored.

---

## 8. Thread Modeling

### 8.1 No `Thread` Table
A thread is a logical view, not a physical table.

```
Message (parent)
├── Message (reply)  parentId = parent.id
├── Message (reply)  parentId = parent.id
└── Message (reply)  parentId = parent.id
```

### 8.2 Query Patterns
- **Thread view:** `SELECT * FROM Message WHERE parentId = ? ORDER BY createdAt ASC`
- **Channel view (top-level only):** `SELECT * FROM Message WHERE channelId = ? AND parentId IS NULL ORDER BY createdAt DESC`
- **Reply count:** `SELECT parentId, COUNT(*) FROM Message WHERE parentId IN (...) GROUP BY parentId`

### 8.3 Depth Limit
MVP supports only one level of threading (flat replies). Only messages with `parentId IS NULL` can be parents. Enforced in service layer; rejects `parentId` pointing to a message that already has its own `parentId`. Deep nesting is a v2 consideration.

---

## 9. Why ChannelMember Exists for Public Channels

Public channels grant read access to all workspace members by default, but explicit `ChannelMember` records are still required for three reasons:

1. **Role elevation:** A workspace MEMBER who creates a public channel needs an explicit `OWNER` record in `ChannelMember` to manage that channel.
2. **Explicit admins:** Workspace admins may promote a member to `ADMIN` in a specific public channel without promoting them workspace-wide.
3. **Audit trail:** Knowing exactly who joined which channel and when is required for compliance.

**Effective permission resolution:**
```
if workspaceRole == OWNER → effective = OWNER
if workspaceRole == ADMIN  → effective = ADMIN
else → effective = explicitChannelRole (or MEMBER if public member)
```

---

## 10. Indexes & Constraints Summary

| Table | Index / Constraint | Type | Purpose |
|-------|-------------------|------|---------|
| User | `LOWER(email)` | Partial unique (raw SQL) | Case-insensitive auth lookup. |
| Workspace | `slug` | Unique | URL routing. |
| WorkspaceMember | `[workspaceId, userId]` | Partial unique (raw SQL) | One active membership per user per workspace. |
| WorkspaceMember | `[workspaceId, role]` | B-tree | Fast admin/owner lookups. |
| Channel | `[workspaceId, slug]` | Unique | Per-workspace URL routing. |
| Channel | `[workspaceId, deletedAt]` | B-tree | Filtered channel lists. |
| ChannelMember | `[channelId, userId]` | Partial unique (raw SQL) | One active membership per user per channel. |
| ChannelMember | `[channelId, role]` | B-tree | Fast owner/admin lookups. |
| Message | `[channelId, createdAt, id]` | B-tree | Cursor pagination. |
| Message | `[parentId, createdAt]` | B-tree | Thread reply ordering. |
| Message | `searchVector` | GIN | Full-text search. |
| Reaction | `[messageId, userId, emoji]` | Partial unique (raw SQL) | One active reaction per emoji per user. |
| MessageEdit | `[messageId, createdAt]` | B-tree | Edit history chronology. |
| Attachment | `storageKey` | Unique | Deduplication / lookup. |
| RefreshToken | `tokenHash` | Unique | Rotation lookup. |
| RefreshToken | `[userId, createdAt]` | B-tree | Token listing. |
| AuditLog | `[workspaceId, createdAt]` | B-tree | Workspace audit queries. |
| AuditLog | `[entityType, entityId]` | B-tree | Entity-centric forensics. |
| AuditLog | `[actorId, createdAt]` | B-tree | User action history. |
| Invitation | `token` | Unique | Invite link validation. |
| Notification | `[userId, isRead, createdAt]` | B-tree | Unread bell queries. |
| ReadReceipt | `[messageId, userId]` | Unique | One read receipt per user per message. |
| ReadReceipt | `[channelId, userId, readAt]` | B-tree | Channel read status aggregation. |

---

## 11. Migration Order

1. `User` (no FKs)
2. `Workspace` (FK: User)
3. `WorkspaceMember` (FK: Workspace, User)
4. `Channel` (FK: Workspace, User)
5. `ChannelMember` (FK: Channel, User)
6. `Message` (FK: Channel, User; self-ref)
7. `MessageEdit` (FK: Message, User)
8. `Reaction` (FK: Message, User)
9. `Attachment` (FK: Message, User)
10. `RefreshToken` (FK: User)
11. `Invitation` (FK: Workspace, User x2)
12. `Notification` (FK: User, Workspace, Channel)
13. `ReadReceipt` (FK: Message, User)
14. `AuditLog` (FK: User, Workspace, Channel — nullable)
15. Raw SQL: `Message.searchVector` generated column + GIN index
16. Raw SQL: Partial unique indexes for soft-deletable junction tables:
    ```sql
    CREATE UNIQUE INDEX idx_workspace_member_active ON "WorkspaceMember" ("workspaceId", "userId") WHERE "deletedAt" IS NULL;
    CREATE UNIQUE INDEX idx_channel_member_active ON "ChannelMember" ("channelId", "userId") WHERE "deletedAt" IS NULL;
    CREATE UNIQUE INDEX idx_reaction_active ON "Reaction" ("messageId", "userId", "emoji") WHERE "deletedAt" IS NULL;
    ```
17. Raw SQL: Case-insensitive email unique:
    ```sql
    CREATE UNIQUE INDEX idx_user_email_lower ON "User" (LOWER(email));
    ```

---

## 12. Out of Schema (v2 / Post-MVP)

- **Email delivery / SMTP integration** — out of MVP; no `EmailQueue` table.
- **Message pinning** — no `PinnedMessage` table.
- **User groups / @admin mentions** — no `UserGroup` table.
- **Channel categories** — no `ChannelCategory` table.
- **Custom emoji** — `Reaction.emoji` is String; no `CustomEmoji` table.
- **Voice/video state** — no WebRTC state tables.
- **Data export jobs** — no `ExportJob` table.
- **Webhooks / integrations** — no `WebhookSubscription` table.
