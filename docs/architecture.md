# Architecture Overview

> **Project:** lets-chat Modern Rebuild — Secure Team Collaboration Platform  
> **Date:** 2026-05-11  
> **Status:** Locked for MVP implementation

---

## 1. System Overview

The platform is a **multi-tenant team collaboration application** built around three core concepts:

| Concept | Description |
|---------|-------------|
| **User** | Identity, auth, profile. One user can belong to many workspaces. |
| **Workspace** | Tenant boundary. Contains channels, members, invites, audit logs. |
| **Channel** | Conversation container. Public (all workspace members) or private (explicit members only). |

All business logic is **workspace-scoped**. Cross-workspace data access is forbidden at the service layer.

**Auth model:** JWT access token (15 min, Bearer) + HTTP-only refresh token cookie (7 days, rotation). No server-side sessions.

**Real-time layer:** Socket.io 4 with Redis adapter. WebSocket is broadcast-only; all CRUD goes through REST.

---

## 2. Monorepo Structure

```
lets-chat-modern-rebuild/
├── apps/
│   ├── api/              # NestJS 11 backend
│   └── web/              # Next.js 16 + React 19 frontend (App Router)
├── packages/
│   ├── database/         # Prisma schema + generated client
│   └── shared/           # Shared TypeScript types, DTOs, enums
├── docker-compose.yml    # PostgreSQL 15, Redis 7, MinIO
├── .env.example
└── pnpm-workspace.yaml
```

**Package manager:** pnpm with workspaces.

---

## 3. Backend Modules (`apps/api`)

| Module | Responsibility | Key External |
|--------|---------------|--------------|
| `AuthModule` | Register, login, logout, refresh, JWT issuance | bcrypt, jose |
| `UserModule` | Profile CRUD, avatar | — |
| `WorkspaceModule` | Workspace CRUD, members, roles, invites | — |
| `ChannelModule` | Channel CRUD, members, archive | — |
| `MessageModule` | Message CRUD, threads, reactions, search | PostgreSQL `tsvector` |
| `AttachmentModule` | Presigned URL generation, metadata | MinIO / S3 SDK |
| `NotificationModule` | Mention & system notifications | — |
| `AuditModule` | Append-only audit log writes | — |
| `PresenceModule` | Online/offline tracking, channel viewers | Redis Sets |
| `WebsocketModule` | Socket.io gateway, room management, broadcasts | Socket.io + Redis Adapter |

**Cross-cutting concerns:**
- `PermissionGuard` — role-based access control per workspace/channel
- `RateLimitInterceptor` — Redis-backed sliding window
- `AuditInterceptor` — auto-logs mutations to `AuditLog`
- `ZodValidationPipe` — request validation

---

## 4. Frontend Modules (`apps/web`)

| Module | Responsibility |
|--------|---------------|
| `Auth` | Login/register forms, token refresh, route guards |
| `Workspace` | Workspace switcher, member list, settings |
| `Channel` | Channel list, create/join, member management |
| `Chat` | Message list, thread view, composer, reactions |
| `Search` | Global message search with filters |
| `Notifications` | Bell dropdown, mark read |

**State management:** React Query (server state) + Zustand (client state: auth, presence, draft messages).

**Real-time client:** Socket.io client with auto-reconnect and token refresh before expiry.

---

## 5. Database Responsibility (PostgreSQL)

**Single source of truth** for all persistent business data.

| Responsibility | Detail |
|---------------|--------|
| **Auth** | User credentials (bcrypt hash), refresh token hashes |
| **Identity** | User profiles, usernames, avatars |
| **Tenancy** | Workspaces, workspace memberships, channel memberships |
| **Messaging** | Messages, message edits, reactions, attachments metadata |
| **Invites** | Invite tokens (hashed), expiry, usage tracking |
| **Audit** | Append-only log of all mutations |
| **Notifications** | User notification queue |
| **Search** | `tsvector` GIN index on `Message.content` |

**Soft delete** is universal (except `AuditLog` and `ReadReceipt`). Partial unique indexes enforce uniqueness on active records only.

---

## 6. Redis Responsibility

