# Before & After: lets-chat Legacy → Secure Team Collaboration Platform

> **Purpose:** Side-by-side comparison of legacy architecture and modern rebuild decisions.  
> **Date:** 2026-05-11

---

## 1. Technology Stack

| Layer | Legacy (lets-chat) | Modern Rebuild | Rationale |
|-------|-------------------|----------------|-----------|
| **Runtime** | Node.js 0.10.x | Node.js 20 LTS | Security, performance, ES2023 |
| **Framework** | Express 3.x + express.oi | NestJS 10 | DI, modularity, decorators, testing |
| **Language** | JavaScript (ES5) | TypeScript 5.4 | Type safety, DX, maintainability |
| **API Style** | REST + Socket.io routes | REST + Socket.io events | Separate concerns cleanly |
| **ORM/ODM** | Mongoose 4.x | Prisma 5.x | Type-safe queries, migrations, relations |
| **Database** | MongoDB 3.x | PostgreSQL 15+ | ACID, full-text search, relational integrity |
| **Cache** | None | Redis 7 | Sessions, presence, Bull queue, Socket.io adapter |
| **Frontend** | Nunjucks SSR + jQuery | Next.js 14 App Router | SPA, SSR/SSG, React Server Components |
| **Styling** | LESS + Bootstrap | Tailwind CSS + shadcn/ui | Utility-first, accessible components |
| **Bundler** | Grunt + connect-assets | Next.js built-in (Turbopack) | Modern, fast, zero-config |
| **Package Manager** | npm 2.x | pnpm | Monorepo support, disk efficiency |
| **Testing** | ESLint only | Jest + Playwright | Unit, integration, E2E coverage |
| **Docs** | README only | Swagger/OpenAPI + ADRs | API discoverability, decision records |
| **Realtime** | Socket.io 0.9 (via express.oi) | Socket.io 4 + Redis adapter | Scalable, typed events, modern API |
| **Queue/Jobs** | None | Bull + Redis | Async notifications, background tasks |
| **Auth** | Passport local + bearer + session | Passport JWT + refresh + HTTP-only cookie | Stateless, secure, scalable |
| **Validation** | Manual checks | Zod + Class-Validator + Pipes | Declarative, type-safe |
| **Logging** | console.log | Pino (structured) | Observability, log aggregation |
| **Security** | Helmet (basic) | Helmet + CORS + rate limiting + throttling | Defense in depth |
| **Containerization** | Dockerfile only | Docker Compose + multi-stage builds | Dev-prod parity |
| **CI/CD** | None | GitHub Actions (lint, test, build) | Automation, quality gates |

---

## 2. Data Architecture

### 2.1 Database Paradigm

**Legacy: MongoDB (Document Store)**
```javascript
// Denormalized, embedded references
Room: {
  _id, slug, name, owner, participants: [UserId],
  messages: [MessageId],  // Dual storage!
  private, password
}
Message: {
  _id, room: RoomId, owner: UserId, text, posted
}
// Text search: db.messages.createIndex({ text: 'text' })
```

**Modern: PostgreSQL (Relational)**
```prisma
model Workspace { id, name, slug, ownerId, members: WorkspaceMember[], channels: Channel[] }
model Channel { id, name, slug, workspaceId, type: PUBLIC|PRIVATE, members: ChannelMember[], messages: Message[] }
model Message { id, content, channelId, authorId, parentId?, createdAt, updatedAt, deletedAt? }
model Thread { id, messageId, replies: Message[] }
model Reaction { id, messageId, userId, emoji, createdAt }
// Text search: tsvector GIN index on Message.content
```

### 2.2 Key Schema Improvements

| Aspect | Legacy | Modern |
|--------|--------|--------|
| **Relations** | Manual reference tracking | Foreign keys, cascade deletes |
| **Multi-tenancy** | None (single org) | Workspace model with members |
| **Soft delete** | `archived` flag on rooms only | `deletedAt` on ALL entities |
| **Audit trail** | None | Dedicated `AuditLog` table |
| **Threads** | Flat messages only | `parentId` self-referencing messages |
| **Reactions** | None | Separate `Reaction` table |
| **File metadata** | Embedded in message | Separate `Attachment` table |
| **Search** | MongoDB `$text` (basic) | PostgreSQL `tsvector` + GIN (ranked) |
| **Migrations** | None (schema-less) | Prisma Migrate (versioned) |
| **Typing** | None | Full Prisma Client types |

