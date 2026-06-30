# Валерій Хойдас — Junior Backend / Full-stack Developer

**Роль:** Junior Backend Developer · Junior Full-stack Developer · TypeScript / Node.js Developer

**Контакти:**
- Email: [mellowin1987@gmail.com](mailto:mellowin1987@gmail.com)
- Telegram / Телефон: +380638352650
- GitHub: https://github.com/Mellowin
- LinkedIn: https://www.linkedin.com/in/valeriy-khoidas-18622290/
- Portfolio: https://lets-chat-web.vercel.app

---

## Про мене

Junior-розробник з досвідом створення production full-stack додатків. Спеціалізуюсь на TypeScript, NestJS, Next.js, PostgreSQL та Redis. Вмію розбивати задачі на етапи, писати тести, налаштовувати CI/CD і деплоїти продуктові фічі. Відповідально використовую AI-інструменти для декомпозиції задач, генерації тестів, дебагінгу та документації, завжди перевіряю результат через lint, typecheck і тести. Шукаю роль у продуктовій команді, де можу розвивати backend і full-stack навички.

---

## Ключові навички

- **Мови:** TypeScript, JavaScript, базовий Python
- **Backend:** NestJS, Node.js, REST API, WebSocket / Socket.io, JWT, RBAC, міграції БД
- **Frontend:** Next.js (App Router), React, Tailwind CSS
- **Бази даних / інфраструктура:** PostgreSQL, Prisma, Redis, Docker, Vercel, Render, Cloudflare
- **Тестування / якість:** Jest, Vitest, Testing Library, Supertest, Playwright
- **Інструменти:** Git, GitHub Actions, Swagger, AI-assisted development tools

---

## Проєкти

### LetsChat — production full-stack messenger / collaboration app | 2026

**Live demo:** https://lets-chat-web.vercel.app  
**Repo:** https://github.com/Mellowin/lets-chat-modern-rebuild  
**Stack:** NestJS 11 · PostgreSQL 15 · Prisma · Next.js 16 · React 19 · TypeScript · Tailwind CSS · Socket.io · S3 · GitHub Actions · Render · Vercel

- Розробив NestJS backend з модульною архітектурою (controllers / services / repositories), JWT-авторизацією з ротацією access/refresh токенів, bcrypt-хешуванням і керуванням сесіями.
- Реалізував real-time обмін повідомленнями через Socket.io для каналів, DM і групових чатів; ревалідація членства на кожній події, typing indicators, reactions, replies, read receipts.
- Побудував робочі простори з рольовою моделлю OWNER/ADMIN/MEMBER, приватні канали (404 для не-учасників на REST/WebSocket/пошуку), групові чати з expiring invite links, приватний список контактів і глобальний пошук.
- Забезпечив безпечні файлові вкладення: автентифікований API-проксі для upload/download, валідацію MIME/розширень, ліміти розміру і підтримку кириличних імен файлів.
- Додав Web Push сповіщення (VAPID), PWA-встановлення з service worker та offline fallback, EN/UK/RU локалізацію з кириличними username.
- Налаштував CI/CD: GitHub Actions → lint/typecheck/tests/builds → API E2E на PostgreSQL service container → production міграція → Render deploy hook → Vercel frontend deploy; постдеплойні verifiers перевіряють auth, permissions, attachments, groups, contacts, safety.

### NotGuilty Legal — комерційний сайт для юридичної компанії | 2025

**Stack:** Next.js · TypeScript · Tailwind CSS · Telegram API · Google Sheets · Resend · Cloudflare · Vercel

- Розробив повноцінний комерційний сайт для юридичної фірми: лендінг, сторінки послуг, форми захоплення лідів.
- Інтегрував Telegram-сповіщення, Google Sheets і Resend для обробки заявок і зворотного зв'язку з клієнтами.
- Реалізував rate limiting, JWT-захищену адмін-панель з прив'язкою до IP, захист від ботів.
- Задеплоїв на Vercel із Cloudflare: досягнув швидкого завантаження, HTTPS і базового SEO.

### WagerPlay Backend — backend для ігрової платформи | 2025

**Stack:** NestJS · TypeScript · PostgreSQL · Redis · WebSocket · JWT

- Розробив NestJS backend для ігрової платформи: матчмейкинг, WebSocket-ігрові сесії, гаманець і транзакції.
- Проєктував схему PostgreSQL для користувачів, матчів, ставок і балансу; використовував Redis для кешування і стану.
- Покрив ключові сценарії unit-тестами, налаштував авторизацію і базові заходи безпеки API.

### JSON ↔ CSV Converter — утиліта для конвертації даних | 2024

**Stack:** TypeScript / Node.js · CLI

- Створив CLI-утиліту для двосторонньої конвертації JSON ↔ CSV з валідацією структури і підтримкою великих файлів.
- Реалізував стрімінгове читання для зменшення використання пам'яті та обробку помилок із зрозумілими повідомленнями.

---

## Формат роботи

- Працюю з чіткими задачами та code review; декомпоную фічі на етапи з тестами та верифікаторами.
- Комфортно почуваюсь із production deployment, міграціями БД і постдеплойними перевірками.
- Відповідально використовую AI-інструменти для прискорення розробки, але фінальна якість завжди перевіряється тестами, lint і typecheck.
- Відкритий до office / remote / hybrid у Києві та remote worldwide.

---

## Освіта / додатково

- [Укажіть освіту або курси, якщо бажаєте]
- Англійська: A2–B1 / Pre-Intermediate
- Українська: вільно
