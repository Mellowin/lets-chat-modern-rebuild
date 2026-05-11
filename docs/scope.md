# MVP Scope: Secure Team Collaboration Platform

> **Project:** lets-chat Modern Rebuild  
> **Version:** MVP (v1.0)  
> **Target Timeline:** 5–6 weeks (35–40h/week)  
> **Date:** 2026-05-11  
> **Status:** 🔒 LOCKED — No additions without ADR

---

## 1. Philosophy

This MVP aims to rebuild the core `lets-chat` experience on a modern, production-ready stack. We prioritize **security**, **auditability**, and **team collaboration** over novelty. Every feature must answer: *"Does this exist in lets-chat or fill a critical modern gap?"*

**Scope Rule:** If it's not listed here, it's v2. No exceptions.

---

## 2. Included Features

### 2.1 Authentication & Authorization
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Email/password registration | Bcrypt hashing, email uniqueness | Core from lets-chat |
| JWT access + refresh tokens | 15min access / 7d refresh, HTTP-only cookies | Modern replacement for session+token |
| Role-based access control | `OWNER`, `ADMIN`, `MEMBER` per workspace | Extension of lets-chat's flat permission model |
| Permission guards | Decorator-based (`@RequireRole`, `@CanAccess`) | NestJS best practice |
| Rate limiting | 100 req/min general, 5 req/min auth endpoints | Fills critical security gap |
| Auth throttling | Exponential backoff on failed logins (from legacy) | Preserve proven security mechanism |
| Profile management | Display name, avatar (Gravatar or upload) | UX baseline |

### 2.2 Workspaces
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Workspace creation | Name, slug, description | New: multi-tenancy (lets-chat was single-tenant) |
| Workspace membership | Invite by email, join via link | Team onboarding |
| Workspace roles | Owner, Admin, Member | Hierarchical permissions |
| Workspace settings | Name, slug, archive | Manageability |

### 2.3 Channels (Rooms)
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Public channels | Visible to all workspace members | From lets-chat |
| Private channels | Visible only to invited members | From lets-chat |
| Channel ownership | Creator has OWNER role in channel | From lets-chat |
| Channel participants | Add/remove members | From lets-chat |
| Archive channel | Soft delete, recoverable | From lets-chat |
| Channel slugs | URL-friendly identifiers | From lets-chat |
| Permission guards | Only members can read/write | Extension with RBAC |

### 2.4 Messages
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Create message | Text, author, channel | Core from lets-chat |
| Read messages | Paginated, cursor-based | Modern pagination (not skip/take) |
| Update message | Edit within 15 minutes, edit history | Modern expectation |
| Soft delete message | Deleted flag, still visible as "deleted" | Audit compliance |
| Real-time delivery | Socket.io broadcast to channel | From lets-chat, modernized |
| Typing indicators | `typing:start` / `typing:stop` events | UX polish |
| Mentions | `@username`, `@channel`, `@here` | From lets-chat |
| Message search | PostgreSQL `tsvector` + GIN index | Modern replacement for MongoDB text search |
| Link previews | OG metadata extraction | UX polish |

### 2.5 Threads (Replies)
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Reply to message | Threaded conversation under parent | Modern expectation (Slack/Discord) |
| Thread view | Show all replies to a message | UX necessity |
| Thread notification | Notify parent message author | Engagement |

### 2.6 Reactions
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Emoji reactions | Unicode emoji on messages | Modern expectation |
| Reaction counts | Aggregate per emoji | UX standard |
| Toggle reaction | Add/remove own reaction | Idempotent |

### 2.7 File Attachments
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Upload to message | Max 10MB, images/documents | From lets-chat |
| Storage backends | Local (dev), S3/MinIO (prod) | From lets-chat pattern |
| Presigned URLs | Direct browser-to-S3 upload | Security best practice |
| File type validation | Whitelist: images, PDF, docs | Security |
| Image embeds | Inline image rendering | From lets-chat |

### 2.8 Notifications
| Feature | Detail | Rationale |
|---------|--------|-----------|
| In-app notifications | Notification bell, unread counts | Engagement |
| Mention notifications | When @username or @channel used | From lets-chat |
| Bull queue | Async notification processing | Scalability, decoupling |
| Read receipts | Per-user message read status | Modern expectation |

### 2.9 Audit & Compliance
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Audit log table | Who did what, when | Critical for enterprise/security |
| Logged actions | CREATE/UPDATE/DELETE on messages, channels, workspaces | Compliance baseline |
| Immutable log | Append-only, no user deletion | Audit integrity |
| Soft delete everywhere | `deletedAt` timestamp, not `DELETE` | Recovery + audit |

