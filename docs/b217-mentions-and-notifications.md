# B217 — Mentions and Notification Preferences

## Overview

Users can now mention other members with `@username` in channel, group, and direct
messages. Only mentions of accessible members are resolved server-side; invalid or
inaccessible usernames are silently ignored to avoid leaking user existence.

Notification preferences let each user control which kinds of push notifications
they receive.

## Mention resolution

- `MENTION_REGEX = /@([a-zA-Z0-9_]+)/g` extracts `@username` tokens.
- `MentionsService.resolveMentions(content, allowedUserIds)` queries users by
  username and keeps only those whose IDs are in the allowed set.
- Allowed sets are produced by conversation membership:
  - Direct: `DirectConversationsRepository.findMentionableUserIds(conversationId, currentUserId)`
  - Group: `GroupsRepository.findMentionableUserIds(groupId)`
  - Channel: `ChannelsRepository.findMentionableUserIds(channelId)`
- Mention metadata is persisted on the message as:
  ```json
  [{ "userId": "uuid", "username": "alice" }]
  ```
- The author is not filtered out: self-mentions resolve and render, but the push
  service skips the author when sending mention notifications.

## API endpoints

### Notification preferences

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/auth/me/notification-preferences` | Get current preferences |
| `PATCH`| `/auth/me/notification-preferences` | Update one or more preferences |

Request body for `PATCH` supports any subset of:

```json
{
  "pushNotificationsEnabled": true,
  "mentionNotificationsEnabled": true,
  "directMessageNotificationsEnabled": true,
  "groupMessageNotificationsEnabled": true,
  "channelMessageNotificationsEnabled": true
}
```

### Mentioned messages

Mentions are returned in message objects from:

- `POST /direct-conversations/:conversationId/messages`
- `POST /groups/:groupId/messages`
- `POST /workspaces/:workspaceId/channels/:channelId/messages`
- Corresponding `GET` list endpoints

## Push notification preferences

`PushService` checks the following before sending a regular message push:

- `pushNotificationsEnabled`
- The conversation-type preference (`directMessageNotificationsEnabled`,
  `groupMessageNotificationsEnabled`, or `channelMessageNotificationsEnabled`)
- Blocking rules from B215

For channel mentions, `PushService.notifyChannelMention` additionally checks:

- `mentionNotificationsEnabled`
- Blocking rules from B215

## Frontend

- `MessageContent` renders `@username` tokens with a highlight when the username
  appears in the message's resolved `mentions` array.
- `NotificationPreferencesSection` on the Profile page loads and toggles each
  preference independently.
- Preferences are exposed on `AuthUser` and included in `auth-api.ts`.

## Verification

```bash
node scripts/verify-production-mentions.mjs
```

The script creates two disposable accounts, exercises the preference endpoints,
and posts messages in a direct conversation and a group to confirm that
accessible mentions resolve and inaccessible mentions do not.

## Tests

- API unit: `apps/api/src/auth/auth.controller.spec.ts`,
  `apps/api/src/common/mentions.spec.ts`, service specs for messages/groups/direct
  conversations, and push service specs.
- Web: `apps/web/src/components/MessageContent.test.tsx`,
  `apps/web/src/app/profile/NotificationPreferencesSection.test.tsx`, and updated
  auth/profile test fixtures.
