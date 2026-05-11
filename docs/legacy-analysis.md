# Legacy Analysis: lets-chat (sdelements/lets-chat)

> **Source:** `https://github.com/sdelements/lets-chat`  
> **Status:** Archived (2014–2016), ~9.8k ⭐, MIT License  
> **Original Stack:** Node.js 0.10.x, Express.oi, Mongoose 4.x, MongoDB, Nunjucks, Grunt  
> **Analyst:** Rebuild Team (Phase 0)  
> **Date:** 2026-05-11

---

## 1. Executive Summary

`lets-chat` is a self-hosted chat application for small teams created by Security Compass. It was popular in the mid-2010s as a lightweight, open-source Slack alternative. The project is now archived and built on a severely outdated stack (Node 0.10.x, 2014-era dependencies). However, its feature set, clean room-based permission model, and pragmatic security choices make it an excellent candidate for a modern rebuild.

**Rebuild Value:** ⭐⭐⭐⭐⭐ (Strong feature parity potential + clean domain model)

---

## 2. Original Feature Inventory

### 2.1 Core Messaging
- Persistent messages stored in MongoDB
- Multiple chat rooms (channels)
- Room-based message history with pagination (`skip`/`take`)
- Text search via MongoDB text index (`$text`)
- Message timestamps and ownership
- Deleted user handling (`[Deleted User]` fallback)

### 2.2 Rooms (Channels)
- **Public rooms** — visible to all authenticated users
- **Private rooms** — visible only to owner + participants
- **Password-protected rooms** — requires password to join
- Room ownership model
- Participants array (many-to-many with users)
- Room slugs for URL-friendly identifiers
- Archive (soft-delete) capability
- `lastActive` timestamp tracking

### 2.3 Real-Time
- Socket.io integration via `express.oi` (hybrid Express + Socket.io)
- Presence system (`user_join` / `user_leave` events)
- Live message broadcasting to room
- Room-specific event emission (respecting private room boundaries)
- Connection tracking per user

### 2.4 Authentication & Authorization
- **Local auth** — email/username + bcrypt password
- **LDAP auth** — via plugin system
- **Kerberos auth** — via plugin system
- Token-based API access (HTTP Bearer + Basic)
- Session-based auth (Express sessions + MongoStore)
- **Brute-force throttling** — exponential lockout after N failed attempts
- Account lockout with configurable threshold

### 2.5 File Handling
- File uploads via Multer
- Storage backends: **Local filesystem**, **AWS S3**, **Azure Blob**
- Image embeds in messages

### 2.6 Notifications & UX
- Desktop notifications
- Mentions: `@you` and `@all`
- Giphy search integration
- Code paste support
- Internationalization (i18n)
- Emoji support

### 2.7 XMPP / Federation (Advanced)
- `node-xmpp-server` 2.2.0
- XMPP Multi-User Chat (MUC) for rooms
- 1-to-1 XMPP chat
- **Rebuild decision:** Excluded from MVP (complexity vs. value)

### 2.8 Integrations
- Hubot adapter for chat bots
- REST-like API

### 2.9 Frontend
- Server-side rendered Nunjucks templates (`<%`, `<$` custom tags)
- LESS stylesheets
- `connect-assets` for JS/CSS bundling
- jQuery-based (implied by 2014 stack)

---

## 3. Architecture Deep Dive

### 3.1 Project Structure
```
lets-chat/
├── app/
│   ├── controllers/      # Route + socket handlers (auto-loaded)
│   ├── models/           # Mongoose schemas
│   ├── auth/             # Passport strategies + throttling
│   ├── core/             # Business logic layer (rooms, messages, files, presence)
│   ├── middlewares/      # Auth, room route resolution
│   ├── plugins/          # Extensible auth/storage plugins
│   └── config/           # Environment configuration
├── assets/               # LESS + frontend JS
├── locales/              # i18n translations
└── app.js                # Bootstrap
```

### 3.2 Data Models (Mongoose)

