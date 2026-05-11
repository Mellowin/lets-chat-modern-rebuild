# Decision Registry

> **Purpose:** Append-only log of architectural decisions made during Phase 1.  
> **Rule:** If a decision is here, it is locked. Changing it requires ADR approval.  
> **Date:** 2026-05-11

---

## D1. Invite System — Generic Link with Optional Email Binding

**Context:** `scope.md` §2.2 says "Invite by email, join via link". Email delivery is excluded from MVP (`scope.md` §3).

**Decision:**
- MVP uses **token-based invite links** (no SMTP).
- `Invitation` table has optional `invitedEmail` field.
- If `invitedEmail` is set — token is bound to that email; user must register/login with matching email to accept.
- If `invitedEmail` is null — generic token; anyone with the link can join.
- Admin copies the generated link and shares it manually (Slack, Teams, etc.).
- Rationale: No SMTP setup, but preserves ability to bind invite to specific person when needed.

**Consequences:**
- No Nodemailer/Resend/SendGrid in MVP.
- Frontend needs "Copy invite link" button.
- `invitedEmail` must be checked at accept time.

---

## D2. Soft Delete + Unique Constraints — Partial Indexes

**Context:** Prisma `@@unique` does not respect soft deletes. Re-joining a workspace/channel or re-adding a reaction after soft-delete would fail.

**Decision:**
- Remove `@@unique` on soft-deletable junction tables from Prisma schema.
- Replace with `@@index` + PostgreSQL **partial unique index** in raw migration:
  ```sql
  CREATE UNIQUE INDEX idx_workspace_member_active ON "WorkspaceMember" ("workspaceId", "userId") WHERE "deletedAt" IS NULL;
  CREATE UNIQUE INDEX idx_channel_member_active ON "ChannelMember" ("channelId", "userId") WHERE "deletedAt" IS NULL;
  CREATE UNIQUE INDEX idx_reaction_active ON "Reaction" ("messageId", "userId", "emoji") WHERE "deletedAt" IS NULL;
  ```
- App layer additionally checks before insert (defence in depth).

**Consequences:**
- Raw SQL required in migrations.
- Prisma Client will not type-check these uniques; app layer must handle conflicts.

---

## D3. User Email — Case-Insensitive Unique

**Context:** PostgreSQL `String @unique` is case-sensitive. `User@Example.com` and `user@example.com` would be different rows.

**Decision:**
- Remove `@unique` from `User.email` in Prisma schema.
- Add `@index([email])` for query performance.
- Add raw migration: `CREATE UNIQUE INDEX idx_user_email_lower ON "User" (LOWER(email));`
- App layer always lowercases email before insert and lookup.

**Consequences:**
- One raw migration line.
- All auth/register/invite code must call `email.toLowerCase()`.

---

## D4. Thread Depth — One Level Only, App Layer

**Context:** MVP threads are flat replies. `Message.parentId` self-reference could allow nested replies (reply to reply).

**Decision:**
- Only messages with `parentId IS NULL` can be parents.
- Enforced in **service layer**, not DB CHECK (CHECK cannot reference other rows in PostgreSQL).
- Optional: DB trigger if needed, but service-layer validation is sufficient for MVP.

**Consequences:**
- UI must not show "Reply in thread" button on thread replies.
- `message:create` service rejects `parentId` pointing to a message that already has `parentId !== NULL`.

---

## D5. ReadReceipt — No Soft Delete

**Context:** `scope.md` §4.1 says "Soft delete via deletedAt on ALL entities".

**Decision:**
- `ReadReceipt` is an event/fact, not a business entity.
- No `deletedAt` on `ReadReceipt`.
- If a user "unreads" a message — delete the row (hard delete) or update `readAt`. For MVP: row stays, no unread action.

**Consequences:**
- Consistent with audit-trail nature of read receipts.
- Simpler queries.

---

## D6. Channel Slug and Type Immutability — Locked in MVP

**Context:** `scope.md` does not specify whether channel `type` (PUBLIC/PRIVATE) or `slug` can change after creation.

**Decision:**
- Both `type` and `slug` are **immutable in MVP**.
- Rationale: changing `type` requires participant reconciliation (public→private would need explicit member list); changing `slug` breaks permalinks.
- Schema does not enforce immutability at DB level; API layer rejects `PATCH` mutations on these fields.
- Post-MVP: type mutability may be allowed with audit log entry and automatic participant reconciliation.

**Consequences:**
- `PATCH /channels/:id` silently ignores `type` and `slug` (or returns 422 if explicitly provided).
- Simpler API surface.

---

## D7. Username Required for Mentions

**Context:** `scope.md` §2.4 requires `@username` mentions. Legacy lets-chat had `username` field.

**Decision:**
- Add `username String @unique` to `User` model.
- Used for mentions and optional login (email remains primary).
- Regex: `/^[a-zA-Z0-9_-]+$/`.
- Required at registration.

**Consequences:**
- One additional field in User.
- Mention parser looks for `@username` pattern.

---

## D8. Backward Pagination — Deferred

**Context:** Cursor pagination supports `nextCursor` (forward) only. Some UIs may want "load previous messages" (backward).

**Decision:**
- Backward pagination (reverse cursor) is **deferred to post-MVP**.
- For thread/reply views, clients use standard forward pagination with `from`/`to` date filters if needed.

**Consequences:**
- One-directional cursor pagination is simpler to implement.
- "Load older messages" can be simulated by changing sort order or using date filters.
