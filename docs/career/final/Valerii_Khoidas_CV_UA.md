# Валерій Хойдас

**Junior Backend Developer / Junior Full-stack Developer**

---

## Контакти

- **Email:** [mellowin1987@gmail.com](mailto:mellowin1987@gmail.com)
- **Telegram / Телефон:** +380638352650
- **GitHub:** [github.com/Mellowin](https://github.com/Mellowin)
- **Portfolio:** [lets-chat-web.vercel.app](https://lets-chat-web.vercel.app)
- **LinkedIn:** [https://www.linkedin.com/in/valeriy-khoidas-18622290/](https://www.linkedin.com/in/valeriy-khoidas-18622290/)

---

## Про мене

Junior Backend / Full-stack розробник з досвідом створення production full-stack додатків. Спеціалізуюсь на TypeScript, NestJS, Next.js, PostgreSQL. Вмію розбивати задачі на етапи, писати тести, налаштовувати CI/CD і деплоїти продуктові фічі. Використовую AI-інструменти для декомпозиції задач, аналізу коду, дебагінгу, генерації тестових сценаріїв і документації. Результат перевіряю через lint, typecheck, tests, CI/CD і production verification. Шукаю роль у продуктовій команді, де можу розвивати backend і full-stack навички.

---

## Навички

- **Мови:** TypeScript, JavaScript, базовий Python
- **Backend:** NestJS, Node.js, REST API, WebSocket / Socket.io, JWT, RBAC, міграції БД
- **Frontend:** Next.js (App Router), React, Tailwind CSS
- **Бази даних / інфраструктура:** PostgreSQL, Prisma, Redis, Docker, Vercel, Render, Cloudflare
- **Тестування / якість:** Jest, Vitest, Testing Library, Supertest, Playwright
- **Інструменти:** Git, GitHub Actions, Swagger

---

## Проєкти

### LetsChat — production full-stack messenger / collaboration app | 2026

**Live demo:** [lets-chat-web.vercel.app](https://lets-chat-web.vercel.app)  
**Repo:** [github.com/Mellowin/lets-chat-modern-rebuild](https://github.com/Mellowin/lets-chat-modern-rebuild)  
**Stack:** NestJS 11 · PostgreSQL 15 · Prisma · Next.js 16 · React 19 · TypeScript · Tailwind CSS · Socket.io · S3 · GitHub Actions · Render · Vercel

- Розробив NestJS backend з модульною архітектурою (controllers / services / repositories), JWT-авторизацією з ротацією access/refresh токенів, bcrypt-хешуванням і керуванням сесіями.
- Реалізував real-time обмін повідомленнями через Socket.io для каналів, DM і групових чатів; ревалідація членства на кожній події, typing indicators, reactions, replies, read receipts.
- Побудував робочі простори з рольовою моделлю OWNER/ADMIN/MEMBER, приватні канали (404 для не-учасників), групові чати з expiring invite links, контакти та глобальний пошук.
- Забезпечив безпечні файлові вкладення: автентифікований API-проксі для upload/download, валідація MIME/розширень, ліміти розміру, підтримка кириличних імен файлів.
- Додав Web Push сповіщення (VAPID), PWA-встановлення з service worker та offline fallback, EN/UK/RU локалізацію з кириличними username.
- Налаштував CI/CD: GitHub Actions → lint/typecheck/tests/builds → API E2E на PostgreSQL service container → production міграція → Render deploy hook → Vercel frontend deploy; постдеплойні verifiers.

### NotGuilty Legal — комерційний сайт для юридичної компанії | 2026

**Stack:** Next.js · TypeScript · Tailwind CSS · Telegram API · Google Sheets · Resend · Cloudflare · Vercel

- Розробив повноцінний комерційний сайт для юридичної фірми: лендінг, сторінки послуг, форми захоплення лідів.
- Інтегрував Telegram-сповіщення, Google Sheets і Resend для обробки заявок і зворотного зв'язку з клієнтами.
- Реалізував rate limiting, JWT-захищену адмін-панель з прив'язкою до IP, захист від ботів.
- Задеплоїв на Vercel із Cloudflare: швидке завантаження, HTTPS, базове SEO.

### WagerPlay Backend — backend для ігрової платформи | 2026

**Stack:** NestJS · TypeScript · PostgreSQL · Redis · WebSocket · JWT

- Розробив NestJS backend для ігрової платформи: матчмейкинг, WebSocket-ігрові сесії, гаманець і транзакції.
- Спроєктував схему PostgreSQL для користувачів, матчів, ставок і балансу; використовував Redis для кешування і стану.
- Покрив ключові сценарії unit-тестами, налаштував авторизацію і базові заходи безпеки API.

---

## Формат роботи

- Працюю з чіткими задачами та code review; декомпоную фічі на етапи з тестами та верифікаторами.
- Комфортно почуваюсь із production deployment, міграціями БД і постдеплойними перевірками.
- Відкритий до office / remote / hybrid у Києві та remote worldwide.

---

## Мови

- Українська: вільно
- Англійська: A2–B1 / Pre-Intermediate