**User Model**
| Field | Type | Notes |
|-------|------|-------|
| `provider` | String | `local`, `ldap`, `kerberos` |
| `uid` | String | External ID for non-local providers |
| `email` | String | Unique, indexed |
| `password` | String | bcrypt hashed |
| `token` | String | API access token |
| `firstName`, `lastName` | String | Profile |
| `username` | String | Unique, indexed |
| `displayName` | String | Computed or custom |
| `status` | String | User status |
| `rooms` | [ObjectId] | Joined rooms |
| `openRooms` | [ObjectId] | Open rooms |
| `messages` | [ObjectId] | Related messages |

**Virtuals:** `local` (provider check), `avatar` (MD5 email → Gravatar)

**Methods:** `findByIdentifier`, `generateToken`, `findByToken`, `comparePassword`, `authenticate`

**Room Model**
| Field | Type | Notes |
|-------|------|-------|
| `slug` | String | Unique URL identifier |
| `archived` | Boolean | Soft delete flag |
| `name` | String | Display name |
| `description` | String | Optional |
| `owner` | ObjectId | Creator |
| `participants` | [ObjectId] | Members |
| `messages` | [ObjectId] | References (denormalized) |
| `created`, `lastActive` | Date | Timestamps |
| `private` | Boolean | Visibility flag |
| `password` | String | bcrypt (for password rooms) |

**Virtuals:** `handle` (slug or ID), `hasPassword`

**Methods:** `isAuthorized(userId)` — checks owner/participant/private/password membership

**Message Model**
| Field | Type | Notes |
|-------|------|-------|
| `room` | ObjectId (ref) | Parent room |
| `owner` | ObjectId (ref) | Author |
| `text` | String | Required |
| `posted` | Date | Indexed, default now |

**Index:** `{ text: 'text', room: 1, posted: -1, _id: 1 }` for search

### 3.3 Auth & Security Mechanisms

**Brute-Force Protection**
- In-memory tracking: `loginAttempts[username]`
- Configurable threshold + exponential backoff: `5000 * 2^(attempts - threshold)` ms
- Max lockout: 24 hours
- Reset on successful login

**Security Headers (Helmet)**
- `frameguard` — clickjacking protection
- `hidePoweredBy` — remove X-Powered-By
- `ieNoOpen` — IE download protection
- `noSniff` — MIME sniffing protection
- `xssFilter` — XSS filter
- `hsts` — HTTPS enforcement
- `csp` — Content Security Policy

**Room Authorization**
- `isAuthorized(userId)` checks:
  1. Is user the owner?
  2. Is user a participant?
  3. Is room public?
  4. Is password correct?
- `canJoin(options, cb)` — password verification + participant addition
- `toJSON(user)` — hides participants list for unauthorized users

**Socket Auth**
- `passport.socketio` for session-based sockets
- Token-based fallback via `?token=` query parameter
- User attached to socket request

### 3.4 Presence System
- `core.presence` module tracks active connections
- `join` / `leave` events per room
- Connection query by type (`socket.io`)
- Room-specific user lists

### 3.5 Plugin System
- Auth providers loaded dynamically: `plugins.getPlugin(key, 'auth')`
- Allows LDAP/Kerberos without core changes
- Storage backends similarly extensible

---

## 4. Technical Debt & Limitations

### 4.1 Critical (Blockers for Modern Use)
| Issue | Severity | Detail |
|-------|----------|--------|
| Node.js 0.10.x | 🔴 Critical | End-of-life since 2016, no security patches |
| Express 3.x / express.oi | 🔴 Critical | Dead library, known security issues |
| Mongoose 4.x | 🔴 Critical | Outdated, compatibility issues with modern Node |
| MongoDB dependency | 🟡 High | No relational integrity, limited search |
| No TypeScript | 🟡 High | Zero type safety |
| Grunt + Bower | 🔴 Critical | Dead build tools |
| No test suite | 🔴 Critical | Only ESLint, zero automated testing |

### 4.2 Security Gaps
| Issue | Severity | Detail |
|-------|----------|--------|
| In-memory brute-force tracking | 🟡 High | Not distributed, resets on restart |
| No rate limiting on API | 🟡 High | Only auth throttling |
| No audit logging | 🟡 High | No compliance trail |
| No input validation library | 🟡 High | Manual checks only |
| Session in MongoDB | 🟡 Medium | No TTL, grows unbounded |
| No CSRF tokens on API | 🟡 Medium | Relies on same-origin |
| Password regex only | 🟡 Medium | No strength meter |

