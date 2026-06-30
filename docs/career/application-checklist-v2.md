# Application Checklist — v2

> What to send and mention for Junior Backend / Full-stack / AI-assisted roles.

---

## What links to include

Always include:

- **Live demo:** https://lets-chat-web.vercel.app
- **GitHub repo:** https://github.com/Mellowin/lets-chat-modern-rebuild
- **API health:** https://lets-chat-api-v2.onrender.com/api/v1/health
- **CI/CD runs:** https://github.com/Mellowin/lets-chat-modern-rebuild/actions
- **Your LinkedIn profile** (if applying on LinkedIn, it's already there)
- **Your Telegram / email**

Optional:

- Link to a screenshot folder: `docs/portfolio-media/screenshots/`
- Link to `docs/demo-script.md` if they want a self-guided demo

---

## Which resume version to send

| Vacancy type | File |
|---|---|
| Ukrainian-speaking company / Djinni / DOU | `docs/career/resume-ua-v2.md` |
| International / English-speaking company | `docs/career/resume-en-v2.md` |
| Compact one-page CV | Use the 3-bullet LetsChat block from `docs/career/letschat-resume-block.md` |

Convert markdown to PDF/DOCX before sending. Keep it to 1–2 pages.

---

## Which screenshots to use

Use the LetsChat screenshots in `docs/portfolio/screenshots/letschat/` (preferred, 1280×900 desktop / 390×844 mobile) and the earlier set in `docs/portfolio-media/screenshots/`:

**Desktop (`docs/portfolio/screenshots/letschat/desktop-*.png`):**
1. `desktop-01-login` — Login / register
2. `desktop-02-dashboard` — Dashboard / sidebar
3. `desktop-03-direct-list` — Direct messages list
4. `desktop-04-direct-conversation` — Direct message conversation
5. `desktop-05-groups-list` — Groups list
6. `desktop-06-group-conversation` — Group conversation
7. `desktop-07-group-settings` — Group settings / members
8. `desktop-08-contacts` — Contacts page
9. `desktop-09-group-invite-preview` — Invite link flow
10. `desktop-10-channel-attachment` — File attachment message (PNG/XLSX/DOCX cards, Cyrillic filename demo)
11. `desktop-11-profile-notifications` — Profile notifications / push settings
12. `desktop-12-profile-app-install` — Profile App install / PWA section

**Mobile (`docs/portfolio/screenshots/letschat/mobile-*.png`):**
1. `mobile-01-dashboard` — Dashboard / sidebar
2. `mobile-02-direct-conversation` — DM conversation
3. `mobile-03-group-conversation` — Group conversation
4. `mobile-04-contacts` — Contacts page
5. `mobile-05-profile-app-install` — Profile / PWA section

Use only demo/disposable accounts. No real personal data, no tokens, no devtools visible.

---

## Which projects to mention by vacancy

### Backend vacancy

Lead with **LetsChat** and emphasize:

- NestJS + Prisma + PostgreSQL architecture
- JWT auth, session management, RBAC
- Socket.io real-time with membership revalidation
- File attachment security (authenticated proxy, MIME validation)
- 868 API unit tests + E2E on PostgreSQL
- CI/CD, migrations, production verifiers

Mention **WagerPlay Backend** as second project (matchmaking, wallet, transactions).

### Full-stack vacancy

Lead with **LetsChat** and emphasize:

- Full-stack ownership: NestJS backend + Next.js frontend
- Real-time UI with Socket.io
- Responsive design (mobile shell, PWA)
- Auth, file uploads, search, localization
- CI/CD covering both apps

Mention **NotGuilty Legal** as commercial frontend/integration example.

### AI-assisted developer vacancy

Lead with **LetsChat** and emphasize:

- Delivered a production full-stack app using AI tools for decomposition, debugging, tests, and docs
- Validated AI output through strict lint, typecheck, and 1,600+ automated tests
- Clear commit history and documentation

Also mention **NotGuilty Legal** and **WagerPlay Backend** to show breadth.

---

## Before each application

- [ ] Resume converted to PDF/DOCX and named `Khoidas_Valera_[Role].pdf`
- [ ] First line of recruiter message customized for company/role
- [ ] LetsChat live demo loads (wake up backend if needed)
- [ ] GitHub repo link works
- [ ] No placeholder text left in message or resume
- [ ] Screenshots attached if requested

---

## Interview tabs to have open

1. Live app: https://lets-chat-web.vercel.app
2. GitHub repo: https://github.com/Mellowin/lets-chat-modern-rebuild
3. README screenshots
4. Latest green CI run: https://github.com/Mellowin/lets-chat-modern-rebuild/actions
5. Project story: `docs/project-story.md`
6. Demo script: `docs/demo-script.md`

---

## Daily routine

- [ ] Send 5–10 targeted applications
- [ ] Track: company, role, source, date, status, follow-up date
- [ ] Follow up after 5–7 days if no response
- [ ] Wake up backend before demos: https://lets-chat-api-v2.onrender.com/api/v1/health

---

## Tracking template

| Date | Company | Role | Source | Status | Follow-up |
|---|---|---|---|---|---|
| 2026-06-30 | Example Inc | Junior Backend | LinkedIn | Applied | 2026-07-07 |

Use a spreadsheet, Notion table, or markdown file.
