# LetsChat Portfolio Screenshots

Production screenshots of the [LetsChat](https://lets-chat-web.vercel.app) full-stack messenger app.

- Captured with Playwright against the live production deployment.
- Uses disposable demo accounts; no real user data, tokens, or devtools are visible.
- Desktop: 1280×900, Mobile: 390×844.

## Desktop

| File | What it shows |
|---|---|
| `desktop-01-login.png` | Login / register page |
| `desktop-02-dashboard.png` | Dashboard and sidebar |
| `desktop-03-direct-list.png` | Direct messages list |
| `desktop-04-direct-conversation.png` | Direct message conversation |
| `desktop-05-groups-list.png` | Groups list |
| `desktop-06-group-conversation.png` | Group conversation |
| `desktop-07-group-settings.png` | Group settings / members |
| `desktop-08-contacts.png` | Contacts page |
| `desktop-09-group-invite-preview.png` | Group invite link flow |
| `desktop-10-channel-attachment.png` | File attachment message with PNG, XLSX and DOCX cards (Cyrillic filename demo) |
| `desktop-11-profile-notifications.png` | Profile notifications / push settings |
| `desktop-12-profile-app-install.png` | Profile App install / PWA section |

## Mobile

| File | What it shows |
|---|---|
| `mobile-01-dashboard.png` | Dashboard / sidebar |
| `mobile-02-direct-conversation.png` | DM conversation |
| `mobile-03-group-conversation.png` | Group conversation |
| `mobile-04-contacts.png` | Contacts page |
| `mobile-05-profile-app-install.png` | Profile / PWA section |

## How they were generated

`scripts/capture-letschat-screenshots.mjs` creates temporary Mail.tm accounts, seeds a workspace, channel, group, contacts and direct messages, then captures the screenshots and cleans up the seeded data.

## Older screenshots

Earlier screenshots are also available in `docs/portfolio-media/screenshots/`.
