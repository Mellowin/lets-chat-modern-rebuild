# B221 — Search Result Deep-Link and Message Highlight

## Overview

Clicking a search result now opens the exact conversation and scrolls to the
matching message with a temporary highlight. This closes the gap between search
and message location across channels, direct conversations, and groups.

## Scope

- Channel messages: `GET /workspaces/:workspaceId/channels/:channelId/messages/:messageId/context`
- Direct messages: `GET /direct-conversations/:conversationId/messages/:messageId/context`
- Group messages: `GET /groups/:groupId/messages/:messageId/context`

Frontend routes that honor the `?message=<id>` query parameter:

- `/workspaces/:workspaceId/channels/:channelId?message=<id>`
- `/direct/:conversationId?message=<id>`
- `/groups/:groupId?message=<id>`

## Response shape

```json
{
  "target": { /* message object */ },
  "before": [ /* up to `before` older messages, oldest-first */ ],
  "after": [ /* up to `after` newer messages, oldest-first */ ],
  "hasMoreBefore": true,
  "hasMoreAfter": true
}
```

## Query parameters

| Param    | Default | Max | Description                                   |
|----------|---------|-----|-----------------------------------------------|
| `before` | 20      | 50  | Messages to load before the target            |
| `after`  | 20      | 50  | Messages to load after the target             |

## Permission model

- **Channel**: workspace member + channel member; otherwise `404`.
- **Direct conversation**: conversation participant; otherwise `403`.
- **Group**: active group member; otherwise `404`.

The endpoints return `404` for messages that do not exist or do not belong to
the requested conversation/group to avoid leaking existence.

## Frontend behavior

1. On page load the `?message=<id>` parameter is read.
2. If the message is already loaded, the list scrolls to it.
3. If the message is not loaded, the frontend calls the context endpoint,
   replaces the visible message list with the returned window
   (`before + target + after`), and scrolls to the target.
4. The target row receives a temporary highlight (ring + tinted background)
   for 1.8 seconds.
5. A "Back to latest" button exits context mode and restores the normal
   latest-messages view.

## Backend implementation

Repositories added `findMessageByIdWithRelations`, `findContextBefore`, and
`findContextAfter` helpers for direct and group messages, mirroring the
existing channel implementation. Services perform the same access checks as
list endpoints, exclude deleted direct messages, cap `before`/`after` at 50,
and compute `hasMoreBefore`/`hasMoreAfter` using `limit + 1` queries.

## Verification

```bash
pnpm verify:prod:message-jump
```

The script creates disposable accounts, a workspace, a channel, a direct
conversation, and a group, posts enough filler messages to push targets out of
the latest page, and verifies that each context endpoint returns the target
plus surrounding messages while enforcing permission boundaries.

## Tests

- Unit: `apps/api/src/direct-conversations/direct-conversations.service.spec.ts`
- Unit: `apps/api/src/groups/groups.service.spec.ts`
- Production verifier: `scripts/verify-production-message-jump.mjs`
