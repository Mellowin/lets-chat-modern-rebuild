# Portfolio Demo Guide

This guide helps present the project to recruiters, hiring managers, or in a portfolio. It focuses on the live production deployment and the features that are stable enough to demonstrate.

---

## Production Links

| Component | URL |
|-----------|-----|
| Frontend | https://lets-chat-web.vercel.app |
| Backend API | https://lets-chat-api-v2.onrender.com/api/v1 |
| WebSocket | wss://lets-chat-api-v2.onrender.com |
| Health | https://lets-chat-api-v2.onrender.com/api/v1/health |

> **Note:** The backend runs on Render's free tier. If the instance has been idle, the first request may take ~1 minute to wake up. Subsequent requests are fast.

---

## How to Open the Demo

1. Open https://lets-chat-web.vercel.app in a browser.
2. Wait for the backend to wake up if it is cold (the frontend shows a cold-start hint).
3. Register a new account or log in.
4. Verify your email if you want to test email flows (production uses Resend; a verified domain is required for real delivery).

For a quick, repeatable demo, register a throwaway account with a fake email and use the console/dev email mode, or use two browsers/incognito windows to test multi-user real-time behavior.

---

## What to Demonstrate

### 1. Authentication

- Register with a Cyrillic username (e.g., `Валера`) and a workspace name like `Моя Команда`.
- Log in/out.
- Open two browser tabs/windows and confirm each tab has its own session (sessionStorage isolation).

### 2. Workspaces

- Create a workspace.
- Observe automatic transliteration of Cyrillic names to Latin slugs (`Моя Команда` → `moya-komanda`).
- Manage members: change roles (OWNER/ADMIN/MEMBER) and remove members.
- Create public and private invite links; accept an invite in a second browser.

### 3. Channels

- Create channels inside a workspace.
- Create a **private** channel and invite specific workspace members.
- Confirm that a non-member cannot access the private channel (returns 404, no information leakage).
- Archive and restore a channel (OWNER only).

### 4. Real-Time Messaging

- Send messages with **Enter**; use **Shift+Enter** for a new line.
- Edit your own message within 15 minutes.
- Delete a message (soft delete).
- Reply to a message.
- Forward a message to another channel.
- Add/remove emoji reactions.
- Open a second browser with another user and watch messages, edits, deletes, replies, reactions, and typing indicators appear live.

### 5. Direct Messages (DMs)

- Start a 1-to-1 conversation from the DM list.
- Send messages; confirm real-time delivery and read receipts.

### 6. Search

- Use the header search to find messages across all workspaces, channels, and DMs.
- Try a 1-character query (e.g., `к`) to show substring search.
- Click a result to jump to the message in its channel or DM.

### 7. Session Management

- Go to **Profile → Sessions**.
- See all active refresh-token sessions with device metadata.
- The current session is marked and cannot be revoked from the list.
- Click **Revoke all other sessions** and confirm the other browser is signed out while the current one stays active.

### 8. Attachments

- In a channel, click the paperclip or drag-and-drop files into the composer.
- Upload images and non-image files.
- See upload progress, retry on failure, and inline image previews in the message list.
- Click an image to view it (lightbox if implemented).

### 9. Localization

- Switch the UI language between English, Ukrainian, and Russian from the profile settings.

---

## Suggested Demo Flow (5–7 Minutes)

1. Open the app and register/login.
2. Create a workspace with a Cyrillic name; show slug transliteration.
3. Create a channel and a DM.
4. Send a few messages, add a reaction, and edit one message.
5. Open a second browser/incognito window with a different user; show real-time updates.
6. Demonstrate global search with a short query.
7. Open Profile → Sessions and revoke the other session.
8. Mention the CI/CD flow and point to the GitHub Actions / Render setup.

---

## Recommended Screenshots Checklist

Use this list when preparing portfolio visuals. Do not add images to the repo unless explicitly requested.

- [ ] **Login page** — clean auth UI.
- [ ] **Registration page** — Cyrillic username and workspace name.
- [ ] **Workspace overview** — sidebar with channels and DMs.
- [ ] **Channel chat** — messages, reactions, composer.
- [ ] **Reply thread** — reply under a parent message.
- [ ] **Direct message** — 1-to-1 chat.
- [ ] **Global search modal** — search results with source labels.
- [ ] **Profile → Sessions** — session list with current badge and revoke button.
- [ ] **Profile → Language switcher** — EN/UK/RU.
- [ ] **Workspace members / invites** — role management or invite link.
- [ ] **Attachment upload** — file picker or inline image preview.
- [ ] **GitHub Actions CI green** — screenshot of passing `CI` and `Deploy API v2 to Render` jobs.
- [ ] **Render dashboard** — `lets-chat-api-v2` showing Live status (optional).

---

## Known Demo Limitations

- **Cold start:** The Render free instance may sleep; the first load can take ~1 minute.
- **Email delivery:** Real Gmail delivery only works if the Resend sender domain is verified; otherwise auth emails fall back to console/dev mode.
- **No silent token refresh:** If the access token expires while the tab is open, the user is logged out. Refreshing before expiry keeps the session alive.
- **Disposable QA account:** `b188-session-test-1781544153@web-library.net` may still exist in production but has no workspaces, DMs, or channel memberships.
- **Old backend:** `lets-chat-api-wa43.onrender.com` is decommissioned (404) and not used.

---

## CI/CD Note

The production backend is deployed automatically only after green CI:

```text
push main → GitHub Actions CI → Render Deploy Hook → lets-chat-api-v2 deploy → health ok
```

No manual Render deploy is needed for normal changes.
