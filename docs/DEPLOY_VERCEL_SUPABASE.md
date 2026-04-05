# Деплой: Vercel + Supabase и переносимость

Документ описывает **текущее состояние проекта** `wowstorg_webapp`, что нужно для хостинга на **Vercel** и БД **Supabase (PostgreSQL)**, как **вернуться к локальной разработке**, и **план переезда** на другой хостинг и другой **Postgres** без смены СУБД.

**Важно:** на момент написания приложение **рассчитано на постоянный локальный диск** (`data/…`). Деплой на Vercel в продакшене **потребует доработки** (объектное хранилище для файлов) — ниже перечислено точно по файлам и переменным.

---

## 1. Стек и ограничения (факты из репозитория)

| Компонент | Реализация |
|-----------|------------|
| Фреймворк | **Next.js 16** (`package.json`), App Router, `next.config.ts` по сути пустой |
| БД | **PostgreSQL** через **Prisma** (`prisma/schema.prisma`, `DATABASE_URL`) |
| Аутентификация | Свои **сессии**: таблица `Session`, cookie `wowstorg_session`, `httpOnly`, `secure` в production (`src/server/auth/session.ts`) |
| API | Route Handlers в `src/app/api/**/route.ts` |
| Telegram | `src/server/telegram.ts`: **undici** + опционально прокси (`TELEGRAM_HTTPS_PROXY` и др.), таймауты, `sendTelegramMessageDetailed` |
| Уведомления по заявкам | `src/server/notifications/order-notifications.ts`; отложенная отправка — `src/server/notifications/schedule-after-response.ts` (**`after()`** из `next/server`) |
| Напоминания по расписанию | `POST /api/reminders/run` с заголовком `x-cron-token`, токен `REMINDERS_CRON_TOKEN`; логика в `src/server/reminders/reminder-runner.ts`, таблица **`ReminderSent`** (есть в миграциях, не в `schema.prisma` — см. раздел 6) |

---

## 2. Переменные окружения (полный перечень для прода)

Ниже — всё, что приложение читает из `process.env` в коде (по состоянию репозитория). На Vercel задаются в **Settings → Environment Variables**.

### Обязательные для работы сайта

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | **Pooled** PostgreSQL (Supabase: *Transaction* / порт **6543**, в URI обычно `?pgbouncer=true`) — рантайм и Vercel serverless |
| `DIRECT_URL` | **Direct / session** строка для **миграций** Prisma (Supabase Connect: отдельный URI, часто тот же pooler на порту **5432** или хост `db.<ref>.supabase.co:5432`) |
| `NEXT_PUBLIC_APP_URL` | Публичный URL сайта **без завершающего слэша** — ссылки в Telegram и напоминания (`order-notifications.ts`, `reminder-runner.ts`, quick-supplement). В проде **обязателен**, иначе подставится заглушка `https://wowstorg.example.com` |

### Supabase Storage (фото и сметы)

| Переменная | Назначение |
|------------|------------|
| `SUPABASE_URL` | URL проекта Supabase (`https://<project>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role key (только сервер, не на клиент) |
| `SUPABASE_STORAGE_PHOTOS_BUCKET` | bucket для фото позиций (по умолчанию `item-photos`) |
| `SUPABASE_STORAGE_ESTIMATES_BUCKET` | bucket для смет XLSX (по умолчанию `estimates`) |
| `SUPABASE_STORAGE_PROJECTS_BUCKET` | bucket файлов модуля «Проекты» (по умолчанию `project-files`) |

### Сессии

Cookie с флагом `secure` в **production** (`NODE_ENV === "production"`). На Vercel с HTTPS это нормально. Локально по HTTP cookie работает с `secure: false`.

### Telegram (по необходимости)

| Переменная | Назначение |
|------------|------------|
| `TELEGRAM_BOT_TOKEN` | Токен бота |
| `TELEGRAM_NOTIFICATION_CHAT_ID` / `TELEGRAM_WAREHOUSE_CHAT_ID` | Чат склада |
| `TELEGRAM_NOTIFICATION_TOPIC_ID` / `TELEGRAM_WAREHOUSE_TOPIC_ID` | Топик в форуме |
| `TELEGRAM_SEND_TIMEOUT_MS` | Таймаут HTTP к API (мс), см. `telegram.ts` |
| `TELEGRAM_HTTPS_PROXY` / `TELEGRAM_PROXY` / `HTTPS_PROXY` | Прокси только для запросов к Telegram (undici) |

Подробнее: `docs/telegram-notifications.md`.

### Cron напоминаний

| Переменная | Назначение |
|------------|------------|
| `REMINDERS_CRON_TOKEN` | Секрет для `POST /api/reminders/run`; **без него** эндпоинт отвечает **500** (`REMINDERS_CRON_TOKEN not set`) |

На Vercel: **Cron Jobs** (или внешний ping) с `POST` и заголовком `x-cron-token: <тот же токен>`.

### Prisma / Node

- В `schema.prisma` заданы **`url`** (`DATABASE_URL`, пул) и **`directUrl`** (`DIRECT_URL`) — миграции идут через `DIRECT_URL`, запросы приложения через пул.

---

## 3. Файлы на Vercel (текущее состояние)

Serverless-функции **не имеют постоянного диска**. В текущем коде файлы хранятся в **Supabase Storage** (при наличии `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), а локальный диск `data/...` остаётся только fallback для localhost/dev.

