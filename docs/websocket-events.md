# WebSocket Events Specification

> **Transport:** Socket.io 4.x  
> **Adapter:** Redis (horizontal scaling)  
> **Auth:** JWT access token in handshake  
> **Date:** 2026-05-11  
> **Status:** Complete — all parts populated and cross-referenced.  

---

## 1. Overview & Principles

1. **WebSocket is for real-time delivery only.** It is not the primary API transport. All CRUD operations go through REST (`/api/v1/…`). WebSocket broadcasts the result.
2. **Auth is stateless.** No server-side socket sessions. Identity is established once at handshake via JWT and cached on the socket object.
3. **Permission checks happen per-event.** Connection establishment only validates the JWT signature/expiry. Channel/workspace access is verified inside each event handler (see `permissions.md` §5.2).
4. **Rooms = Socket.io rooms = channels.** A user joins a Socket.io room named after the `channelId`. Broadcasts are scoped to that room.
5. **No token in query string.** Legacy `?token=…` pattern is excluded. Token travels in `auth` handshake payload.

---

## 2. Part 1 — Connection & Authentication

### 2.1 Handshake

Client initiates connection with the access token obtained from `/api/v1/auth/login` or `/api/v1/auth/refresh`.

```typescript
const socket = io('wss://api.example.com', {
  auth: {
    token: '<access_token>'  // 15-minute JWT
  },
  transports: ['websocket']
});
```

**Server validation flow (NestJS Gateway):**

```typescript
@WebSocketGateway({ namespace: 'events' })
class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    const payload = await this.authService.verifyAccessToken(token);

    if (!payload) {
      client.emit('error:auth', { code: 'INVALID_TOKEN', message: 'Token invalid or expired' });
      client.disconnect(true);
      return;
    }

    // Attach user identity to socket for use in event handlers
    client.data.userId = payload.sub;
    client.data.workspaceIds = payload.workspaceIds; // array of workspace IDs

    // Join user's personal room for direct notifications
    client.join(`user:${payload.sub}`);
  }

  handleDisconnect(client: Socket) {
    // Cleanup is handled by presence service (see Part 4)
    client.data.userId && this.presenceService.setOffline(client.data.userId);
  }
}
```

**Error: missing token**

```json
// Server → Client
{
  "event": "error:auth",
  "data": {
    "code": "MISSING_TOKEN",
    "message": "Auth token required in handshake"
  }
}
```

**Error: invalid/expired token**

```json
// Server → Client
{
  "event": "error:auth",
  "data": {
    "code": "INVALID_TOKEN",
    "message": "Token invalid or expired"
  }
}
```

### 2.2 Connection Lifecycle

| Phase | Client Action | Server Action |
|-------|---------------|---------------|
| **Connect** | `io.connect()` with `auth.token` | Validate JWT, attach `userId`, join `user:<id>` room |
| **Join workspace** | Emit `workspace:subscribe` | Validate membership, join `workspace:<id>` room |
| **Join channel** | Emit `channel:join` | Validate `CanAccessChannel`, join `channel:<id>` room |
| **Activity** | Send/receive events | Enforce rate limits per user (Redis sliding window) |
| **Disconnect** | Close tab / `socket.disconnect()` | Leave all rooms, update presence to offline |
| **Reconnect** | Auto-reconnect with fresh token | Re-validate, re-join previously subscribed channels |

**Reconnect strategy:**
- Client stores `lastChannelIds` in memory.
- On reconnect with fresh token, client emits `channel:join` for each channel again.
- Server re-validates access on every join (no server-side "remember my rooms").

### 2.3 Token Expiration Strategy

Access tokens live **15 minutes**. Socket connections are long-lived. Disconnecting every 15 minutes destroys UX.

**MVP approach (simplest):**

1. Client proactively refreshes the access token via HTTP `POST /api/v1/auth/refresh` **before expiry** (e.g., every 10 minutes).
2. Client updates `socket.auth.token` and reconnects if necessary (Socket.io v4 allows `auth` update via `socket.auth = { token: newToken }` then `socket.connect()`).
3. If the server receives an event with an expired token (race condition), it emits `auth:expired` and disconnects the client.

