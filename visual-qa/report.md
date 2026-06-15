# B193 Final Visual QA Report

Generated: 2026-06-15T22:03:55Z (post-deploy)
Production: https://lets-chat-web.vercel.app
API: https://lets-chat-api-v2.onrender.com/api/v1
Commit: `176b3d43f791ab6d9b8544a8a3f8eebcf2b3315d`

## Summary

B193 applied targeted polish fixes to the four visual issues found in the B192 QA screenshots. All fixes are deployed to production, all automated checks pass, and the UI is portfolio-demo ready.

## Files changed

- `apps/web/src/app/workspaces/[workspaceId]/page.tsx` — migrated workspace detail page to B192 design-system primitives.
- `apps/web/src/app/workspaces/[workspaceId]/page.test.tsx` — no changes (tests still green).
- `apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx` — removed oversized own-message left margin.
- `apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.test.tsx` — updated alignment assertions to match the new spacing.
- `apps/web/src/components/WorkspaceInvitesSection.tsx` — added `shrink-0 whitespace-nowrap` to invite submit button.
- `apps/web/src/components/AppShell.tsx` — new client shell that conditionally hides the sidebar on public routes.
- `apps/web/src/app/layout.tsx` — uses `AppShell` instead of always rendering `Header` + `Sidebar`.
- `.gitignore` — ignores `visual-qa/node_modules/`, `visual-qa/screenshots/`, and `visual-qa/package-lock.json`.
- `visual-qa/visual-qa.js` — kept the Playwright runner.
- `visual-qa/package.json` — kept the helper manifest.
- `visual-qa/report.md` — this report.

## How each issue was fixed

### 1. Workspace detail page used legacy black buttons / raw form controls
**Fix:** Replaced raw `<button>`, `<input>`, and `<select>` elements in `apps/web/src/app/workspaces/[workspaceId]/page.tsx` with the new `Button`, `Input`, `Select`, `Card`, `Badge`, `EmptyState`, and `PageHeader` primitives. Public/private channel badges now use `Badge variant="success" | "warning"`, role badges use `Badge variant="default" | "info" | "muted"`, and destructive actions use `Button variant="ghost"` with `text-destructive`. Error blocks were converted to the `destructive` token palette.

### 2. "Create Invite link" button wrapped to two lines
**Fix:** Added `shrink-0 whitespace-nowrap` to the submit `Button` in `WorkspaceInvitesSection.tsx`. The flex layout already stacks cleanly on narrow viewports; on desktop the button now stays on one line.

### 3. Channel own-message alignment left too much empty gutter
**Fix:** Removed the `ml-28 sm:ml-44` classes from the own-message bubble wrap in `apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx`. Own messages are now left-aligned like other messages but keep the distinct indigo-tinted bubble styling. The corresponding page tests were updated to assert the margin classes are absent.

### 4. Public auth pages rendered an empty sidebar
**Fix:** Created `AppShell.tsx`, a pathname-aware client shell that hides `Sidebar` on public routes (`/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/confirm-email-change`, `/invites/*`, `/project-status`). `layout.tsx` now renders `Header` and the sidebar/main layout through `AppShell`, so authenticated pages keep the full shell while auth pages feel like standalone screens.

### 5. Visual QA runner/artifacts cleanup
**Fix:** Added `visual-qa/node_modules/`, `visual-qa/screenshots/`, and `visual-qa/package-lock.json` to `.gitignore`. The runner (`visual-qa.js`), manifest (`package.json`), and this report remain tracked; screenshot binaries are not committed.

## Screenshots captured after fixes

All captured against production after the Vercel/Render deploy:

- `01-login.png` — public login page, no empty sidebar.
- `02-dashboard.png` — authenticated dashboard.
- `03-workspace.png` — workspace overview with indigo primary buttons, consistent badges, and unwrapped invite button.
- `04-channel.png` — public channel with messages using normal left alignment (no huge gutter).
- `05-global-search.png` — global message search modal.
- `06-dm.png` — direct message conversation.
- `07-profile-sessions.png` — profile sessions tab.
- `08-mobile-channel.png` — channel on narrow viewport (375×812).

## Tests / checks result

| Check | Result |
|---|---|
| `pnpm --filter web lint` | ✅ passed |
| `pnpm --filter web typecheck` | ✅ passed |
| `pnpm --filter web test` | ✅ 677/677 passed |
| `pnpm --filter web test:pages` | ✅ 239/239 passed |
| `pnpm --filter web build` | ✅ succeeded |
| `pnpm --filter api lint` | ✅ passed |
| `pnpm --filter api typecheck` | ✅ passed |
| `pnpm --filter api test` | ✅ 716/716 passed |
| `pnpm run build:api:prod` | ✅ succeeded |
| `node scripts/smoke-deploy.mjs` | ✅ 10/10 automated checks passed |

## Deployment status

- GitHub Actions CI run `27579098663` for commit `176b3d43f791ab6d9b8544a8a3f8eebcf2b3315d`: **success**.
- CI job "Deploy API v2 to Render": **success**.
- Render API v2 health (`/api/v1/health`): **ok**.
- Vercel production deploy (`https://lets-chat-web.vercel.app`): **200 OK, fresh build**.
- No manual Render deploy was used.

## Remaining visual limitations

None blocking portfolio acceptance. The four reported B193 issues are resolved, and all key authenticated flows render consistently with the B192 design system.
