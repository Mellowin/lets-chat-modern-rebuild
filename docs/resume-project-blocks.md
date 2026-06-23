# Resume Project Blocks — lets-chat-modern-rebuild

Ready-to-copy project blocks for CVs in English, Ukrainian, and Russian. Pick the language that matches your application.

---

## English

**Secure Collaboration Platform / Lets Chat**  
*Full-stack real-time team chat application (Slack-like) rebuilt from the archived `lets-chat` open-source project.*

**Tech stack:** NestJS, PostgreSQL, Prisma, Next.js 16, React 19, TypeScript, Tailwind CSS, Socket.io, S3-compatible storage, GitHub Actions, Render, Vercel.

- Built a workspace-based collaboration app with public/private channels, direct messages, and real-time messaging via Socket.io rooms.
- Developed a NestJS REST API and a Next.js frontend, handling auth, channels, messages, search, and file attachments end-to-end.
- Implemented JWT access/refresh token rotation with bcrypt hashing and per-tab session storage; users can view and revoke active sessions.
- Designed role-based access control (OWNER/ADMIN/MEMBER) with owner-only destructive actions enforced at REST and WebSocket layers.
- Built secure file attachments with authenticated API proxy uploads and downloads, MIME-type validation, size limits, and Cyrillic filename support.
- Added global message search across workspaces, channels, and DMs with highlighting and jump-to-message.
- Set up CI/CD with GitHub Actions: lint, typecheck, tests, API E2E tests with PostgreSQL, production migrations, Render deploy hook, and Vercel frontend deploy.

**Live demo:** https://lets-chat-web.vercel.app  
**Repo:** https://github.com/Mellowin/lets-chat-modern-rebuild

---

## Українська

**Secure Collaboration Platform / Lets Chat**  
*Повноцінний веб-додаток для командного чату в реальному часі (як Slack), переписаний на основі архівного open-source проєкту `lets-chat`.*

**Стек:** NestJS, PostgreSQL, Prisma, Next.js 16, React 19, TypeScript, Tailwind CSS, Socket.io, S3-сумісне сховище, GitHub Actions, Render, Vercel.

- Розробив повноцінний додаток для співпраці на основі робочих просторів із публічними/приватними каналами, особистими повідомленнями та обміном повідомленнями в реальному часі через Socket.io rooms.
- Створив NestJS REST API та Next.js frontend, реалізувавши авторизацію, канали, повідомлення, пошук і файлові вкладення від початку до кінця.
- Реалізував JWT access/refresh токени з ротацією, bcrypt-хешуванням і сесіями в sessionStorage; користувачі можуть переглядати та відкликати активні сесії.
- Побудував рольову модель доступу (OWNER/ADMIN/MEMBER) із діями, що руйнують дані, доступними лише власнику, на рівні REST та WebSocket.
- Реалізував безпечні файлові вкладення через авторизований API-проксі: перевірку MIME-типу, ліміти розміру та підтримку кириличних імен файлів.
- Додав глобальний пошук повідомлень у робочих просторах, каналах і особистих листуваннях із підсвічуванням і переходом до повідомлення.
- Налаштував CI/CD через GitHub Actions: lint, typecheck, тести, API E2E-тести з PostgreSQL, production-міграції, Render deploy hook і деплой frontend на Vercel.

**Live demo:** https://lets-chat-web.vercel.app  
**Репозиторій:** https://github.com/Mellowin/lets-chat-modern-rebuild

---

## Русский

**Secure Collaboration Platform / Lets Chat**  
*Полноценное веб-приложение для командного чата в реальном времени (как Slack), переписанное на основе архивного open-source проекта `lets-chat`.*

**Стек:** NestJS, PostgreSQL, Prisma, Next.js 16, React 19, TypeScript, Tailwind CSS, Socket.io, S3-совместимое хранилище, GitHub Actions, Render, Vercel.

- Разработал полноценное приложение для совместной работы на основе рабочих пространств с публичными/приватными каналами, личными сообщениями и обменом сообщениями в реальном времени через Socket.io rooms.
- Создал NestJS REST API и Next.js frontend, реализовав авторизацию, каналы, сообщения, поиск и файловые вложения end-to-end.
- Реализовал JWT access/refresh токены с ротацией, bcrypt-хешированием и сессиями в sessionStorage; пользователи могут просматривать и отзывать активные сессии.
- Построил ролевую модель доступа (OWNER/ADMIN/MEMBER) с действиями, разрушающими данные, доступными только владельцу, на уровне REST и WebSocket.
- Реализовал безопасные файловые вложения через авторизованный API-прокси: проверку MIME-типа, лимиты размера и поддержку кириллических имён файлов.
- Добавил глобальный поиск сообщений в рабочих пространствах, каналах и личных переписках с подсветкой и переходом к сообщению.
- Настроил CI/CD через GitHub Actions: lint, typecheck, тесты, API E2E-тесты с PostgreSQL, production-миграции, Render deploy hook и деплой frontend на Vercel.

**Live demo:** https://lets-chat-web.vercel.app  
**Репозиторий:** https://github.com/Mellowin/lets-chat-modern-rebuild
