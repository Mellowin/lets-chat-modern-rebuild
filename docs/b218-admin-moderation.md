# B218 — Admin Moderation Dashboard for Reports

## Goal

Close the safety/reporting product loop by giving admins and moderators a dedicated dashboard to review user reports, update report status, and add internal notes.

## Admin access model

- A `UserRole` enum was added to the `User` table with values `USER`, `MODERATOR`, and `ADMIN`.
- The default role for new users is `USER`.
- Admin endpoints and UI are guarded by `AdminGuard`, which allows only `ADMIN` and `MODERATOR`.
- There are no hardcoded production credentials or secrets; admin access is controlled entirely by the `role` column.
- To bootstrap an admin in local/dev environments, update the user's `role` directly in the database (`UPDATE "User" SET role = 'ADMIN' WHERE username = '...';`).

## Report statuses

| Status | Meaning |
|---|---|
| `OPEN` | New report, not yet reviewed. |
| `REVIEWED` | Reviewed, no action taken. |
| `DISMISSED` | Reviewed and dismissed. |
| `ACTION_TAKEN` | Reviewed and moderation action was taken. |

Status transitions are validated on the server. Invalid statuses are rejected with `400 Bad Request`.

## Backend

New endpoints under `GET|PATCH /api/v1/admin/reports`:

- `GET /admin/reports` — list reports with cursor pagination and optional `status` filter.
- `GET /admin/reports/:id` — get safe report details.
- `PATCH /admin/reports/:id` — update `status` and/or `adminNote`. Sets `reviewedAt` and `reviewedBy` automatically.

Safe output includes only:

- report id, reason, details, status, admin note, timestamps;
- safe reporter/reported user/reviewer summaries (`id`, `username`, `displayName`, `avatarUrl`);
- optional target IDs (`messageId`, `directConversationId`, `groupId`) for context.

Excluded from responses:

- tokens, passwords, password hashes;
- private file URLs or pre-signed URLs;
- raw auth/session data;
- unrelated private user data.

## Frontend

- New protected page at `/admin/reports`.
- Shows report list, status filter, report detail panel, status update buttons, and admin note input.
- Non-admin/non-moderator users see an access-denied state and no useful data.
- Sidebar shows a "Moderation" link only for `ADMIN`/`MODERATOR` users.

## Tests

### API

- `admin-reports.controller.spec.ts` — controller wiring for list, detail, and update.
- Existing auth/guard/controller tests were updated to include the new `role` field.

### Web

- `apps/web/src/app/admin/reports/page.test.tsx` — renders list, filter, detail, status update, note update, loading/empty/error states, and non-admin access denial.

### E2E

- `apps/api/test/safety.e2e-spec.ts` includes admin report security checks.

## Production verifier

```bash
# Negative checks only (no admin secrets required)
pnpm verify:prod:admin-reports

# With positive admin checks (requires an admin bearer token)
VERIFY_ADMIN_ACCESS_TOKEN=<token> pnpm verify:prod:admin-reports
```

The verifier creates disposable users, creates a report, and confirms regular users receive `403` on admin endpoints. If `VERIFY_ADMIN_ACCESS_TOKEN` is provided, it also verifies admin list/filter/detail/update flows and checks that sensitive fields are not leaked.

## Limitations and future work

- User suspension/admin block is intentionally out of scope for B218. It can be added later as a separate moderation action.
- The verifier's positive checks require a pre-existing admin token; there is no production admin bootstrap endpoint.
- Report detail does not currently load the reported message content; only target IDs are exposed to avoid leaking data to moderators before the report is reviewed.