---

## 3. Authentication & Security

### 3.1 Auth Flow

**Legacy: Session + Token Hybrid**
```
Browser → POST /login → Server creates session (MongoStore)
                          ↓
                    Sets cookie (connect.sid)
                          ↓
              API calls use Bearer token OR session
                          ↓
        Socket.io uses passport.socketio OR ?token= query
```
- **Problem:** Session state in MongoDB, socket auth complexity, token in query string

**Modern: JWT Access + Refresh**
```
Browser → POST /auth/login → Server validates password
                              ↓
                    Creates access token (15min, signed JWT)
                    Creates refresh token (7d, rotation)
                              ↓
              Sets refresh_token in HTTP-only cookie
              Returns access_token in response body
                              ↓
        API calls: Authorization: Bearer <access_token>
        Token refresh: POST /auth/refresh (cookie auto-sent)
        Socket.io: auth: { token: access_token } in handshake
```
- **Benefit:** Stateless, secure (no token in URL), automatic rotation

### 3.2 Brute-Force Protection

**Legacy: In-Memory Object**
```javascript
var loginAttempts = {};  // Global variable!
// Exponential backoff: 5000 * 2^(attempts - threshold)
// Max lockout: 24h
// Resets on server restart!
```

**Modern: Redis + Rate Limiting**
```
General: 100 req/min per IP (Redis sliding window)
Auth: 5 req/min per IP + 3 failed attempts per username (Redis)
Lockout: 15 minutes after threshold
Distributed: Survives server restarts, works across instances
```

### 3.3 Authorization Model

**Legacy: Flat (Owner + Participants)**
```javascript
// Room only
room.isAuthorized(userId) {
  return owner === userId ||
         participants.includes(userId) ||
         !private;
}
// No global roles, no workspace concept
```

**Modern: Hierarchical RBAC**
```
Workspace Level: OWNER > ADMIN > MEMBER
Channel Level:  OWNER > ADMIN > MEMBER (inherited or explicit)
Permission Guards:
  @RequireRole('OWNER', 'ADMIN')  // Workspace admin+
  @CanAccessChannel()             // Channel member+
  @IsWorkspaceMember()            // Any workspace member
  @IsMessageAuthor()               // Message owner
```

---

## 4. Real-Time Architecture

### 4.1 Socket.io Integration

**Legacy: express.oi (Coupled)**
```javascript
// Express routes ARE socket routes
app.route('/rooms').get(function(req) {
    req.io.route('rooms:list');  // Route hijacking
});
app.io.route('messages', {
    create: function(req, res) { ... }  // Socket handler
});
// Presence: custom in-memory module
```

**Modern: Clean Separation**
```typescript
// HTTP Controller (REST API)
@Controller('messages')
class MessageController { ... }

// Gateway (WebSocket only)
@WebSocketGateway({ namespace: 'events' })
class EventsGateway {
  @SubscribeMessage('message:create')
  handleCreate(client, data) { ... }
}

// Presence: Redis-backed adapter + presence service
```

### 4.2 Presence System

**Legacy: In-Memory**
```javascript
// Custom presence module, per-process only
// Cannot scale horizontally without sticky sessions
```

**Modern: Redis + Socket.io Adapter**
```
Socket.io Redis Adapter: Broadcasts across all server instances
Presence Service: Redis Sets per channel (online userIds)
Typing Indicators: Redis keys with TTL (expire after 3s)
```

---

## 5. File Uploads

### 5.1 Legacy Flow
```
Browser → POST /files (multipart/form-data) → Server (Multer)
                                              ↓
                                    Save to local/S3/Azure
                                              ↓
                                    Return file URL
```
- **Problem:** Server buffers file, memory pressure, no direct upload

### 5.2 Modern Flow
```
Browser → GET /uploads/presigned-url?filename=...&type=...
                                              ↓
                                    Server returns signed S3/MinIO URL
                                              ↓
                          Browser PUTs file directly to storage
                                              ↓
                          Browser POSTs /messages with attachmentId
```
- **Benefit:** No server buffering, scalable, secure (time-limited URLs)

