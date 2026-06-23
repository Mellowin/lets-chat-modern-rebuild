# B211 — Push Notifications Foundation

## Overview

Web Push notifications for new direct messages and channel messages. Users opt-in from **Profile → Notifications**. The implementation uses the Web Push protocol with VAPID keys; no FCM, no auto-permission prompts, and no reaction/mention notifications in this scope.

## What triggers a push

- A new message is sent to a **channel** — every channel member except the sender receives a notification.
- A new message is sent to a **direct conversation** — the other participant receives a notification.
- The sender never receives a push for their own message.
- Push delivery is **best-effort**; a failure does not break message sending.

## Backend

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET`  | `/api/v1/push/vapid-public-key` | No | Returns the VAPID public key needed to subscribe. |
| `POST` | `/api/v1/push/subscribe` | Yes | Saves a push subscription for the current user. |
| `GET`  | `/api/v1/push/subscriptions` | Yes | Lists current user’s subscriptions (safe fields only). |
| `POST` | `/api/v1/push/unsubscribe` | Yes | Removes a push subscription by endpoint. |
| `DELETE` | `/api/v1/push/unsubscribe` | Yes | Alias for `POST /push/unsubscribe`. |

### Prisma model

```prisma
model PushSubscription {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  endpoint  String
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, endpoint])
  @@index([userId])
}
```

### Environment variables

| Variable | Required for push | Description |
|----------|-------------------|-------------|
| `VAPID_PUBLIC_KEY` | Yes | Public VAPID key (safe to expose) used by the API. |
| `VAPID_PRIVATE_KEY` | Yes | Private VAPID key (keep secret). |
| `VAPID_SUBJECT` | Recommended | `mailto:` or `https:` contact URL for the push service. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Recommended | Same public key exposed to the frontend build. If set, the browser uses it directly instead of fetching from the API. |

Generate keys locally:

```bash
pnpm --filter api push:generate-vapid-keys
```

Then add them to `.env` and to the production host environment (Render dashboard). Also set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in Vercel.

### Missing VAPID environment variables

The API starts normally and message sending continues to work even if VAPID keys are not configured. Push notifications are simply skipped with a warning log. Real production push requires all VAPID variables to be set.

### Cleaning up expired subscriptions

The service automatically deletes subscriptions that return HTTP `410 Gone` or `404 Not Found` during send attempts.

## Frontend

- Service worker: `apps/web/public/service-worker.js`
- Push helpers: `apps/web/src/lib/push-subscription.ts`
- Push API client: `apps/web/src/lib/push-api.ts`
- UI: `apps/web/src/app/profile/PushNotificationsSection.tsx`

### User flow

1. Open **Profile → Notifications**.
2. Click **Enable notifications**.
3. Browser native permission prompt appears (only on user gesture).
4. If granted, the browser subscribes to the push service using the VAPID public key and sends the subscription to the backend.
5. A **Disable notifications** button is shown while the subscription is active.

Unsupported browsers and blocked permissions show explanatory messages; there is no automatic re-prompt.

## Notification payload

Payloads never include attachment URLs, tokens, or full message metadata:

```json
{
  "title": "Alice in #general",
  "body": "Hello everyone",
  "icon": "/icon.svg",
  "badge": "/icon.svg",
  "data": {
    "type": "channel_message",
    "workspaceId": "...",
    "channelId": "...",
    "messageId": "..."
  }
}
```

Clicking the notification focuses an existing tab or opens the app root (`/`).

## Tests

- API: `apps/api/src/push/push.service.spec.ts` — VAPID init, subscribe/unsubscribe, channel and DM notification routing, expired subscription cleanup.
- Web: `apps/web/src/app/profile/PushNotificationsSection.test.tsx` — unsupported state, blocked state, subscribe/unsubscribe flow, error display.
- Existing message/direct-conversation service tests updated to provide a `PushService` mock.

## Production verification

A small configuration verifier is included:

```bash
API_URL=https://lets-chat-api-v2.onrender.com/api/v1 \
VAPID_PUBLIC_KEY=... \
VAPID_PRIVATE_KEY=... \
VAPID_SUBJECT=... \
pnpm verify:push:config
```

It checks that the VAPID keys are present and that the public key returned by the API matches `VAPID_PUBLIC_KEY`.

## Production checklist

- [ ] Run `pnpm --filter api push:generate-vapid-keys` and store both keys securely.
- [ ] Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to the Render service environment.
- [ ] Ensure the migration `20260623180000_add_push_subscriptions` is deployed before the API code that references `PushSubscription`.
- [ ] Confirm `GET /api/v1/push/vapid-public-key` returns the public key.
- [ ] From a supported browser, opt-in via Profile → Notifications and send a DM/channel message from another account.
