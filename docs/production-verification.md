# Production Verification Pack

This document describes the repeatable production verification scripts introduced in **B203**. The goal is to move from ad-hoc manual checks to a documented, runnable pack that supports portfolio/demo confidence and post-deploy stability.

---

## Scripts

All scripts are located in `scripts/` and are exposed as root package scripts.

| Script | Command | What it verifies | Data created | Cleanup |
|---|---|---|---|---|
| **Public smoke** | `pnpm verify:prod:public` | Wraps `scripts/smoke-deploy.mjs`. Public web/API endpoints, protected auth rejections, avatar fallback. | None | N/A |
| **Auth flow** | `pnpm verify:prod:auth` | Registers a disposable Mail.tm account, verifies email, logs in, refreshes tokens, validates new token, logs out, confirms revoked refresh token is rejected. | One disposable account | None (API has no self-delete) |
| **Permissions** | `pnpm verify:prod:permissions` | Owner vs member permissions: workspace/channel creation, channel invite/accept, member cannot delete channel, owner can delete channel/workspace, deleted content is invisible and excluded from search. | Owner account, member account, one workspace, one channel | Workspace is deleted at the end when destructive tests are enabled |
| **Browser sanity** | `pnpm verify:prod:browser` | Playwright checks: public login page, authenticated dashboard/workspace/channel, B202C workspace-search validation, owner delete affordances, non-owner hidden delete UI, mobile viewport smoke. | Owner account, member account, one workspace, one channel | Workspace is deleted at the end |
| **PWA** | `pnpm verify:prod:pwa` | Checks manifest validity, service worker presence, offline fallback, icons, and manifest link in HTML. | None | N/A |
| **Mobile shell** | `pnpm verify:prod:mobile-shell` | Mobile viewport QA for login, dashboard, profile (notifications + app install), direct messages, workspace, and channel composer. | One disposable account, one workspace, one channel | Workspace is deleted at the end |
| **Group chats** | `node scripts/verify-production-groups.mjs` | Group CRUD, membership, messaging, read state, and access control. | Two disposable accounts, one group | Group is archived at the end |
| **Contacts & group invites** | `pnpm verify:prod:contacts` | Contacts lifecycle/privacy and group invite link create/revoke/accept. | Three disposable accounts, one group | Group is archived at the end |
| **Message pagination** | `pnpm verify:prod:pagination` | Channel and group message lists return `{ items, nextCursor, hasMore }`; cursors walk through older pages without overlap. | One disposable account, one workspace, one channel, one group | Channel and group are archived at the end |
| **Mentions & notifications** | `node scripts/verify-production-mentions.mjs` | Notification preference endpoints, mention resolution in DMs and groups, and non-resolvable mention filtering. | Two disposable accounts, one direct conversation, one group | None |
| **Admin reports** | `pnpm verify:prod:admin-reports` | Regular users cannot access admin report endpoints; optional positive admin list/filter/detail/update checks. | Two disposable accounts, one report | None |
| **All** | `pnpm verify:prod:all` | Runs public → auth → permissions → browser → attachments → contacts → pwa sequentially. | Same as above | Same as above |

---

## Required environment variables

All scripts default to the production URLs. Override only when needed.

| Variable | Default | Used by |
|---|---|---|
| `WEB_URL` / `VERIFY_WEB_BASE` | `https://lets-chat-web.vercel.app` | public smoke, browser |
| `API_URL` / `VERIFY_API_BASE` | `https://lets-chat-api-v2.onrender.com/api/v1` | all scripts |
| `VERIFY_MAIL_BASE` | `https://api.mail.tm` | auth, permissions, browser |
| `VERIFY_PASSWORD` | random per run | auth, permissions, browser |
| `VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE` | unset | permissions (must be `1` to run delete tests) |
| `VERIFY_ADMIN_ACCESS_TOKEN` | unset | admin reports (optional, enables positive admin checks) |

**Do not commit `VERIFY_PASSWORD` or any token.** Scripts never print tokens, passwords, or DB URLs to the console.

---

## Safety notes

- **Public smoke** is safe to run at any time and can run on every push if desired.
- **Auth flow** creates a single disposable Mail.tm account. The account remains in the production database but has no workspaces, channels, or memberships. It cannot self-delete.
- **Permissions** only performs destructive actions (channel delete, workspace delete) when `VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE=1` is set. The seeded workspace is deleted at the end.
- **Browser** creates disposable accounts and a workspace, then deletes the workspace at the end.
- All disposable accounts are named with a timestamp and a `verify` prefix so they are easy to identify in logs.

---

## Running locally

```bash
# Public only — no secrets, no side effects
pnpm verify:prod:public

# Auth flow — creates one disposable account
pnpm verify:prod:auth

# Permission checks without destructive tests
pnpm verify:prod:permissions

# Permission checks including channel/workspace delete
VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE=1 pnpm verify:prod:permissions

# Browser sanity — requires Playwright
pnpm verify:prod:browser

# Admin reports — negative checks only by default
pnpm verify:prod:admin-reports

# Admin reports — with positive admin checks
VERIFY_ADMIN_ACCESS_TOKEN=<token> pnpm verify:prod:admin-reports

# Full pack (respects the destructive flag)
VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE=1 pnpm verify:prod:all
```