```typescript
// Server → Client
socket.emit('auth:expired', {
  code: 'TOKEN_EXPIRED',
  message: 'Access token expired. Refresh and reconnect.'
});
socket.disconnect(true);
```

```typescript
// Client handling
socket.on('auth:expired', () => {
  authService.refresh().then(newToken => {
    socket.auth = { token: newToken };
    socket.connect();
  });
});
```

**No "socket session extension" in MVP.** Refresh token stays in HTTP-only cookie; WebSocket layer never touches it.

### 2.4 Auth Events Summary (Part 1)

| Event | Direction | Payload | When |
|-------|-----------|---------|------|
| `error:auth` | Server → Client | `{ code, message }` | Handshake failed (invalid/missing token) |
| `auth:expired` | Server → Client | `{ code, message }` | Token expired during active connection |
| `workspace:subscribe` | Client → Server | `{ workspaceId }` | After connect; user wants workspace updates |

---

## 3. Part 2 — Channel & Workspace Events

### 3.1 Channel Join

Client requests to join a channel room. Server validates access **before** allowing the socket to enter the Socket.io room.

```typescript
// Client → Server
socket.emit('channel:join', { channelId: 'uuid' });

// Server → Client (success)
socket.emit('channel:joined', {
  channel: {
    id: 'uuid',
    name: 'general',
    slug: 'general',
    type: 'PUBLIC'
  }
});

// Server → Client (failure)
socket.emit('error:channel', {
  code: 'FORBIDDEN',
  message: 'You do not have access to this channel'
});
```

**Access rules (from `permissions.md`):**
- **Public channel:** any workspace member can join (`IsWorkspaceMember`).
- **Private channel:** explicit `ChannelMember` record required (`IsChannelMember`).
- **Moderation override:** workspace `OWNER` / `ADMIN` can join any channel. Usage is audit-logged (`action: channel:moderation_override_used`).

**Broadcast on successful join:**

```typescript
// Server → channel room users (including joiner)
io.to('channel:uuid').emit('channel:user_joined', {
  userId: 'user-uuid',
  channelId: 'channel-uuid'
});
```

### 3.2 Channel Leave

```typescript
// Client → Server
socket.emit('channel:leave', { channelId: 'uuid' });

// Server → Client (ack)
socket.emit('channel:left', { channelId: 'uuid' });

// Server → remaining channel room users
io.to('channel:uuid').emit('channel:user_left', {
  userId: 'user-uuid',
  channelId: 'channel-uuid'
});
```

### 3.3 Channel Update & Archive (Broadcasts)

Channel mutations are performed via REST (see `api-design.md`). WebSocket only broadcasts the outcome.

```typescript
// Broadcast after successful REST PATCH /api/v1/channels/:id
io.to('channel:uuid').emit('channel:updated', {
  channel: { id, name, slug, description }
});

// Broadcast after successful REST DELETE (soft archive)
io.to('channel:uuid').emit('channel:archived', {
  channelId: 'uuid'
});
```

**Permission:** only channel `OWNER` / `ADMIN` (or workspace `OWNER` / `ADMIN`) can trigger the REST mutation that causes this broadcast.

### 3.4 Workspace Subscribe

After connection, the client subscribes to workspace-wide events (member list changes, new invites accepted).

```typescript
// Client → Server
socket.emit('workspace:subscribe', { workspaceId: 'uuid' });

// Server validates workspace membership
// Server → Client
socket.emit('workspace:subscribed', { workspaceId: 'uuid' });

// Broadcast when a new member joins the workspace
io.to('workspace:uuid').emit('workspace:member_joined', {
  userId: 'new-user-uuid',
  role: 'MEMBER'
});

// Broadcast when a member leaves or is removed
io.to('workspace:uuid').emit('workspace:member_left', {
  userId: 'user-uuid'
});
```

### 3.5 Room Scoping & Privacy

Socket.io rooms are named after entities:

| Room Name | Who joins | Visibility |
|-----------|-----------|------------|
| `user:<id>` | User's own socket | Direct notifications |
| `workspace:<id>` | All workspace members | Workspace-wide events |
| `channel:<id>` | Users allowed by `CanAccessChannel` | Channel messages, typing, presence |
| | | *Public channel* = active `WorkspaceMember`; |
| | | *Private channel* = explicit `ChannelMember`; |
| | | *Moderation override* = workspace `OWNER`/`ADMIN` (audit-logged). |