### 4.3 Feature Gaps (for Modern Chat)
| Missing Feature | Impact |
|-----------------|--------|
| Threaded replies | Medium — flat message list only |
| Message reactions | Medium — no emoji reactions |
| Workspaces/Orgs | High — single-tenant only |
| Role-based permissions | High — only owner/participant |
| Search quality | High — basic MongoDB text search |
| File previews | Medium — no thumbnails |
| Message editing/deletion | Medium — no edit history |
| DM (1-to-1) rooms | Medium — only XMPP, no native |
| Email notifications | Low — not implemented |
| Mobile app / PWA | Low — desktop web only |

### 4.4 Architecture Smells
- **Global state:** `loginAttempts` object in memory
- **Callback hell:** Deeply nested async callbacks (pre-Promise era)
- **Denormalization:** Messages stored in both Room.messages array and Message collection
- **Template coupling:** HTML embedded in server-side templates
- **No API versioning:** Flat REST routes
- **Magic auto-loading:** `require-tree` makes dependency tracing hard
- **No separation of concerns:** Controllers handle both HTTP and WebSocket logic

---

## 5. Rebuild Opportunity Analysis

### 5.1 What to Preserve (Proven Value)
1. **Room permission model** — public/private/password is elegant and covers most use cases
2. **Presence system** — join/leave/online users is core to real-time chat UX
3. **Multi-storage file uploads** — local/S3/Azure pattern is still valid
4. **Auth throttling concept** — exponential backoff is best practice
5. **Room slugs** — URL-friendly identifiers improve UX
6. **Search integration** — chat history search is essential
7. **Plugin architecture concept** — extensibility without core changes

### 5.2 What to Modernize
1. **Stack:** Node 0.10 → Node 20+, Express → NestJS, MongoDB → PostgreSQL
2. **Frontend:** SSR templates → Next.js 14 SPA with SSR/SSG
3. **Real-time:** Socket.io 0.9 → Socket.io 4 with Redis adapter
4. **Auth:** Session + token → JWT access/refresh tokens + HTTP-only cookies
5. **Validation:** Manual checks → Zod/Pipes
6. **ORM:** Mongoose → Prisma (type-safe, migrations)
7. **Search:** MongoDB `$text` → PostgreSQL `tsvector` + GIN index
8. **Jobs:** None → Bull queues for notifications
9. **Testing:** None → Jest + E2E (Playwright)
10. **Docs:** None → Swagger/OpenAPI + ADRs

### 5.3 Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Over-engineering architecture | Medium | High | MVP scope lock, ADR discipline |
| Feature creep beyond MVP | High | Medium | Explicit exclusions documented |
| PostgreSQL migration complexity | Low | Medium | Prisma handles most; test data migrations |
| Socket.io scaling | Medium | Medium | Redis adapter + load balancer sticky sessions |
| File upload security | Low | High | Presigned URLs, size limits, type validation |

---

## 6. Lessons Learned from the Legacy

1. **Keep the domain model simple.** `lets-chat` has only 4 core entities (User, Room, Message, File) yet delivers a complete chat experience.
2. **Permission boundaries matter.** The `isAuthorized()` pattern on Room is clean and should be elevated to a decorator/guard in NestJS.
3. **Auth flexibility is a trap.** Supporting local/LDAP/Kerberos increased complexity significantly. Modern rebuild: email-only local auth, OAuth v2.
4. **In-memory state doesn't scale.** The `loginAttempts` object is a time bomb for production.
5. **Flat messages are limiting.** Users expect threads and reactions; plan for them early in schema design.
6. **Plugin systems are powerful but expensive.** Only implement if there's a clear v2 need.

---

## 7. Conclusion

`lets-chat` is a goldmine for a rebuild: mature feature set, clean domain model, real-world proven usage (9.8k stars), and an architecturally simple foundation. Its main liabilities are technological obsolescence, not design flaws. The modern rebuild can preserve its core UX decisions while replacing every piece of infrastructure with current best practices.

**Recommended approach:**
- Phase 0 (now): Legacy analysis ✅, scope definition, architecture design
- Phase 1: NestJS backend + PostgreSQL schema + Prisma
- Phase 2: Next.js frontend + Socket.io real-time
- Phase 3: File uploads, search, notifications, polish
- Phase 4: Deploy, test, demo
