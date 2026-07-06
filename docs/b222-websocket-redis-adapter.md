# B222 — WebSocket Redis adapter and realtime scalability hardening

## Goal

Make LetsChat realtime infrastructure multi-instance ready without breaking the
existing single-instance Render deployment. When the API is scaled horizontally,
Socket.io rooms and events must be synchronized across nodes. B222 adds an
**optional** Redis adapter for Socket.io and exposes safe diagnostics about the
current adapter mode.

## Why a Redis adapter is needed

Socket.io keeps room membership and event routing in memory by default. With a
single API instance this works perfectly, but as soon as a second instance is
added, a user connected to instance A will not receive events emitted on
instance B. A Redis adapter uses a Redis pub/sub pair to share room state and
broadcast messages across all Socket.io nodes.

## Current production mode

Production runs on Render service `lets-chat-api-v2` as a single instance. When
`WEBSOCKET_REDIS_URL` is not set, the API continues to use the default in-memory
adapter and remains fully functional. No Redis instance is required for the
current deployment.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `WEBSOCKET_REDIS_URL` | No | Redis URI used for the Socket.io pub/sub adapter. If omitted, the API falls back to the in-memory adapter. |

`WEBSOCKET_REDIS_URL` is separate from `REDIS_URL` so that future rate-limiting
or caching Redis usage can be configured independently without affecting the
realtime layer.

Example:

```bash
WEBSOCKET_REDIS_URL=redis://localhost:6379
```

## Adapter behavior

| Mode | Trigger | Behavior |
|---|---|---|
| **memory** | `WEBSOCKET_REDIS_URL` is empty | Default Socket.io adapter. Single-instance only. |
| **redis** | `WEBSOCKET_REDIS_URL` is set and adapter creation succeeds | Socket.io Redis adapter is attached; events broadcast across all API instances sharing the same Redis. |
| **memory fallback** | `WEBSOCKET_REDIS_URL` is set but adapter creation/attachment fails | Logs a safe degraded warning and continues with the in-memory adapter so production stays online. |

## Lifecycle and safety

- Redis pub/sub clients are created lazily during service construction and are
  connected by the underlying `ioredis` driver as needed.
- Connection errors are caught and logged with **no URL, password, or username**.
- If the Redis adapter fails at any point, the API degrades to in-memory mode
  rather than crashing.
- Redis clients are closed on application shutdown via NestJS lifecycle hooks.

## Diagnostics integration

Admin diagnostics (`GET /admin/diagnostics/health` and `/checks`) now include a
`websocket` check:

```json
{
  "checks": {
    "websocket": {
      "status": "ok",
      "detail": "adapter:memory"
    }
  }
}
```

Possible status values:

- `ok` — adapter is healthy (memory or redis).
- `not_configured` — `WEBSOCKET_REDIS_URL` is missing; in-memory adapter is active.
- `degraded` — Redis URL was configured but the adapter could not be created or
  attached; fallback to memory is active.
- `error` — reserved for future connection-health checks.

The diagnostics response never contains the Redis URL, password, username, or
raw env values.

## Production verification

```bash
pnpm verify:prod:realtime
```

The verifier creates two disposable accounts, connects them via WebSocket,
verifies realtime delivery for channel, direct, and group messages, checks
channel typing events, and confirms that admin diagnostics does not leak Redis
configuration. If `VERIFY_ADMIN_ACCESS_TOKEN` is set, it also asserts that the
websocket adapter status is present in the diagnostics response.

## Files changed

- `apps/api/src/websocket/websocket-redis-adapter.service.ts` — new optional
  Redis adapter service.
- `apps/api/src/websocket/websocket-redis-adapter.service.spec.ts` — unit tests.
- `apps/api/src/websocket/websocket.gateway.ts` — attaches adapter in
  `afterInit`.
- `apps/api/src/websocket/websocket.module.ts` — exports adapter service.
- `apps/api/src/websocket/websocket.gateway.spec.ts` — updated mocks.
- `apps/api/src/admin-diagnostics/admin-diagnostics.service.ts` — adds websocket
  check.
- `apps/api/src/admin-diagnostics/admin-diagnostics.service.spec.ts` — updated
  tests.
- `apps/api/src/admin-diagnostics/admin-diagnostics.module.ts` — imports
  `WebsocketModule`.
- `apps/api/src/config/env.validation.ts` — adds `WEBSOCKET_REDIS_URL`.
- `.env.example` — documents `WEBSOCKET_REDIS_URL`.
- `package.json` — adds `verify:prod:realtime` script and root `socket.io-client`
  dependency.
- `scripts/verify-production-realtime.mjs` — new production verifier.
- `docs/b222-websocket-redis-adapter.md` — this document.
- `docs/project-status.md`, `docs/production-verification.md`, `README.md` —
  updated.

## Known limitations / future work

- The adapter status is based on creation/attachment success, not a continuous
  Redis connection health check. A future improvement could poll pub/sub
  connectivity and report `error`/`degraded` when the Redis link drops.
- Presence tracking (`PresenceService`) remains in-memory. For true horizontal
  scaling, presence state would also need to be shared across instances (for
  example via Redis or a presence-specific store).
- The production verifier runs against a single instance and therefore cannot
  validate cross-instance Redis broadcast without a second API instance.
