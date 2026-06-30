# Safety & Blocking (B215)

## Goal

Add a user-controlled safety baseline for blocking and reporting. This is a deliberate MVP scope: users can block each other, report abuse, and the platform enforces those blocks at the most common abuse boundaries. It does **not** include admin dashboards, AI moderation, phone blocking, public profiles, or upload limits.

## What is implemented

### Backend

- **Prisma models** — `UserBlock` and `UserReport` in `packages/database/prisma/schema.prisma`.
- **Safety module** — `apps/api/src/safety/`:
  - `BlocksService`, `BlocksRepository`, `BlocksController`
  - `ReportsService`, `ReportsRepository`, `ReportsController`
  - DTOs: `CreateBlockDto`, `CreateReportDto`
- **REST endpoints**
  - `GET /api/v1/blocks` — list users the current user has blocked
  - `POST /api/v1/blocks` — block a user (idempotent; soft-deletes/reactivates existing block)
  - `DELETE /api/v1/blocks/:blockedUserId` — unblock a user
  - `POST /api/v1/reports` — submit a report (write-only)

### Block semantics

- **Bidirectional safety:** an active block in **either direction** prevents:
  - creating a new direct conversation between the two users
  - sending new messages in an existing direct conversation
  - adding either user as a contact
  - an owner from adding the blocked user to a group via targeted member add
- **Existing shared groups are left intact.** Members who have blocked each other can stay in the same group, but push notifications from a blocked sender are suppressed for the blocker.
- **Soft delete:** unblocking sets `deletedAt`; the active unique constraint ignores soft-deleted rows, so a later re-block creates a fresh record.
- **Privacy:** block state is never exposed with a "you are blocked" message. The API returns generic `403 Forbidden` / `404 NotFound` responses.

### Report semantics

- Reports are **write-only** and **non-actioning** in B215.
- They do not auto-block, auto-delete content, or expose the reporter identity.
- A report records: reporter, reported user, optional message/conversation/group context, reason, details, and an `OPEN` status.

### Domain integration

| Flow | Enforcement |
|------|-------------|
| `DirectConversationsService.create` | `requireNoBlockInEitherDirection` |
| `DirectConversationsService.createMessage` | `requireNoBlockInEitherDirection` with the other participant |
| `ContactsService.create` | `requireNoBlockInEitherDirection` |
| `ContactsService.list` | filters out users the current user has blocked |
| `GroupsService.addMember` | `requireNoBlockInEitherDirection` between owner and target |
| `PushService.notifyDirectMessage` | skips recipients who have blocked the sender or are blocked by the sender |
| `PushService.notifyGroupMessage` | skips recipients who have blocked the sender or are blocked by the sender |
| `PushService.notifyChannelMessage` | skips recipients who have blocked the sender or are blocked by the sender |

### Frontend

- **API client** — `apps/web/src/lib/safety-api.ts`:
  - `listBlockedUsers`, `blockUser`, `unblockUser`, `submitReport`
- **Blocked users page** — `/blocked` lists active blocks with unblock confirmation.
- **Profile safety tab** — Profile → Safety links to `/blocked`.
- **Block/report actions** added to:
  - `/contacts` contact cards and search results
  - Direct conversation header (`/direct/[conversationId]`)
  - Group member list in `GroupSettingsModal`
- **Report modal** — `apps/web/src/components/ReportModal.tsx` for reason + details.
- **Block button** — `apps/web/src/components/BlockUserButton.tsx` with confirmation.
- **Error localization** — block-related backend errors map to `safety.actionBlocked` in `apps/web/src/lib/api-errors.ts`.
- **Localization** — EN/UK/RU keys under `safety.*`, `direct.block`, `contacts.block`, `groups.block`, etc.

## Migration

`20260624190000_add_blocks_and_reports` adds `UserBlock`, `UserReport`, and the `ReportStatus` enum. It was created with `--create-only` because the local Docker PostgreSQL is not running; CI applies it in the `Migrate production database` job.

## Tests

- **API unit tests** updated for the new `BlocksService` dependency:
  - `apps/api/src/direct-conversations/direct-conversations.service.spec.ts`
  - `apps/api/src/contacts/contacts.service.spec.ts`
  - `apps/api/src/groups/groups.service.spec.ts`
  - `apps/api/src/push/push.service.spec.ts`
- **API E2E tests** — `apps/api/test/safety.e2e-spec.ts` covering:
  - block/unblock lifecycle and idempotency
  - self-block rejection
  - block prevents new DMs in both directions
  - block prevents messages in existing DMs
  - block prevents contact adds in both directions
  - block prevents targeted group member adds in both directions
  - report creation, self-report rejection, missing-reason rejection
- **Production verifier** — `scripts/verify-production-safety.mjs` creates disposable accounts and exercises the same flows against production.

## Out of scope

- Admin dashboard for reviewing reports
- Automatic moderation or actioning from reports
- Phone number / email blocking
- Public user profiles
- Attachment upload limits or file-type blocking
- Muting or temporary suspensions

## Privacy & safety notes

- Block state is hidden from the blocked user to reduce retaliation.
- Reports do not expose the reporter identity through the API.
- Push notification payloads continue to contain no message content, no file URLs, and no secrets; a blocked sender simply does not trigger a push for the blocker.