---

## GitHub Actions

`.github/workflows/production-verify.yml` is a **manual-only** workflow (`workflow_dispatch`). It does **not** run automatically on push. Choose which suites to run via the workflow inputs.

Repository variables that can be set:

- `VERIFICATION_WEB_URL` — override the frontend URL.
- `VERIFICATION_API_URL` — override the API URL.

If the variables are missing, the workflow uses the production defaults.

The main `CI` workflow also runs the API E2E security smoke tests (`apps/api/test/*.e2e-spec.ts`) against a temporary PostgreSQL service container on every push, before any production migration or deploy.

---

## Known limitations

- Mail.tm has rate limits. Running the full pack repeatedly from the same IP in a short window may hit `429 Too Many Requests`. Wait a few seconds between runs if this happens.
- Disposable accounts cannot be deleted through the API. They accumulate over time but remain harmless (no workspaces/channels/memberships).
- Browser checks rely on production `data-testid` attributes. If the UI changes, the selectors may need updating.
- PWA checks assume the production build has exposed `/manifest.webmanifest`, `/service-worker.js`, and `/offline.html`.
- Mobile shell QA opens a visible Chromium window by default (`headless: false`) because some PWA APIs are only available in real browsers. Set `HEADLESS=true` to run headlessly.
- The pack verifies behavior against the live production deployment. Do not run destructive tests against a shared staging environment that other people are using.

---

## Group Chats Verification

The standalone group-chats verifier is `scripts/verify-production-groups.mjs`.

```bash
node scripts/verify-production-groups.mjs
```

**What it checks:**

- Owner can create a group with initial members.
- Group appears in both owner and member lists.
- Member can fetch group details; non-member receives `404`.
- Owner can rename the group; member cannot.
- Members can send messages; non-members cannot list or send messages.
- Owner can mark the group as read.
- Owner can add and remove members.
- Member can leave the group.
- Owner can archive the group; archived groups no longer appear in lists.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `VERIFY_API_BASE` | `https://lets-chat-api-v2.onrender.com/api/v1` | API endpoint to verify against |
| `VERIFY_PASSWORD` | random per run | Password for disposable accounts |

The script archives the test group at the end and does not print tokens or passwords.

---

## Contacts & Group Invites Verification

The dedicated verifier is `scripts/verify-production-contacts.mjs`.

```bash
pnpm verify:prod:contacts

pnpm verify:prod:pagination
```

**What it checks:**

- Contact add by `userId` succeeds and is idempotent.
- Contacts are private — one user cannot see another user's contacts.
- Self-add and non-existent-user add are rejected.
- Starting a DM from a contact works; starting a DM with a non-contact is rejected.
- Removing a contact removes it from the owner's list.
- Group owner can create an invite link; non-owners cannot.
- Public invite preview is valid before acceptance.
- A stranger can accept the invite and join the group.
- Re-accepting is idempotent for existing members.
- Owner can revoke an invite link; revoked links are invalid and cannot be accepted.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `VERIFY_API_BASE` | `https://lets-chat-api-v2.onrender.com/api/v1` | API endpoint to verify against |
| `VERIFY_PASSWORD` | random per run | Password for disposable accounts |

The script archives the test group at the end and does not print tokens or passwords.

---

## Portfolio/demo value

Having a runnable verification pack means the project can demonstrate:

- repeatable post-deploy smoke checks;
- automated auth/session refresh validation;
- permission boundary checks for destructive owner actions;
- cross-browser/mobile sanity checks;
- clear safety boundaries between read-only and destructive verification.

## Admin Reports Verification

The dedicated verifier is `scripts/verify-production-admin-reports.mjs`.

```bash
pnpm verify:prod:admin-reports
```

**What it checks:**

- A regular user can create a report through the public `/reports` endpoint.
- The reporter receives `403` when trying to list admin reports.
- The report target receives `403` when trying to list admin reports.
- A regular user receives `403` when trying to update an admin report.
- If `VERIFY_ADMIN_ACCESS_TOKEN` is set:
  - Admin can list reports.
  - Admin can filter reports by status.
  - Admin can view report detail.
  - Admin can update report status and add a note.
  - Admin detail response does not leak sensitive fields (`passwordHash`, `token`, `avatarUrl`, etc.).

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `VERIFY_API_BASE` | `https://lets-chat-api-v2.onrender.com/api/v1` | API endpoint to verify against |
| `VERIFY_PASSWORD` | random per run | Password for disposable accounts |
| `VERIFY_ADMIN_ACCESS_TOKEN` | unset | Optional admin bearer token for positive checks |

The script does not print tokens, passwords, or DB credentials.

## Mentions & Notification Preferences Verification

The standalone mentions verifier is `scripts/verify-production-mentions.mjs`.

```bash
node scripts/verify-production-mentions.mjs
```

**What it checks:**

- `GET /auth/me/notification-preferences` returns all five preference booleans.
- `PATCH /auth/me/notification-preferences` updates a single field.
- Mentions in direct messages resolve for the other participant.
- Mentions of non-participants in a direct conversation do not resolve.
- Mentions in groups resolve for members.
- Mentions of non-members in a group do not resolve.
- Self-mentions resolve (the author is a member), while push filtering prevents the author from being notified.