**Critical rule:** for private channels, `io.to('channel:<id>')` must never emit to users who are not explicit `ChannelMember`, except workspace `OWNER`/`ADMIN` moderation override (audit-logged as `channel:moderation_override_used`). Server tracks room membership via `socket.rooms`; manual broadcast loops are forbidden.

### 3.6 Events Summary (Part 2)

| Event | Direction | Payload | Permission Gate |
|-------|-----------|---------|-----------------|
| `channel:join` | Client → Server | `{ channelId }` | `CanAccessChannel` |
| `channel:joined` | Server → Client | `{ channel }` | — |
| `channel:leave` | Client → Server | `{ channelId }` | Currently joined channel room |
| `channel:left` | Server → Client | `{ channelId }` | — |
| `channel:user_joined` | Server → broadcast | `{ userId, channelId }` | CanAccessChannel-approved room |
| `channel:user_left` | Server → broadcast | `{ userId, channelId }` | CanAccessChannel-approved room |
| `channel:updated` | Server → broadcast | `{ channel }` | CanAccessChannel-approved room |
| `channel:archived` | Server → broadcast | `{ channelId }` | CanAccessChannel-approved room |
| `workspace:subscribe` | Client → Server | `{ workspaceId }` | `IsWorkspaceMember` |
| `workspace:subscribed` | Server → Client | `{ workspaceId }` | — |
| `workspace:member_joined` | Server → broadcast | `{ userId, role }` | Workspace members |
| `workspace:member_left` | Server → broadcast | `{ userId }` | Workspace members |

---

## 4. Part 3 — Message, Thread, Reaction & Typing Events

### 4.1 Message Created (Broadcast)

After a successful REST `POST /api/v1/channels/:channelId/messages`, the server broadcasts the new message to the channel room.

```typescript
// Server → channel room users
io.to('channel:uuid').emit('message:created', {
  message: {
    id: 'msg-uuid',
    channelId: 'channel-uuid',
    authorId: 'user-uuid',
    content: 'Hello team',
    parentId: null,
    createdAt: '2026-05-11T12:00:00Z',
    attachments: [{ id, filename, url }]
  }
});
```

**REST trigger:** `POST /api/v1/channels/:channelId/messages` (see `api-design.md` §7.9).

**Thread rule:** if `parentId` is provided, it must point to a message with `parentId IS NULL` (top-level only). Service layer rejects nested replies (Decision D4).

### 4.2 Message Updated (Broadcast)

After a successful REST `PATCH /api/v1/messages/:messageId`, the server broadcasts the updated message to the channel room.

```typescript
// Server → channel room users
io.to('channel:uuid').emit('message:updated', { message });
```

**REST trigger:** `PATCH /api/v1/messages/:messageId` (see `api-design.md` §7.12).

**Permission:** `@IsMessageAuthor()` + 15-minute window enforced in service layer. Admins cannot edit; they moderate via `DELETE /api/v1/messages/:messageId` (soft-delete).

### 4.3 Message Deleted (Broadcast)

After a successful REST `DELETE /api/v1/messages/:messageId` (soft-delete), the server broadcasts the deletion to the channel room.

```typescript
// Server → channel room users
io.to('channel:uuid').emit('message:deleted', {
  messageId: 'msg-uuid',
  deletedAt: '2026-05-11T12:05:00Z'
});
```

**REST trigger:** `DELETE /api/v1/messages/:messageId` (see `api-design.md` §7.13).

**Permission:** service layer via `PermissionService.can()`:
- Author can delete their own message (anytime).
- Channel `OWNER` / `ADMIN` can moderate-delete any message (audit-logged).

### 4.4 Thread Reply (Broadcast)

A thread reply is created via REST `POST /api/v1/channels/:channelId/messages` with `parentId` set. No separate `thread:` namespace. The server broadcasts via the same `message:created` event.

```typescript
// Server → channel
io.to('channel:uuid').emit('message:created', {
  message: { id, channelId, authorId, content, parentId: 'parent-msg-uuid', createdAt }
});
```

