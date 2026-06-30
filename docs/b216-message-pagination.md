# B216 — Cursor-based Message Pagination

## Overview

Message lists for channels, direct conversations, and groups moved from
returning a plain array to a stable cursor-paginated response. This prevents
skipped or duplicated messages when new real-time messages arrive while the
user is scrolling back in history.

## Scope

- Channel messages: `GET /workspaces/:workspaceId/channels/:channelId/messages`
- Direct messages: `GET /direct-conversations/:conversationId/messages`
- Group messages: `GET /groups/:groupId/messages`

## Response shape

```json
{
  "items": [ /* message objects, oldest-first within the page */ ],
  "nextCursor": "2026-06-30T12:00:00.000Z:msg-id",
  "hasMore": true
}
```

## Cursor design

- Encoded as `createdAt:messageId` using ISO 8601 UTC.
- Stable composite ordering on `(createdAt, id)`.
- `nextCursor` always refers to the **oldest message in the current page**,
  so the next request loads messages strictly older than it.
- Repositories query with `ORDER BY createdAt DESC, id DESC` and `TAKE limit + 1`.
  The service trims the extra row, reverses the page to oldest-first, and
  derives `nextCursor` from `page[0]`.

## Query parameters

| Param   | Default | Max | Description                          |
|---------|---------|-----|--------------------------------------|
| `limit` | 50      | 100 | Messages per page                    |
| `cursor`| —       | —   | Cursor from a previous `nextCursor`  |

## Frontend behavior

- Initial load fetches the most recent page and stores `nextCursor`/`hasMore`.
- A "Load older messages" button at the top of the list requests the next
  cursor page and prepends returned items to the existing list.
- Real-time socket messages still append at the bottom and are deduplicated
  by `id`.
- Scroll position is preserved when older messages are prepended.

## Database indexes

```sql
CREATE INDEX "Message_channelId_createdAt_id_idx"
  ON "Message"("channelId", "createdAt", "id");
CREATE INDEX "DirectMessage_conversationId_createdAt_id_idx"
  ON "DirectMessage"("conversationId", "createdAt", "id");
CREATE INDEX "GroupMessage_groupId_createdAt_id_idx"
  ON "GroupMessage"("groupId", "createdAt", "id");
```

## Verification

```bash
pnpm verify:prod:pagination
```

The script creates disposable accounts, a workspace, a public channel, and a
group, posts test messages, and walks through pages to confirm the shape and
stable cursors.

## Tests

- Unit: `apps/api/src/common/cursor-pagination.spec.ts`
- Service specs: `messages.service`, `direct-conversations.service`, `groups.service`
- E2E: `channels.e2e-spec.ts`, `groups.e2e-spec.ts`
