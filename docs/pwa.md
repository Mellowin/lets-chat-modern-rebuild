# PWA Installability and Mobile App Shell

## Overview

The web app is now a Progressive Web App (PWA). Users on supported mobile and desktop browsers can install it to their home screen and use it in a standalone app-like shell. Push notifications (B211) continue to work after installation.

## What is implemented

- **`public/manifest.webmanifest`** — installable app manifest with:
  - `name` / `short_name`: "Lets Chat"
  - `start_url`: `/dashboard`
  - `display`: `standalone`
  - theme/background colors matching the current UI
  - 192×192 and 512×512 icons plus maskable variants
- **Icons** — generated from `public/icon.svg`:
  - `public/icons/icon-192x192.png`
  - `public/icons/icon-512x512.png`
  - `public/icons/icon-maskable-192x192.png`
  - `public/icons/icon-maskable-512x512.png`
  - `public/apple-touch-icon.png`
- **Metadata** — `layout.tsx` exposes the manifest, theme color, Apple touch icon, and `apple-mobile-web-app-capable` meta tags.
- **Service worker** (`public/service-worker.js`) now provides:
  - safe app-shell caching for navigation requests;
  - static-asset caching for `/_next/static/` and versioned files;
  - explicit bypass for `/api/`, `/auth/`, and `/uploads/` so private data and tokens are never cached;
  - offline fallback page (`public/offline.html`) shown when a page cannot be fetched;
  - preserved push notification handling from B211.
- **Install UI** — Profile → App install shows:
  - an install button when the browser fires `beforeinstallprompt`;
  - installed/standalone state when detected;
  - manual instructions for browsers that do not expose the prompt;
  - EN/UK/RU translations.

## What is NOT implemented yet

- **Full offline message queue** — sending or receiving messages while offline is not supported. The offline page only explains the state and offers a reload button.
- **Background sync** — unsent messages are not queued for later delivery.
- **Android TWA / Play Market** — this is a PWA-first step. Packaging as a Trusted Web Activity or native wrapper is planned for later.

## Verification

```bash
# PWA manifest / service worker / offline page checks
node scripts/verify-production-pwa.mjs

# Mobile viewport shell QA
node scripts/verify-mobile-shell.mjs

# Push notification regression (requires Playwright + visible browser)
node scripts/verify-production-push-browser.mjs
```

## Known limitations

- iOS Safari does not support the `beforeinstallprompt` event, so the install section shows manual instructions.
- Offline mode shows a static fallback page, not cached channel/DM content.
- Attachment downloads are not cached by the service worker because they may contain private data.