**Thread view query:** client fetches replies via REST `GET /api/v1/channels/:id/messages?parentId=...` or listens to `message:created` and filters client-side.

### 4.5 Reaction Toggled (Broadcast)

Reaction toggle via REST. After a successful `POST /api/v1/messages/:messageId/reactions`, the server broadcasts the updated reaction state.

```typescript
// Server → channel
io.to('channel:uuid').emit('reaction:toggled', {
  messageId: 'msg-uuid',
  emoji: '👍',
  userId: 'user-uuid',
  count: 3
});
```

**REST trigger:** `POST /api/v1/messages/:messageId/reactions` (see `api-design.md` §7.15).

### 4.6 Typing Indicators

Lightweight ephemeral events. Not persisted.

```typescript
// Client → Server
socket.emit('typing:start', { channelId: 'channel-uuid' });
socket.emit('typing:stop', { channelId: 'channel-uuid' });

// Server → channel room users (excluding sender)
socket.to('channel:uuid').emit('typing:start', {
  userId: 'user-uuid',
  channelId: 'channel-uuid'
});

socket.to('channel:uuid').emit('typing:stop', {
  userId: 'user-uuid',
  channelId: 'channel-uuid'
});
```

**Rate limit:** 1 event per 3 seconds per user per channel. Excess dropped silently (no error emitted to avoid noise).

**Auto-stop:** server sets a Redis key with 3-second TTL per `(userId, channelId)`. If no `typing:stop` arrives, the TTL expiry simulates the stop. Client may rely on this or its own timeout.

### 4.7 Read Receipts

Client notifies server which messages were read. Server persists `ReadReceipt` rows.

```typescript
// Client → Server (batch for efficiency)
socket.emit('message:read', {
  channelId: 'channel-uuid',
  messageIds: ['msg-1', 'msg-2', 'msg-3']
});

// Optional: broadcast "seen by" to channel room users (MVP — skip broadcast to reduce noise)
// Server stores in DB only
```

**Permission:** `CanAccessChannel`.

### 4.8 Events Summary (Part 3)

| Event | Direction | Payload | Trigger / Permission Gate |
|-------|-----------|---------|---------------------------|
| `message:created` | Server → broadcast | `{ message }` | REST `POST /channels/:channelId/messages` |
| `message:updated` | Server → broadcast | `{ message }` | REST `PATCH /messages/:messageId` |
| `message:deleted` | Server → broadcast | `{ messageId, deletedAt }` | REST `DELETE /messages/:messageId` |
| `reaction:toggled` | Server → broadcast | `{ messageId, emoji, userId, count }` | REST `POST /messages/:messageId/reactions` |
| `typing:start` | Client → Server | `{ channelId }` | `CanAccessChannel` |
| `typing:stop` | Client → Server | `{ channelId }` | `CanAccessChannel` |
| `typing:start` | Server → broadcast | `{ userId, channelId }` | CanAccessChannel-approved room (except sender) |
| `typing:stop` | Server → broadcast | `{ userId, channelId }` | CanAccessChannel-approved room (except sender) |
| `message:read` | Client → Server | `{ channelId, messageIds[] }` | `CanAccessChannel` |

---

## 5. Part 4 — Presence Events

Presence tracks who is currently online in the app and who is viewing a specific channel. It is **not** the same as channel membership (`channel:user_joined` is membership; `presence:channel_joined` is viewing).

### 5.1 Storage

Redis Sets (not PostgreSQL):

| Redis Key | Type | Content |
|-----------|------|---------|
| `presence:workspace:<id>` | Set | `userId`s currently connected to the workspace |
| `presence:channel:<id>` | Set | `userId`s currently viewing the channel |

### 5.2 Workspace-Level Presence

```typescript
// On socket connect (after auth)
await redis.sadd('presence:workspace:uuid', userId);
io.to('workspace:uuid').emit('presence:online', { userId: 'user-uuid' });

// On socket disconnect
await redis.srem('presence:workspace:uuid', userId);
// Also clean up all presence:channel:* sets for this user
io.to('workspace:uuid').emit('presence:offline', { userId: 'user-uuid' });
```

