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
| **Message search** | `pnpm verify:prod:message-search` | Global, scoped, and legacy search across channels, direct conversations, and groups, plus permission/block boundaries. | Three disposable accounts, one workspace, two channels, one group, one direct conversation | Group archived at the end |
| **Message jump** | `pnpm verify:prod:message-jump` | Message context endpoints for channel, direct, and group messages, including permission boundaries and wrong-conversation 404s. | Three disposable accounts, one workspace, one channel, one group, one direct conversation | Group archived at the end |
| **Realtime** | `pnpm verify:prod:realtime` | WebSocket delivery for channel, direct, and group messages plus typing events; diagnostics leak checks. | Two disposable accounts, one workspace, one channel, one group, one direct conversation | Group archived at the end |
| **Mentions & notifications** | `node scripts/verify-production-mentions.mjs` | Notification preference endpoints, mention resolution in DMs and groups, and non-resolvable mention filtering. | Two disposable accounts, one direct conversation, one group | None |
| **Admin reports** | `pnpm verify:prod:admin-reports` | Regular users cannot access admin report endpoints; optional positive admin list/filter/detail/update checks. | Two disposable accounts, one report | None |
| **Admin audit log** | `pnpm verify:prod:audit` | Regular users cannot access admin audit endpoints; optional positive admin list/filter/detail checks plus sensitive-field leak checks. | Two disposable accounts, one block, one report | None |
| **Demo mode** | `pnpm verify:prod:demo` | Checks the public demo onboarding endpoint. Skipped entirely when `DEMO_MODE_ENABLED` is not `true`. | One demo user and workspace | None |
| **Core** | `pnpm verify:prod:core` | public, auth, permissions, browser, pwa | Varies | Varies |
| **Messaging** | `pnpm verify:prod:messaging` | attachments, attachments-parity, pagination, mentions, message-search, message-jump, realtime, presence | Varies | Varies |
| **Social** | `pnpm verify:prod:social` | contacts, contacts-privacy, groups, channel-sidebar, safety | Varies | Varies |
| **Admin suite** | `pnpm verify:prod:admin-suite` | admin-reports, diagnostics, audit | Varies | Varies |
| **Browser suite** | `pnpm verify:prod:browser-suite` | browser, attachments, channel-sidebar, push-browser, mobile-shell | Varies | Varies |
| **All** | `pnpm verify:prod:all` | Runs core → messaging → social → admin-suite through the suite runner. | Same as above | Same as above |

---

## Suite runner

The grouped commands are driven by `scripts/verify-production-suite.mjs`.

```bash
# Run every verifier group sequentially
pnpm verify:prod:all

# Run a single group
pnpm verify:prod:core
pnpm verify:prod:messaging
pnpm verify:prod:social
pnpm verify:prod:admin-suite
pnpm verify:prod:browser-suite

# Continue after a failure (useful for debugging)
node scripts/verify-production-suite.mjs --group all --continue-on-error
```

The runner:

- executes verifiers sequentially;
- prints duration per verifier;
- stops on the first failure by default;
- prints a final summary with pass/fail counts and total duration.

---

## Timeout control

Each verifier has its own step timeout so a single slow browser check cannot hang forever, and the practical ceiling is no longer the shell’s 300 s default.

| Variable | Default | Description |
|---|---|---|
| `VERIFY_STEP_TIMEOUT_MS` | `300000` (5 minutes) | Per-verifier timeout in milliseconds. Browser-heavy verifiers such as attachments, browser, channel-sidebar, and push-browser use this. |
| `VERIFY_TIMEOUT_MS` | `0` (disabled) | Total suite timeout in milliseconds. If set, the runner aborts remaining verifiers once the total is reached. |

If a verifier times out, the runner reports exactly which script timed out and marks it as failed.

---

## Production precheck

Before any verifier group runs, the suite runner fetches:

```bash
GET /api/v1/version
GET /api/v1/health
```

It prints:

- `API_BASE` and `WEB_BASE`;
- the deployed commit hash and branch from `/version`;
- the health status.

If `/version` is missing or returns an unknown commit, the runner warns clearly but still attempts the verifiers.

---

## Demo readiness

Demo mode is disabled by default in production. Verify it safely without enabling it:

```bash
pnpm verify:prod:demo-readiness
```

This checks:

- `GET /demo/status` returns `{ enabled: false }`;
- `POST /demo/session` returns `404` when demo mode is disabled;
- no demo session or user is created;
- `docs/production-verification.md` documents how to enable demo mode safely via `DEMO_MODE_ENABLED`.

To run the full demo flow you must explicitly enable demo mode on the server:

```bash
DEMO_MODE_ENABLED=true
```

Then use `pnpm verify:prod:demo`.

**Do not enable demo mode on Render automatically and do not commit `DEMO_MODE_ENABLED=true`.**

---

## Required environment variables

All scripts default to the production URLs. Override only when needed.

| Variable | Default | Used by |
|---|---|---|
| `WEB_URL` / `VERIFY_WEB_BASE` | `https://lets-chat-web.vercel.app` | public smoke, browser |
| `API_URL` / `VERIFY_API_BASE` | `https://lets-chat-api-v2.onrender.com/api/v1` | all scripts |
| `VERIFY_MAIL_BASE` | `https://api.catchmail.io/api/v1` | auth, permissions, browser (fallback to Mail.tm if set) |
| `VERIFY_PASSWORD` | random per run | auth, permissions, browser |
| `VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE` | unset | permissions (must be `1` to run delete tests) |
| `VERIFY_ADMIN_ACCESS_TOKEN` | unset | admin reports / audit / realtime (optional, enables positive admin diagnostics checks) |
| `WS_URL` / `VERIFY_WS_URL` | `wss://lets-chat-api-v2.onrender.com` | realtime |
| `VERIFY_ACCOUNT_POOL_JSON` | unset | reusable verified account pool (see below) |
| `VERIFY_ACCOUNT_N_EMAIL` / `VERIFY_ACCOUNT_N_USERNAME` / `VERIFY_ACCOUNT_N_PASSWORD` | unset | reusable verified account pool alternative |

