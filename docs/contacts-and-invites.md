# Contacts & Group Invite Links

This document describes the user-contacts and group-invite-link features added in **B214**.

---

## 1. Contacts

A contact is a private, one-way bookmark from one user to another. Contacts are personal: they are visible only to the owner, and adding or removing a contact does not notify the target user or modify any existing direct conversation.

### 1.1 Data Model

```prisma
model UserContact {
  id            String    @id @default(uuid()) @db.Uuid
  ownerUserId   String    @db.Uuid
  contactUserId String    @db.Uuid
  nickname      String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  owner   User @relation("ContactOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  contact User @relation("ContactTarget", fields: [contactUserId], references: [id], onDelete: Cascade)

  @@unique([ownerUserId, contactUserId])
  @@index([ownerUserId])
  @@index([contactUserId])
}
```

- Contacts are **soft-deleted**. Re-adding a previously removed contact restores the row.
- The unique constraint covers both active and deleted rows, so a given `(owner, contact)` pair has at most one record.
- No `nickname` uniqueness is enforced.

### 1.2 REST Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `GET /contacts` | GET | Bearer | List the current user's active contacts. |
| `POST /contacts` | POST | Bearer | Add a contact by `userId`, `email`, or `username`. |
| `DELETE /contacts/:contactUserId` | DELETE | Bearer | Soft-remove a contact. |
| `POST /contacts/:contactUserId/start-dm` | POST | Bearer | Start or return the existing DM with the contact. |

**Add contact request:**

```json
{
  "userId": "uuid",
  "nickname": "Work buddy"
}
```

**Add contact response:**

```json
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
```

### 1.3 Business Rules

- Adding yourself as a contact is rejected (`400`).
- Adding a non-existent user is rejected (`404`).
- Adding the same contact twice is idempotent (`201` both times; soft-deleted rows are restored).
- Listing contacts is strictly scoped to the authenticated owner.
- Removing a contact does not delete or affect any direct conversation.
- Starting a DM requires an active contact relationship and delegates to the existing direct-conversation creation logic.

### 1.4 Frontend

- New `/contacts` page with user search, add/remove actions, and a "Start DM" button.
- Sidebar includes a "Contacts" link between Groups and Workspaces.
- EN/UK/RU localization keys under `contacts.*` and `sidebar.contacts`.

---

## 2. Group Invite Links

Group invite links let a group owner invite people without knowing their `userId`. The owner generates a tokenized link, shares it, and anyone with the link can preview it and — once authenticated — join the group as a `MEMBER`.

### 2.1 Data Model

```prisma
model GroupInviteLink {
  id          String    @id @default(uuid()) @db.Uuid
  groupId     String    @db.Uuid
  tokenHash   String    @unique
  createdById String    @db.Uuid
  expiresAt   DateTime?
  revokedAt   DateTime?
  maxUses     Int?
  useCount    Int       @default(0)
  roleOnJoin  String    @default("MEMBER")
  createdAt   DateTime  @default(now())

  group     GroupConversation @relation(fields: [groupId], references: [id], onDelete: Cascade)
  createdBy User              @relation(fields: [createdById], references: [id], onDelete: Cascade)

  @@index([groupId])
  @@index([createdById])
}
```

- Only the **SHA-256 hash** of the raw token is stored. The raw token is returned once at creation and shown in the UI for copying.
- Links can be configured with an optional expiry (`expiresInHours`) and optional maximum uses (`maxUses`).
- Revocation sets `revokedAt`; it does not delete the row.

### 2.2 REST Endpoints

| Endpoint | Method | Auth | Permission | Description |
|---|---|---|---|---|
| `POST /groups/:groupId/invites` | POST | Bearer | Group OWNER | Create an invite link. |
| `GET /groups/:groupId/invites` | GET | Bearer | Group OWNER | List invite links for the group. |
| `DELETE /groups/:groupId/invites/:inviteId` | DELETE | Bearer | Group OWNER | Revoke an invite link. |
| `GET /group-invites/:token` | GET | No | Public | Preview invite validity and group name. |
| `POST /group-invites/:token/accept` | POST | Bearer | Authenticated | Join the group (idempotent for existing members). |

**Create invite request:**

```json
{
  "expiresInHours": 24,
  "maxUses": 10
}
```

**Create invite response:**

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

**Preview response:**

```json
{
  "groupName": "Weekend trip",
  "expiresAt": "2026-06-25T12:00:00Z",
  "valid": true
}
```

### 2.3 Business Rules

- Only the group owner can create, list, or revoke invite links.
- Creating an invite for an archived group is rejected (`404`).
- Accepting a revoked, expired, max-used, or archived-group invite is rejected (`410` or `404`).
- Accepting is idempotent: an existing group member who clicks the link again simply receives the group details; the use counter is not incremented.
- Accepting adds the user as a `MEMBER` and broadcasts `group:conversation:updated` to existing members.

### 2.4 Security Notes

- Raw tokens are 256 bits of entropy (`crypto.randomBytes(32).toString('hex')`).
- Stored token hashes make database leaks useless to attackers who do not also have the raw token.
- Preview endpoint is public but returns only the group name, expiry, and validity flag.
- All mutating invite actions require group ownership.

### 2.5 Frontend

- `GroupSettingsModal` now has an invite-link section (owner only) for creating, copying, revoking, and listing links.
- New `/group-invites/[token]` page handles public preview and authenticated acceptance, including expired/revoked/unauthenticated states.
- EN/UK/RU localization keys under `groupInvites.*` and `groupInvite.*`.

---

## 3. Production Verification

Run the dedicated verifier against production:

```bash
pnpm verify:prod:contacts
```

It exercises:

- Add/list/remove contacts and privacy isolation.
- Self-add rejection and non-existent-user rejection.
- Start DM from a contact.
- Owner-only group invite link creation/revocation.
- Public invite preview.
- Joining a group via invite link.
- Revoked-invite rejection.

---

## 4. Testing

- **API service tests:** `apps/api/src/contacts/contacts.service.spec.ts` (10 tests) and `apps/api/src/groups/group-invites.service.spec.ts` (13 tests).
- **API E2E tests:** `apps/api/test/contacts.e2e-spec.ts` (11 tests) and `apps/api/test/group-invites.e2e-spec.ts` (12 tests).
- **Frontend tests:** contacts and group-invite UI logic is covered by existing web unit/page tests; no new page tests were added for B214.