### 3.1 Фото позиций каталога

- **Код:** `src/app/api/inventory/positions/[id]/photo/route.ts`  
  - `GET` — отдача файла по `Item.photo1Key`  
  - `POST` — загрузка до 5 MB, имя файла `{id}-{timestamp}.{ext}`  
  - `DELETE` — удаление файла и обнуление ключа  
- **UI** везде ходит на **`/api/inventory/positions/{id}/photo`** как на картинку (`catalog/page.tsx`, `ItemModal.tsx`, `inventory/positions/[id]/page.tsx`).

Хранилище: Supabase bucket `SUPABASE_STORAGE_PHOTOS_BUCKET`, в БД хранится ключ/путь (`Item.photo1Key`).

### 3.2 Файлы смет (XLSX)

- **Запись:** `src/app/api/orders/[id]/send-estimate/route.ts` — после генерации `buildEstimateXlsx` файл пишется как `{orderId}.xlsx`, в `Order.estimateFileKey` попадает ключ.  
- **Чтение:** `src/app/api/orders/[id]/estimate/route.ts` — `readFileSync` для скачивания сметы (доступ склад или «владелец» Greenwich по заявке).
 - **Служебная генерация:** `src/server/orders/estimate-artifacts.ts` также пишет в Storage.

Хранилище: Supabase bucket `SUPABASE_STORAGE_ESTIMATES_BUCKET`, в БД хранится ключ (`Order.estimateFileKey`).

### 3.3 Отладочный лог уведомлений

- **Файл:** `notification-debug.log` в корне проекта  
- **Код:** `src/server/notifications/order-notifications.ts` (`appendFileSync` + `process.cwd()`).  
- На Vercel бессмысленен/нестабилен; в проде лучше отключить или писать только в `console`.

---

## 4. Поведение, специфичное для деплоя

### 4.1 `after()` и фоновые уведомления

`scheduleAfterResponse` вызывает **`after()`** из `next/server`. На Vercel это поддерживаемый сценарий «после ответа». На **своём Node** (`next start`) тоже работает в рамках Next.js.

### 4.2 `NEXT_PUBLIC_APP_URL` и загрузка модуля

В `order-notifications.ts` базовая ссылка для сайта берётся из `process.env.NEXT_PUBLIC_APP_URL` **при загрузке модуля** (`SITE_LINK`). После смены env на платформе без перезапуска процесса значение может устареть — для прода задавайте URL **до** деплоя или полагайтесь на полный рестарт.

### 4.3 Prisma Client

`src/server/db.ts`: один экземпляр `PrismaClient` с синглтоном в dev. Для Vercel это стандартный паттерн; убедитесь, что в **build** выполняется **`prisma generate`** (через `postinstall` или шаг сборки в Vercel — см. их документацию по Prisma).

### 4.4 Таблица `ReminderSent`

Используется **сым SQL** в `reminder-runner.ts` (`$queryRaw` / `$executeRaw`). Таблица создана миграцией `prisma/migrations/20260319160000_reminders_sent/migration.sql`. В **`schema.prisma` модели нет** — при `prisma migrate` на чистой БД миграции должны примениться **полностью** (все файлы из `prisma/migrations/`).

---

## 5. Пошаговый план: Vercel + Supabase

1. **Supabase**  
   - Создать проект (регион по желанию, EU часто ближе к Vercel).  
   - Взять **Database URL** (postgres).  
   - Применить миграции: `prisma migrate deploy` против этой БД (локально или в CI), либо через Supabase SQL по файлам миграций (предпочтительно стандартный путь Prisma).

2. **Storage buckets**  
   - Создать buckets:
     - `item-photos` (или задать свой в `SUPABASE_STORAGE_PHOTOS_BUCKET`);
     - `estimates` (или задать свой в `SUPABASE_STORAGE_ESTIMATES_BUCKET`);
     - `project-files` для модуля «Проекты» (или задать в `SUPABASE_STORAGE_PROJECTS_BUCKET`).

3. **Vercel**  
   - Подключить репозиторий GitHub.  
   - Framework Preset: Next.js.  
   - Env: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_PHOTOS_BUCKET`, `SUPABASE_STORAGE_ESTIMATES_BUCKET`, `SUPABASE_STORAGE_PROJECTS_BUCKET` (при использовании проектов), секреты Telegram, `REMINDERS_CRON_TOKEN`, `INVENTORY_AUDIT_CRON_TOKEN` и т.д.  
   - Build: убедиться в `prisma generate` + `next build`.  
   - Настроить **Cron**:
     - `POST https://<ваш-домен>/api/reminders/run` с `x-cron-token`,
     - `POST https://<ваш-домен>/api/admin/inventory-audit/cron` с `x-cron-token`.

