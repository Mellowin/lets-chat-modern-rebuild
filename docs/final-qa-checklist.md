# Final QA Checklist — B201 Demo Readiness

This checklist is used for the final portfolio hardening pass before declaring the project demo-ready. Items marked ✅ were verified during B201; items marked ⬜ are known future work.

---

## 1. Production URLs & Smoke

| # | Check | Result |
|---|-------|--------|
| 1.1 | Frontend returns 200 HTML: https://lets-chat-web.vercel.app | ✅ |
| 1.2 | API health returns `status: ok`: https://lets-chat-api-v2.onrender.com/api/v1/health | ✅ |
| 1.3 | `/project-status` page loads on Vercel | ✅ |
| 1.4 | Public auth endpoints return generic success (forgot-password, resend-verification) | ✅ |
| 1.5 | Protected endpoints reject anonymous requests with 401 | ✅ |
| 1.6 | `scripts/smoke-deploy.mjs` passes 10/10 automated checks | ✅ |

**Smoke output (B201):**

```text
Passed: 10/10
```

---

## 2. Test Suite

| Suite | Count | Result |
|-------|-------|--------|
| API unit tests | 745 (34 suites) | ✅ pass |
| Web unit tests | 688 (31 files) | ✅ pass |
| Web page tests | 248 (2 files) | ✅ pass |
| E2E smoke tests | 7 (2 suites) | ⬜ local-only |

**Commands run:**

```bash
pnpm --filter api test
pnpm --filter web test
pnpm --filter web test:pages
```

---

## 3. Lint, Typecheck & Build

| # | Check | Result |
|---|-------|--------|
| 3.1 | API lint | ✅ |
| 3.2 | Web lint | ✅ |
| 3.3 | API typecheck (`tsc --noEmit`) | ✅ |
| 3.4 | Web typecheck (`tsc --noEmit`) | ✅ |
| 3.5 | API build (`nest build`) | ✅ |
| 3.6 | Web build (`next build`) | ✅ |

---

## 4. Documentation Accuracy

| # | Check | Result |
|---|-------|--------|
| 4.1 | `README.md` links to current docs and production URLs | ✅ |
| 4.2 | Test counts in `README.md` match current suite counts (745/688/248) | ✅ |
| 4.3 | Roadmap no longer lists "Silent token refresh" as todo | ✅ |
| 4.4 | `docs/portfolio-demo.md` no longer lists "No silent token refresh" limitation | ✅ |
| 4.5 | `docs/portfolio-demo.md` no longer lists "Old backend" as a demo limitation | ✅ |
| 4.6 | `docs/portfolio-summary.md` mentions B200 silent refresh | ✅ |
| 4.7 | New `docs/demo-script.md` exists with 60-second, 3-minute, security, and interview sections | ✅ |
| 4.8 | `docs/deployment-vercel.md` still correctly treats `lets-chat-api-wa43` as decommissioned | ✅ |

---

## 5. Screenshots & Media

| # | Check | Result |
|---|-------|--------|
| 5.1 | `docs/portfolio-media/` contains 8 optimized PNGs | ✅ |
| 5.2 | Filenames are descriptive: `login.png`, `dashboard.png`, `workspace.png`, `channel.png`, `dm.png`, `global-search.png`, `profile-sessions.png`, `mobile-channel.png` | ✅ |
| 5.3 | Images are not corrupted and load correctly | ✅ |
| 5.4 | `README.md` and `docs/portfolio-summary.md` reference the media folder | ✅ |
| 5.5 | Visual QA throwaway artifacts (`visual-qa/screenshots/`, `visual-qa/package-lock.json`) are gitignored | ✅ |

---

## 6. Repository Hygiene & Secret Scan

| # | Check | Result |
|---|-------|--------|
| 6.1 | `.env` contains only local dev placeholders; no production secrets | ✅ (placeholders only) |
| 6.2 | `.env` is listed in `.gitignore` | ✅ |
| 6.3 | No hardcoded production API keys, JWT secrets, or database passwords in source | ✅ |
| 6.4 | Disposable QA probe scripts no longer commit credentials | ✅ (B201 fix) |
| 6.5 | No `resend_`, `sk-`, `AKIA`, `-----BEGIN`, or disposable account passwords in committed files | ✅ |
| 6.6 | No temporary `tmp-*` files or debug dumps committed | ✅ |

**Notes:**

- The `.env` file is currently tracked in Git but contains only local development defaults (`postgres/postgres`, `minioadmin`, `change-me-in-production...`). It is also listed in `.gitignore`, so newly created `.env` files will not be tracked.
- The old disposable test account `b188-session-test-1781544153@web-library.net` is documented as remaining in production but has no workspaces, DMs, or channel memberships.

---

## 7. CI/CD & Deploy Order

| # | Check | Result |
|---|-------|--------|
| 7.1 | GitHub Actions workflow runs on push to `main` | ✅ |
| 7.2 | Render service `lets-chat-api-v2` has `autoDeploy: false` | ✅ |
| 7.3 | Deploy hook fires only after green CI | ✅ |
| 7.4 | Vercel auto-deploys frontend independently | ✅ |
| 7.5 | Required secrets documented: `PRODUCTION_DATABASE_URL`, `RENDER_API_V2_DEPLOY_HOOK_URL` | ✅ |

**Deploy flow:**

```text
push main
    ↓
GitHub Actions CI (lint, typecheck, tests, builds)
    ↓
Deploy API v2 to Render job → POST Render Deploy Hook
    ↓
Render deploys lets-chat-api-v2
    ↓
GET /api/v1/health → ok
```

---

## 8. B200 Silent Refresh Verification (Post-Deploy)

| # | Check | Result |
|---|-------|--------|
| 8.1 | `AuthProvider` performs startup silent refresh with an expired access token | ✅ (verified via `scripts/verify-b200-browser.mjs`) |
| 8.2 | `authFetch` retries an authenticated request once after 401 | ✅ |
| 8.3 | Shared in-flight `performSilentRefresh` lock prevents double `/auth/refresh` calls | ✅ |
| 8.4 | Refresh failure clears tokens and returns to login UI | ✅ |
| 8.5 | Tokens are not leaked to the browser console | ✅ |

---

## 9. Known Limitations (Accurate & Honest)

- Render free tier cold start (~1 minute after idle).
- E2E tests local-only; CI lacks a PostgreSQL service container.
- Real Gmail delivery requires verified Resend domain; otherwise console/dev mode.
- Presence is in-memory; no Redis Socket.io adapter yet.
- No cursor pagination; limit-based pagination for messages/logs.
- No push/browser notifications.
- No demo video yet; only screenshots.

---

## Sign-off

- **B201 status:** Demo-ready.
- **Last verified:** 2026-06-16
- **Verified by:** Kimi Code CLI
