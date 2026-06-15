# B192 Visual QA Report

Generated: 2026-06-15T21:19:10.029Z
Production: https://lets-chat-web.vercel.app
API: https://lets-chat-api-v2.onrender.com/api/v1

## Seed summary
- Workspace: Visual QA Workspace 1781558310608 (4dfbca4c-1a23-45a3-8f86-5d50e70ed358)
- Channel: #general (2da66017-7b03-40d2-9a31-e4a42c013401)
- Invite: 2578f385-849c-426b-9bb2-f86da0939640
- DM conversation: 671c8868-78a3-403f-b933-494ce39df52d

## Screenshots
- `01-login.png` — public login page
- `02-dashboard.png` — authenticated dashboard with seeded workspace
- `03-workspace.png` — workspace overview (channels, members, invites)
- `04-channel.png` — public channel with message bubbles and composer
- `05-global-search.png` — global message search modal
- `06-dm.png` — direct message conversation
- `07-profile-sessions.png` — profile settings / sessions
- `08-mobile-channel.png` — channel on narrow viewport (375×812)

## Findings

### Required polish (recommend B193)

1. **Workspace detail page uses legacy black buttons / raw form controls**
   - File: `apps/web/src/app/workspaces/[workspaceId]/page.tsx`
   - The "Create" channel button and "Add member" button are rendered with `bg-zinc-900` instead of the new indigo `Button` primary variant used everywhere else (login, dashboard, channel composer, profile, invites).
   - The create-channel inputs/select and add-member inputs/select use hard-coded `border-zinc-300` / `focus:ring-zinc-900` styles instead of the new `Input` / `Select` primitives.
   - Impact: this page visibly breaks the B192 design-system consistency.

2. **"Create Invite link" button wraps to two lines**
   - In `03-workspace.png`, the invite-link creation button shows "Create" on one line and "Invite link" on the next because the flex container is too narrow.
   - Fix: add `whitespace-nowrap` to the button or widen the input/button group.

3. **Channel own-message bubbles have an oversized left margin**
   - In `04-channel.png`, the current user's messages are pushed far right by `ml-28 sm:ml-44`, leaving a large empty gutter on the left.
   - Consider replacing the huge margin with a max-width + `ml-auto` alignment so the chat stays balanced.

### Minor / accepted

4. **Public login page still renders the empty sidebar**
   - `01-login.png` shows the workspace sidebar with "Sign in to see your workspaces". This is functional but could be hidden on public pages for a cleaner centered layout.

5. **Everything else renders correctly**
   - Dashboard cards, channel messages/DM bubbles, global search modal, profile sessions, and mobile channel layout all use the new tokens, rounded corners, and spacing consistently.

