# Portfolio Demo Guide

This guide presents the project to recruiters, hiring managers, or portfolio reviewers. It focuses on the live production deployment and the features that are stable enough to demonstrate.

> **B206 Visual Polish:** All authenticated screens received a final visual pass — modern cards, consistent buttons/badges, polished message bubbles, attachment cards, composer, drag/drop overlay, and mobile layouts. The screenshots in `docs/portfolio-media/screenshots/` were captured after this pass.

---

## Production Links

| Component | URL |
|---|---|
| Frontend | https://lets-chat-web.vercel.app |
| Backend API | https://lets-chat-api-v2.onrender.com/api/v1 |
| WebSocket | wss://lets-chat-api-v2.onrender.com |
| Health | https://lets-chat-api-v2.onrender.com/api/v1/health |

> The backend runs on Render's free tier. If the instance has been idle, the first request may take ~1 minute to wake up. Subsequent requests are fast.

---

## Demo Scenario: Acme Product Team

A ready-made demo workspace is used for screenshots and videos:

- **Workspace:** `Acme Product Team`
- **Channels:**
  - `general` — team announcements and daily chat
  - `design-review` — UI/UX feedback and mockups
  - `release-plan` — release coordination
  - `docs-and-files` — documents and shared files
  - `random` — off-topic conversations
- **Demo users:**
  - `Diana Demova` (workspace owner)
  - `Alex Coder` (workspace member)
- **Sample content:**
  - Short release-planning discussion in `general`.
  - Thread-like reply under a message.
  - PDF release notes.
  - PNG dashboard mockup.
  - XLSX roadmap spreadsheet.
  - DOCX file with a Cyrillic filename (`Український документ.docx`).
  - Direct message conversation between Diana and Alex.

> Demo credentials are not committed publicly. If you need a live demo account, request access from the project owner.

---

## How to Open the Demo

1. Open https://lets-chat-web.vercel.app in a browser.
2. Wait for the backend to wake up if it is cold (check the health endpoint above).
3. Register a new account or log in.
4. Create a workspace, or request access to the prepared demo workspace.

---

## What to Demonstrate

### 1. Authentication

- Register with a Cyrillic username (e.g., `Валера`) and a workspace name like `Моя Команда`.
- Log in/out.
- Open two browser tabs/windows and confirm each tab has its own session (`sessionStorage` isolation).

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
- Permanently delete a channel (workspace OWNER only); verify it disappears from active and archived lists and search.
- Permanently delete a workspace (workspace OWNER only); verify the workspace, its channels, and messages disappear from dashboard, sidebar, direct access, and search.

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
- Try a short query (e.g., `release`) to show scoped search.
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
- Click an image to view it in the lightbox.
- Upload a file with a Cyrillic name to show filename preservation.

### 9. Localization

- Switch the UI language between English, Ukrainian, and Russian from **Profile → Language**.

---

## Suggested Demo Flow (5–7 Minutes)

1. Open the app and register/log in.
2. Create a workspace with a Cyrillic name; show slug transliteration.
3. Create a channel and a DM.
4. Send a few messages, add a reaction, reply to a message, and edit one within 15 minutes.
5. Open a second browser/incognito window with a different user; show real-time updates.
6. Upload a file or image and point out the authenticated download.
7. Demonstrate global search with a short query.
8. Open Profile → Sessions and revoke the other session.
9. Mention silent token refresh and the CI/CD pipeline.

For a scripted recruiter narrative, see [`docs/demo-script.md`](demo-script.md).

---

## Screenshot Checklist

Final screenshots are stored in `docs/portfolio-media/screenshots/`.

### Desktop (1280×900)

- [x] Login page — `desktop/01-login.jpg`
- [x] Dashboard — `desktop/02-dashboard.jpg`
- [x] Workspace overview — `desktop/03-workspace.jpg`
- [x] Channel with messages — `desktop/04-channel-messages.jpg`
- [x] Channel with attachment cards — `desktop/05-channel-attachments.jpg`
- [x] Drag & drop overlay — `desktop/06-drag-drop-overlay.jpg`
- [x] Direct messages — `desktop/07-direct-messages.jpg`
- [x] Profile sessions — `desktop/08-profile-sessions.jpg`
- [x] Global search — `desktop/09-search-results.jpg`

### Mobile (390×844)

- [x] Dashboard — `mobile/01-dashboard.jpg`
- [x] Workspace overview — `mobile/02-workspace.jpg`
- [x] Channel — `mobile/03-channel.jpg`
- [x] Composer — `mobile/04-composer.jpg`
- [x] Attachment card — `mobile/05-attachment-card.jpg`
- [x] Direct messages — `mobile/06-direct-messages.jpg`

### Optional / next captures

- [ ] Registration page with Cyrillic username.
- [ ] Profile language switcher showing EN/UK/RU.
- [ ] Image lightbox.
- [ ] GitHub Actions green run screenshot.
- [ ] Short demo video (60–90 seconds).

---

## Known Demo Limitations

- **Cold start:** The Render free instance may sleep; the first load can take ~1 minute.
- **Email delivery:** Real Gmail delivery only works if the Resend sender domain is verified; otherwise auth emails fall back to console/dev mode.
- **Disposable QA accounts:** Any temporary Mail.tm accounts created during visual QA have no long-lived workspaces or data.

---

## CI/CD Note

The production backend is deployed automatically only after green CI:

```text
push main → GitHub Actions CI → Render Deploy Hook → lets-chat-api-v2 deploy → health ok
```

No manual Render deploy is needed for normal changes.