### 5.3 Channel-Level Presence

```typescript
// When user emits channel:join (Part 2)
await redis.sadd('presence:channel:uuid', userId);
socket.to('channel:uuid').emit('presence:channel_joined', {
  userId: 'user-uuid',
  channelId: 'channel-uuid'
});

// When user emits channel:leave or disconnects
await redis.srem('presence:channel:uuid', userId);
socket.to('channel:uuid').emit('presence:channel_left', {
  userId: 'user-uuid',
  channelId: 'channel-uuid'
});
```

### 5.4 Presence Sync

Client requests the current online list after joining a channel.

```typescript
// Client → Server
socket.emit('presence:sync', { channelId: 'channel-uuid' });

// Server → Client
socket.emit('presence:synced', {
  channelId: 'channel-uuid',
  onlineUserIds: ['user-1', 'user-2', 'user-3']
});
```

**No explicit status changes in MVP** (e.g., "away", "busy"). Only binary online/offline.

### 5.5 Events Summary (Part 4)

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `presence:online` | Server → broadcast | `{ userId }` | User connected to workspace |
| `presence:offline` | Server → broadcast | `{ userId }` | User disconnected from workspace |
| `presence:channel_joined` | Server → broadcast | `{ userId, channelId }` | User started viewing channel |
| `presence:channel_left` | Server → broadcast | `{ userId, channelId }` | User stopped viewing channel |
| `presence:sync` | Client → Server | `{ channelId }` | Request online user list |
| `presence:synced` | Server → Client | `{ channelId, onlineUserIds[] }` | Current online list |

**Rate limiting:** `presence:sync` limited to 1 req / 5 sec per user. Presence broadcasts are server-initiated and exempt.

---

## 6. Event Naming Convention

| Rule | Example | Counter-example |
|------|---------|-----------------|
| Domain prefix + colon + action | `typing:start` | ❌ `typingStart` |
| Use present tense for actions | `channel:join` | ❌ `channel:joined` |
| Past tense only for broadcast confirmations | `message:created` (broadcast) | — |
| Error events prefix with `error:` | `error:auth` | ❌ `authError` |
| Use kebab-case for multi-word domains | `read-receipt:update` | ❌ `readReceipt:update` |

---

## 7. Error Handling

All WebSocket errors follow this envelope:

```json
{
  "event": "error:<domain>",
  "data": {
    "code": "UPPER_SNAKE_CASE",
    "message": "Human readable description",
    "context": { /* optional extra data */ }
  }
}
```

Common error codes:

| Code | Meaning | HTTP Equivalent |
|------|---------|-----------------|
| `UNAUTHORIZED` | JWT invalid or missing | 401 |
| `FORBIDDEN` | Valid JWT but insufficient permission | 403 |
| `NOT_FOUND` | Channel/message does not exist | 404 |
| `RATE_LIMITED` | Too many socket events | 429 |
| `TOKEN_EXPIRED` | Access token expired during connection | 401 |
| `VALIDATION_ERROR` | Payload schema invalid | 400 |
| `INTERNAL_ERROR` | Unexpected server error | 500 |

---

## 8. Rate Limiting (Socket Layer)

Socket events are rate-limited separately from HTTP. Redis-backed sliding window per `userId`.

| Event Type | Limit | Window |
|------------|-------|--------|
| `typing:start` / `typing:stop` | 1 | 3 sec |
| `channel:join` | 10 | 60 sec |
| `presence:sync` | 1 | 5 sec |
| `message:read` | 10 | 10 sec |

Burst violations emit `error:rate_limited` and drop the event (no disconnect).

---

## 9. Security Notes

1. **No sensitive data in handshake.** `auth.token` is the only sensitive field. Everything else travels inside the encrypted WebSocket frame (WSS).
2. **Room isolation.** Private channel rooms must never leak events to non-members. Always verify `CanAccessChannel` before `socket.join(channelId)`.
3. **MVP limitation: no server-side event replay.** If a client misses events during disconnect, it must fetch missed messages via REST cursor pagination. v2 may add message buffer / event log.
4. **Socket.io Admin UI / debug endpoints disabled in production.**