4. **Домен**  
   - Привязать свой домен в Vercel, выставить `NEXT_PUBLIC_APP_URL` на **https://ваш-домен** (без слэша в конце, как принято в коде ссылок).

5. **Проверка**  
   - Логин, заявки, загрузка фото, смета, Telegram.
   - Отдельный smoke-test из РФ без VPN: открыть каталог и прокликать 20+ карточек (изображения должны грузиться стабильно, без «через раз»).

---

## 6. Как вернуться к localhost (чтобы всё работало как сейчас)

1. **Код не менять** — локально всё уже завязано на `.env` и папки `data/`.  
2. **`.env`** в корне проекта (рядом с `package.json`):  
   - `DATABASE_URL` — на **локальный** PostgreSQL (Docker или установленный), либо на **ту же** облачную БД (для отладки с живыми данными).  
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000` (или ваш порт).  
3. Для локального fallback (без Supabase Storage) создать каталоги:  
   - `data/item-photos`  
   - `data/estimates`  
4. **Миграции:** `npx prisma migrate dev` (или `deploy` к локальной БД).  
5. **Запуск:** `npm run dev` → `http://localhost:3000`.  
6. **Telegram с РФ:** при блокировках использовать VPN или `TELEGRAM_HTTPS_PROXY` к локальному порту прокси (см. `docs/telegram-notifications.md`).  
7. Если тестировали прод и меняли cookie `secure` — локально `NODE_ENV` не `production`, cookie останется без `Secure`.

**Откат с облака на локал:** выгрузить дамп Postgres с Supabase (`pg_dump`) и восстановить локально, скопировать файлы из Storage обратно в `data/…` **если** в проде уже перешли на объектное хранилище — иначе достаточно синхронизировать БД и папки `data`.

---

## 7. План перехода на **другой хостинг** (не Vercel) и **другой Postgres**

Предполагается: **СУБД остаётся PostgreSQL**, Prisma сохраняется.

### 7.1 Другой провайдер PostgreSQL (Neon, RDS, self-hosted)

1. Создать новый инстанс Postgres.  
2. **Остановить запись** в старую БД (режим обслуживания) или сделать логическую репликацию (по опыту команды).  
3. `pg_dump` со старого → `pg_restore` на новый (или миграции с нуля + перенос данных по таблицам).  
4. Обновить **`DATABASE_URL`** на новом хостинге (и локально для dev при необходимости).  
5. Перезапустить приложение.  
6. Проверить: сессии, заявки, cron, Telegram.

**Особенности Supabase → другой Postgres:** нет привязки к Supabase Auth/API — у вас только строка подключения и, отдельно, Storage если использовали.

### 7.2 Другой хостинг приложения (VPS, Railway, Fly.io, Docker)

1. Собрать приложение: `npm ci`, `prisma generate`, `next build`.  
2. Запуск: `next start -p 3000` (или через **Docker** с тем же).  
3. Перед сервером — **reverse proxy** (nginx, Caddy) с TLS.  
4. Env те же, что в разделе 2.  
5. **Cron:** `curl`/systemd timer на `POST /api/reminders/run` с секретом.  
6. **Файлы:** на VPS можно временно оставить `data/` на диске **если** один постоянный сервер и бэкапы; для нескольких инстансов — всё равно нужен общий Storage.

### 7.3 Минимизация привязки к Vercel

- Не использовать уникальные фичи без абстракции (сейчас **`after()`** — это Next.js, не эксклюзив Vercel).  
- Хранилище файлов — за **интерфейсом** (локально / Supabase / S3), чтобы менять провайдера без переписывания UI.

---

## 8. Чеклисты

### Перед первым прод-деплоем (после доработки файлов)

- [ ] `DATABASE_URL` на управляемый Postgres  
- [ ] Все миграции применены  
- [ ] `NEXT_PUBLIC_APP_URL` = реальный HTTPS URL  
- [ ] Telegram env (если нужны уведомления)  
- [ ] `REMINDERS_CRON_TOKEN` + расписание вызова `/api/reminders/run`  
- [ ] Фото и сметы **не** на локальном диске функции  

### Локальная разработка

- [ ] Локальный Postgres или туннель к dev-БД  
- [ ] `.env` с `NEXT_PUBLIC_APP_URL=http://localhost:3000`  
- [ ] Папки `data/item-photos`, `data/estimates`  

---

## 9. Соответствие репозиторию

- **Миграции:** `prisma/migrations/` — **11** файлов `migration.sql`.  
- **Сид:** `prisma/seed.cjs` (указан в `package.json` → `prisma.seed`).  
- **Удалённый репозиторий:** `origin` → `https://github.com/BochkaPiva/wowstorg_webapp.git` (актуальный пуш выполняйте перед релизами по вашему процессу).

Документ можно обновлять после появления реализации Storage и изменений в `schema.prisma` (например `directUrl` для Supabase).