**Do not commit `VERIFY_PASSWORD`, account passwords, or any token.** Scripts never print tokens, passwords, or DB URLs to the console.

---

## Reusable verifier account pool

Most verifiers create disposable email accounts through catchmail.io. After many runs the catchmail.io quota can be exhausted, blocking verification. To remove that dependency, configure a pool of **pre-verified** reusable accounts.

Create 5 verified accounts in production once with the safe server-side seed script, then store their credentials in your local environment or GitHub Actions secrets — **never commit them**.

```bash
# Format 1: JSON array
VERIFY_ACCOUNT_POOL_JSON='[
  {"email":"verify1@example.com","username":"verify1","password":"..."},
  {"email":"verify2@example.com","username":"verify2","password":"..."},
  {"email":"verify3@example.com","username":"verify3","password":"..."},
  {"email":"verify4@example.com","username":"verify4","password":"..."},
  {"email":"verify5@example.com","username":"verify5","password":"..."}
]'

# Format 2: indexed triples
VERIFY_ACCOUNT_1_EMAIL=verify1@example.com
VERIFY_ACCOUNT_1_USERNAME=verify1
VERIFY_ACCOUNT_1_PASSWORD=...
VERIFY_ACCOUNT_2_EMAIL=verify2@example.com
VERIFY_ACCOUNT_2_USERNAME=verify2
VERIFY_ACCOUNT_2_PASSWORD=...
```

### Seeding accounts directly in the database

When the mail provider is quota-exhausted, you can seed or update reusable verified accounts directly through the database without sending any email. This is a server-side CLI script only — there is no public API or web route.

```bash
DATABASE_URL="postgresql://..." \
VERIFY_ACCOUNT_POOL_JSON='[
  {"email":"verify1@example.com","username":"verify1","password":"..."}
]' \
pnpm verify:seed-accounts
```

The script:

- connects directly to `DATABASE_URL` via Prisma;
- validates every entry (email, username, password length/allowed characters);
- hashes passwords with the configured `BCRYPT_SALT_ROUNDS`;
- creates new users or updates existing users with the supplied password and `emailVerifiedAt`;
- always sets `role = USER`, clears stale verification tokens, and restores soft-deleted accounts;
- never logs passwords, password hashes, or the database URL;
- exits with a non-zero code if any account fails.

Run any verifier as usual:

```bash
VERIFY_ACCOUNT_POOL_JSON='[...]' pnpm verify:prod:attachments-parity
```

The suite runner reports the active mode and masks account addresses:

```text
Account mode: reusable pool
Pool size: 5
Accounts: ve***@example.com, ve***@example.com, ...
```

When a pool is configured:

- verifiers log in through the normal `/auth/login` endpoint;
- no disposable inboxes are created;
- scripts reset only the test state they need (contact privacy, contacts between pool accounts) and use unique workspace/channel/group/message names per run;
- if a verifier needs more accounts than the pool provides, it fails with a clear message such as `VERIFY_ACCOUNT_POOL_JSON has only 3 accounts, but this verifier needs 5`.

If no pool is configured, verifiers fall back to the existing disposable registration flow.

## Safety notes

- **Mail delivery:** production uses Resend by default. If Resend returns a quota/outage error, the API can fall back to SMTP when `MAIL_FALLBACK_PROVIDER=smtp` and the `SMTP_*` variables are configured. `MAIL_PROVIDER=console` is local-dev only and must not be enabled on Render.
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

# Admin audit log — negative checks only by default
pnpm verify:prod:audit

# Admin audit log — with positive admin checks
VERIFY_ADMIN_ACCESS_TOKEN=<token> pnpm verify:prod:audit

# Demo mode — skipped automatically when demo mode is disabled
pnpm verify:prod:demo

# Grouped suites
pnpm verify:prod:core
pnpm verify:prod:social
pnpm verify:prod:messaging
pnpm verify:prod:admin-suite
pnpm verify:prod:demo-readiness

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

- The default disposable-email provider is catchmail.io. Running the full pack repeatedly may hit the provider's quota. Configure a reusable account pool (see above) to avoid this. You can still override the disposable provider via `VERIFY_MAIL_BASE`.
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

## Demo Mode Verification

The dedicated verifier is `scripts/verify-production-demo.mjs`.

```bash
pnpm verify:prod:demo
```

**What it checks:**

- `GET /demo/status` returns `{ enabled: true }`.
- `POST /demo/session` returns a valid `AuthResult` with demo user, workspace, channels, and default channel.
- The demo user's email ends with `@lets-chat.demo` and has `role: "USER"`.
- The issued access token can list workspaces and includes the demo workspace.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `VERIFY_API_BASE` | `https://lets-chat-api-v2.onrender.com/api/v1` | API endpoint to verify against |
| `DEMO_MODE_ENABLED` | read from API status | The script is skipped when the API reports demo mode is disabled |

The script does not print tokens, passwords, or DB credentials. It creates one disposable demo account per run; clean up stale demo data with `pnpm --filter api demo:cleanup`.