---

## 6. Search Architecture

### 6.1 Legacy
```javascript
// MongoDB text index
Message.index({ text: 'text', room: 1, posted: -1 });
// Query: Message.find({ $text: { $search: query }, room: roomId })
// No ranking, no stemming, limited operators
```

### 6.2 Modern
```sql
-- PostgreSQL tsvector + GIN
CREATE INDEX idx_message_search ON messages 
  USING GIN (to_tsvector('english', content));

-- Query with ranking
SELECT *, ts_rank(search_vector, query) as rank
FROM messages, plainto_tsquery('english', 'search term') query
WHERE search_vector @@ query
  AND channel_id = 'uuid'
ORDER BY rank DESC, created_at DESC
LIMIT 20;
```
- **Benefits:** Stemming, ranking, phrase search, websearch syntax, fast GIN index

---

## 7. Frontend Architecture

### 7.1 Legacy
```
Server → Nunjucks template → HTML page → jQuery enhancement
- Full page reloads
- Server-rendered forms
- Inline JavaScript
- LESS compilation via Grunt
```

### 7.2 Modern
```
Next.js 14 App Router
├── Server Components (default)
│   ├── Channel layout (static)
│   ├── Message list (data fetching)
│   └── User sidebar (async)
├── Client Components (interactive)
│   ├── Message input (Socket.io client)
│   ├── Real-time message list
│   ├── Emoji picker
│   └── File upload (presigned URL)
└── Shared
    ├── Tailwind utilities
    ├── shadcn/ui primitives
    └── Zustand state (lightweight)
```

---

## 8. Development Experience

| Aspect | Legacy | Modern |
|--------|--------|--------|
| **Start project** | `npm install`, manual MongoDB setup | `docker compose up` (one command) |
| **Database setup** | None (schema-less) | `prisma migrate dev` + seed |
| **Add endpoint** | Edit controller, manual validation | `@Controller` + `@Get` + DTO + Zod |
| **Type safety** | None | End-to-end (DB → API → Client) |
| **API testing** | curl / browser | Swagger UI + Playwright |
| **Hot reload** | None | Next.js HMR + NestJS watch |
| **Debugging** | console.log | Pino logs + IDE breakpoints |
| **Deploy** | Manual Docker / Heroku | Railway/Render + Vercel (Git push) |

---

## 9. Deployment Architecture

### 9.1 Legacy
```
[Browser] → [Nginx] → [Node.js (single process)]
                           ↓
                      [MongoDB (single instance)]
                      [Local filesystem or S3]
```
- Single server only (no clustering shown)
- No load balancer
- No cache layer

### 9.2 Modern (MVP)
```
[Browser] → [Vercel CDN] → [Next.js (serverless)]
                                ↓ (API calls)
                        [Nginx / Railway]
                                ↓
                    [NestJS API (2+ replicas)]
                          ↙      ↓       ↘
                    [PostgreSQL] [Redis] [S3/MinIO]
```
- Horizontal scaling via Railway/Render
- Redis for shared state (presence, sessions, queues)
- PostgreSQL via managed service
- CDN for static assets + image optimization

---

## 10. Summary: Why This Rebuild?

| Legacy Pain Point | Modern Solution | Impact |
|-------------------|-----------------|--------|
| Node 0.10.x (dead) | Node 20 LTS | 🔒 Security |
| No tests | Jest + Playwright | ✅ Quality |
| MongoDB text search | PostgreSQL tsvector | 🔍 Search quality |
| In-memory state | Redis | 📈 Scalability |
| Session auth | JWT + refresh | 🚀 Performance |
| jQuery templates | Next.js RSC | ⚡ Speed |
| No audit log | Immutable AuditLog | 🛡️ Compliance |
| No rate limiting | Redis rate limiting | 🛡️ Security |
| Manual file handling | Presigned URLs | 📁 Scalability |
| No type safety | TypeScript + Prisma | 🛠️ Maintainability |

**Bottom Line:** The rebuild preserves `lets-chat`'s proven UX decisions (rooms, presence, file uploads) while replacing every infrastructure component with 2026 best practices. The result is a secure, scalable, maintainable team collaboration platform.
