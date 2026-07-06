# B224 — Admin Audit Log Dashboard and Security Event Trail

## Goal

Give admins and moderators a searchable, paginated audit log dashboard and automatically record security-relevant events across auth, moderation, channels, groups, and attachments.

## Scope

- Extend `AuditLog` model with security/filter fields:
  - `targetUserId`, `groupId`, `severity`, `requestId`.
  - New indexes for efficient admin filtering.
- Metadata sanitizer that redacts tokens, secrets, passwords, DB/Redis URLs, and VAPID/S3 credentials before persistence.
- Admin-scoped API:
  - `GET /admin/audit` — cursor-paginated list with filters (actor, target, workspace, channel, group, action, entity type, severity, date range).
  - `GET /admin/audit/:id` — single event detail.
  - Protected by `JwtAccessGuard` + `AdminGuard` (`ADMIN`/`MODERATOR`).
- Frontend dashboard at `/admin/audit`:
  - Filter bar, severity badges, actor/target summaries, metadata preview.
  - Load-more pagination and access-denied state.
- Instrument audit events:
  - Auth: login success, password change, password reset complete, email verified, session revoked, logout.
  - Safety/moderation: user blocked/unblocked, report created/updated.
  - Channels: created, updated, archived, deleted, restored, member added/removed/left.
  - Groups: created, archived, member added/removed/left.
  - Attachments: uploaded (direct and presigned).
  - Admin views: diagnostics, reports, audit log.
- Production verifier: `scripts/verify-production-audit.mjs`.

## Design Decisions

- `AuditModule` is `@Global()` so audit recording can be injected into any service without every feature module importing it explicitly.
- `AuditService` dependency is optional (`@Optional() @Inject(AuditService)`) in instrumented services. This keeps unit-test provider setup simple while still wiring audit in production.
- Sanitization happens at the service layer before persistence, so controllers can never accidentally store raw tokens or secrets.
- Admin view events record `actorId: null` because they are emitted from controllers that do not need to re-extract the current user; the guard already guarantees an authenticated admin/moderator.

## API

### List audit events

```http
GET /admin/audit?limit=50&severity=warning&action=user.blocked
Authorization: Bearer <admin-or-moderator-token>
```

Response:

```json
{
  "items": [
    {
      "id": "...",
      "action": "user.blocked",
      "entityType": "user_block",
      "entityId": "...",
      "severity": "warning",
      "actor": { "id": "...", "username": "alice", "displayName": null },
      "targetUser": { "id": "...", "username": "bob", "displayName": null },
      "workspaceId": null,
      "channelId": null,
      "groupId": null,
      "requestId": null,
      "metadata": { "reason": "spam" },
      "ipAddress": null,
      "userAgent": null,
      "createdAt": "2026-07-06T..."
    }
  ],
  "nextCursor": "...",
  "hasMore": false
}
```

### Detail

```http
GET /admin/audit/:id
Authorization: Bearer <admin-or-moderator-token>
```

## Frontend

- Route: `/admin/audit`
- Fetches `/admin/audit` with query filters.
- Shows loading, empty, error, and access-denied states.
- Renders table with timestamp, action, severity, actor, target, entity type, and metadata summary.
- Load-more pagination using `nextCursor`.

## Verification

Local:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Production:

```bash
# Negative checks only (default)
pnpm verify:prod:audit

# With positive admin checks
VERIFY_ADMIN_ACCESS_TOKEN=<token> pnpm verify:prod:audit
```

## Migration

- `packages/database/prisma/migrations/20260706183000_add_audit_log_security_fields/migration.sql`
- Adds columns, indexes, and foreign-key relations. Applied automatically by CI `Migrate production database` job.

## Files Changed

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260706183000_add_audit_log_security_fields/migration.sql`
- `apps/api/src/audit/*`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/safety/blocks.service.ts`
- `apps/api/src/safety/reports.service.ts`
- `apps/api/src/safety/admin-reports.service.ts`
- `apps/api/src/safety/admin-reports.controller.ts`
- `apps/api/src/channels/channels.service.ts`
- `apps/api/src/groups/groups.service.ts`
- `apps/api/src/messages/attachments.service.ts`
- `apps/api/src/admin-diagnostics/admin-diagnostics.controller.ts`
- `apps/web/src/app/admin/audit/page.tsx`
- `scripts/verify-production-audit.mjs`
- `package.json`
- `docs/b224-admin-audit-log.md`
- `docs/project-status.md`
- `docs/production-verification.md`
- `README.md`

## Limitations / Future Work

- Audit events do not include IP address / user agent yet; those fields exist on the model and can be wired from request metadata later.
- Admin view events currently record `actorId: null`; capturing the acting admin user would require passing the user into each controller method.
- No export or retention policy for audit logs yet.