### 2.10 Search
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Full-text search | PostgreSQL `tsvector` on messages | Modern, fast, scalable |
| Channel-scoped search | Search within specific channel | Contextual UX |
| Author filter | Search by message author | Filter capability |
| Date range filter | From/to dates | Temporal search |

### 2.11 DevOps & Tooling
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Docker Compose | PostgreSQL + Redis + API + Web | Production parity locally |
| Database seeding | Demo workspace, channels, users | Development velocity |
| Swagger/OpenAPI | Auto-generated API docs | Developer experience |
| Environment config | `.env` validation with Joi/Zod | 12-Factor App |
| Health checks | `/health`, `/health/db`, `/health/redis` | Monitoring readiness |
| Structured logging | Pino or NestJS built-in | Observability |
| Error tracking | Sentry-ready (optional env) | Production monitoring |

### 2.12 Testing
| Feature | Detail | Rationale |
|---------|--------|-----------|
| Unit tests | Services, guards, utilities | Jest |
| Integration tests | API endpoints with test DB | Supertest + testcontainers |
| Critical-path E2E | Auth flow, channel create, message send | Playwright (minimum 5 flows) |

---

## 3. Excluded from MVP (v2 Candidates)

| Feature | Why Excluded | v2 Priority |
|---------|-------------|-------------|
| **WebRTC / Voice channels** | Complex infrastructure, not in lets-chat | High |
| **Video calls** | Same as above | High |
| **AI bot / Summarization** | Requires LLM integration, API costs | Medium |
| **GitHub/GitLab OAuth** | Local auth is sufficient for MVP | Medium |
| **GitHub/GitLab integrations** | Webhook complexity | Medium |
| **Email notifications** | SMTP setup, deliverability concerns | Medium |
| **Email digests** | Batch processing complexity | Low |
| **Mobile app / React Native** | Huge scope expansion | Low |
| **PWA / Offline support** | Service worker complexity | Medium |
| **XMPP / Federation** | Legacy feature, low modern demand | Low |
| **Hubot adapter** | Bot ecosystem, out of scope | Low |
| **LDAP / Kerberos auth** | Enterprise auth, complex setup | Low |
| **SAML / SSO** | Enterprise requirement | Low |
| **Message pinning** | Nice-to-have | Medium |
| **Custom emoji** | Unicode sufficient for MVP | Low |
| **Channel categories** | Organization sugar | Low |
| **User groups / @admin** | RBAC can handle with roles | Medium |
| **Data export** | Compliance v2 feature | Medium |
| **Webhooks** | Integration v2 feature | Medium |
| **Slash commands** | Bot ecosystem v2 | Low |

---

## 4. Technical Boundaries

### 4.1 Database Schema Constraints
- PostgreSQL 15+ only (no MongoDB fallback)
- Prisma ORM with type-safe queries
- Migrations managed by Prisma Migrate
- Soft delete via `deletedAt` nullable timestamp on ALL entities
- Audit log is append-only (no updates, no deletes)

### 4.2 API Constraints
- RESTful JSON API (no GraphQL for MVP)
- Version prefix: `/api/v1/`
- WebSocket events for real-time only (not primary transport)
- Rate limiting: 100 req/min authenticated, 20 req/min unauthenticated

### 4.3 Frontend Constraints
- Next.js 14 App Router
- TypeScript throughout
- Tailwind CSS for styling
- shadcn/ui component base
- Server Components by default, Client Components for interactivity
- Socket.io client for real-time

### 4.4 Deployment Constraints
- Docker Compose for local development
- Railway or Render for backend hosting
- Vercel for frontend hosting
- Redis Cloud or self-hosted Redis
- PostgreSQL via managed service (Railway/Supabase)

---

## 5. Success Criteria

The MVP is considered complete when ALL of the following are true:

- [ ] User can register, login, logout with JWT
- [ ] User can create a workspace and invite members
- [ ] User can create public and private channels
- [ ] User can send/receive messages in real-time
- [ ] User can reply in threads
- [ ] User can react with emoji
- [ ] User can upload files (presigned URLs)
- [ ] User can search messages with full-text search
- [ ] Admin can view audit log
- [ ] All soft-deleted items retain history
- [ ] API has Swagger docs
- [ ] Docker Compose spins up full stack
- [ ] At least 5 critical-path E2E tests pass
- [ ] README with setup instructions
- [ ] Demo video (2–3 min) showing full flow

---

## 6. Change Control

If a stakeholder requests a feature not in Section 2:

1. Document the request in GitHub Issues
2. Evaluate against v2 priority list (Section 3)
3. If urgent, write an ADR explaining trade-offs
4. Require explicit approval to modify this document
5. Update scope.md and notify all contributors

**Scope Lock Date:** 2026-05-11  
**Next Review:** Post-MVP demo
