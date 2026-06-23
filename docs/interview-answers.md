# Interview Answers — lets-chat-modern-rebuild

Concise answers in English and Ukrainian for common junior interviews. Keep them natural; do not memorize word-for-word.

---

## 1. Tell me about your project.

**EN:**  
I rebuilt the archived open-source project `lets-chat` into a modern team chat app. It has workspaces, public and private channels, direct messages, file attachments, global search, and session management. The backend is NestJS with PostgreSQL and Prisma, the frontend is Next.js 16 with React and Tailwind CSS, and real-time messaging uses Socket.io. It deploys automatically through GitHub Actions, Render, and Vercel.

**UA:**  
Я переписав архівний open-source проєкт `lets-chat` у сучасний командний чат. У ньому є робочі простори, публічні та приватні канали, особисті повідомлення, файлові вкладення, глобальний пошук і керування сесіями. Backend — NestJS + PostgreSQL + Prisma, frontend — Next.js 16 + React + Tailwind CSS, обмін повідомленнями в реальному часі — Socket.io. Деплой автоматичний через GitHub Actions, Render і Vercel.

---

## 2. What was the hardest part?

**EN:**  
Making private channels truly private. It is easy to block the REST endpoint, but the same rule had to apply to search results and WebSocket events. I ended up returning a 404 to non-members in REST, search, and Socket.io rooms, and revalidating membership on every live event.

**UA:**  
Зробити приватні канали по-справжньому приватними. Легко захистити REST endpoint, але той самий правило мало працювати для результатів пошуку та WebSocket-подій. Я вирішив повертати 404 для не-учасників у REST, пошуку та кімнатах Socket.io, а також перевіряти членство при кожній live-події.

---

## 3. How did you handle authentication?

**EN:**  
I use JWT access tokens and refresh tokens. Access tokens expire in 15 minutes and live in `sessionStorage` per tab. Refresh tokens are stored in PostgreSQL with device metadata and rotated on every refresh. The frontend silently refreshes expired tokens and retries the original request.

**UA:**  
Я використовую JWT access і refresh токени. Access токени дійсні 15 хвилин і зберігаються в `sessionStorage` для кожної вкладки. Refresh токени зберігаються в PostgreSQL з метаданими пристрою і ротуються при кожному оновленні. Frontend тихо оновлює протерміновані токени і повторює оригінальний запит.

---

## 4. How did you handle file uploads securely?

**EN:**  
Files are uploaded through a presigned URL flow and stored in S3-compatible object storage. Downloads go through an authenticated API proxy, so there is no public direct link. The backend validates MIME type, extension, and category-specific size limits before accepting the upload, and it supports Cyrillic filenames.

**UA:**  
Файли завантажуються через presigned URL і зберігаються в S3-сумісному сховищі. Завантаження проходить через авторизований API-проксі, тому публічних прямих посилань немає. Backend перевіряє MIME-тип, розширення та ліміти розміру для категорії файлів перед прийняттям, а також підтримує кириличні імена файлів.

---

## 5. How did you handle roles and permissions?

**EN:**  
Workspaces and channels have OWNER, ADMIN, and MEMBER roles. Destructive actions like workspace delete, channel delete, or archive are owner-only. I enforce authorization in NestJS guards and services, and also revalidate it in WebSocket events so a removed member stops receiving data immediately.

**UA:**  
Робочі простори та канали мають ролі OWNER, ADMIN і MEMBER. Руйнівні дії, як-от видалення робочого простору, каналу або архівація, доступні лише власнику. Авторизацію я перевіряю в guards і services NestJS, а також повторно перевіряю в WebSocket-подіях, щоб видалений учасник одразу припинив отримувати дані.

---

## 6. How does the deploy pipeline work?

**EN:**  
Every push to `main` runs lint, typecheck, unit tests, web page tests, and API E2E tests with a PostgreSQL service container. After that, the workflow migrates the production database and calls the Render deploy hook for the API. Vercel deploys the frontend in parallel. Render Auto-Deploy is disabled, so GitHub Actions is the only automatic deploy path.

**UA:**  
Кожен push у `main` запускає lint, typecheck, unit-тести, сторінкові тести web і API E2E-тести з PostgreSQL service container. Після цього workflow виконує production-міграцію бази даних і викликає Render deploy hook для API. Vercel деплоїть frontend паралельно. Render Auto-Deploy вимкнено, тому GitHub Actions — єдиний автоматичний шлях деплою.

---

## 7. What tests do you have?

**EN:**  
About 1,500 automated tests: 800+ Jest unit tests for the API, 600+ Vitest and Testing Library tests for the frontend, and 7 Supertest E2E security smoke tests. The CI runs all of them on every push.

**UA:**  
Близько 1500 автоматичних тестів: понад 800 Jest unit-тестів для API, понад 600 Vitest і Testing Library тестів для frontend і 7 Supertest E2E security smoke-тестів. CI запускає їх усіх при кожному push.

---

## 8. What would you improve next?

**EN:**  
Add Redis for Socket.io presence so the backend can scale horizontally, add push/browser notifications for mentions, record a short demo video for recruiters, and add cursor-based pagination for very large channels.

**UA:**  
Додати Redis для Socket.io presence, щоб backend міг масштабуватися горизонтально; додати push/браузерні сповіщення для згадувань; записати коротке відео-демо для рекрутерів; додати cursor-based pagination для дуже великих каналів.

---

## 9. What was your biggest mistake during the project?

**EN:**  
Early on I tried to build too many visual features before locking down the data model and auth flow. That caused some rework. I learned to stabilize the core domain — users, workspaces, channels, permissions — first, then build features on top of it.

**UA:**  
Спочатку я намагався зробити забагато візуальних фіч, ще не закріпивши модель даних і авторизацію. Це призвело до переробок. Я зрозумів, що спочатку треба стабілізувати core-домен — користувачі, робочі простори, канали, права доступу — а вже потім будувати функції зверху.

---

## 10. Why should we hire you as a junior?

**EN:**  
I can take a feature from idea to production deployment. This project taught me to think about auth, authorization, testing, CI/CD, and real-world trade-offs, not just tutorials. I am comfortable asking questions, reading documentation, and debugging across the stack.

**UA:**  
Я можу провести фічу від ідеї до production-деплою. Цей проєкт навчив мене думати про авторизацію, права доступу, тестування, CI/CD і реальні компроміси, а не просто проходити туторіали. Я не боюся запитувати, читати документацію і дебажити весь стек.