**Ephemeral / cache / pub-sub layer.** Not a source of truth.

| Responsibility | Redis Data Structure | Detail |
|---------------|---------------------|--------|
| **Rate limiting** | String with TTL | Sliding window counters per user/IP |
| **Presence** | Set | `presence:workspace:<id>` and `presence:channel:<id>` |
| **Socket adapter** | Pub/Sub | Socket.io Redis adapter for horizontal scaling |
| **Typing indicators** | String with TTL | 3-second TTL per `(userId, channelId)` |
| **Refresh token blacklist** | Set | Revoked token hashes (short TTL, fallback to DB) |

---

## 7. WebSocket Responsibility

Socket.io 4 with Redis adapter.

| Responsibility | Detail |
|---------------|--------|
| **Auth** | Handshake JWT validation only; no session state |
| **Rooms** | `user:<id>`, `workspace:<id>`, `channel:<id>` |
| **Broadcasts** | Message events, channel events, presence events, typing |
| **Client events** | `message:read`, `typing:start/stop`, `channel:join/leave` |
| **No replay** | Missed events fetched via REST cursor pagination on reconnect |

---

## 8. File Upload Flow

1. Client requests presigned URL via `POST /attachments/presigned-url`
2. Server creates `Attachment` row (`messageId = null`), generates presigned URL
3. Client PUTs file directly to MinIO/S3
4. Client includes `attachmentIds` in `POST /channels/:channelId/messages`
5. Server links attachments to message on creation

**No multipart upload through the API.** Max file size enforced at presigned URL generation.

---

## 9. Search Flow

1. Client sends `GET /search/messages?query=...&workspaceId=...`
2. Server uses PostgreSQL `tsvector` GIN index on `Message.content`
3. Results ranked by `ts_rank`, cursor-paginated
4. **Search results are filtered to `CanAccessChannel`-approved channels only.** If `channelId` is provided, validate `CanAccessChannel(channelId)`. If `channelId` is omitted, search only across channels the user can read. Private channel override requires workspace `OWNER`/`ADMIN` and `AuditLog` action `channel:moderation_override_used`.

**No Elasticsearch / Algolia in MVP.** PostgreSQL full-text search is sufficient for MVP message volume.

---

## 10. Audit Flow

1. `AuditInterceptor` captures every mutating REST request
2. Writes to `AuditLog` table: actor, action, entity type, entity ID, metadata, IP, timestamp
3. **Append-only.** No updates, no deletes, no soft delete.
4. Readable only by workspace `OWNER` / `ADMIN` via `GET /workspaces/:workspaceId/audit-logs`

---

## 11. MVP Exclusions

| Feature | Reason | Post-MVP Path |
|---------|--------|---------------|
| **Email delivery (SMTP)** | Out of scope per `scope.md` §3 | Nodemailer / Resend integration |
| **OAuth / SSO** | MVP is local auth only | Passport strategies |
| **Voice / Video** | Not in original lets-chat | WebRTC integration |
| **Message forwarding** | Not in scope | Post-MVP REST endpoint + broadcast if needed |
| **Scheduled messages** | Not in scope | Cron + message queue |
| **Complex bidirectional pagination / reverse scroll optimization** | Deferred | Reverse infinite-scroll with `before` + `after` cursors |
| **Basic "load older messages" via `before` cursor** | — | MVP — cursor pagination supports `before` natively |
| **Message edit history UI** | Stored in DB, no UI | Diff renderer in frontend |
| **Server-side event replay** | Client fetches via REST on reconnect | Event buffer / message log |

---

## 12. Technology Matrix

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Backend Framework | NestJS | 11 |
| Language | TypeScript | 5.7+ |
| ORM | Prisma | 5.14+ |
| Database | PostgreSQL | 15 |
| Cache / PubSub | Redis | 7 |
| Real-Time | Socket.io | 4 |
| Frontend | Next.js + React | Next.js 16 + React 19 (App Router) |
| Styling | Tailwind CSS | 4 |
| Components | shadcn/ui | — |
| Object Storage | MinIO (dev) / S3 (prod) | — |
| Testing | Jest, Playwright | — |
