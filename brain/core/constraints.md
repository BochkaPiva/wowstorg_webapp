# Ограничения и инварианты (нельзя нарушать легкомысленно)

## Безопасность и секреты

- **Не коммитить** `.env`, ключи Supabase, Telegram, cron-токены. В репозитории — только [`.env.example`](../../.env.example).
- **`SUPABASE_SERVICE_ROLE_KEY`** только на сервере; никогда в `NEXT_PUBLIC_*`.

## База данных

- Любое изменение схемы → **миграция Prisma** + при необходимости обновление сида и доков. На проде: **`prisma migrate deploy`** к той же БД, что и `DATABASE_URL` на Vercel.
- Таблица **`ReminderSent`** используется через **raw SQL** в `reminder-runner.ts`; модели в `schema.prisma` может не быть — миграции должны применяться полностью.

## Заказы и конкурентность

- Создание заявки и правки с пересчётом резерва — **Serializable** + обработка **`P2034`** (клиенту часто **409** / сообщение «повторите»). Не убирать изоляцию «ради скорости» без анализа гонок.

## Уведомления

- Telegram и прочие уведомления — **best-effort**; ошибки доставки **не должны** откатывать успешный бизнес-ответ. Паттерн: `scheduleAfterResponse` + `try/catch` / `void` с логом.

## Production storage

- **`NODE_ENV === "production"`** без настроенного Supabase Storage для загрузки файлов → ошибка конфигурации (см. `file-storage.ts`). Это ожидаемо.

## Переменные окружения (полный список из кода)

| Переменная | Где используется |
|------------|------------------|
| `DATABASE_URL` | Prisma |
| `NODE_ENV` | Next / prisma log / cookie secure / storage |
| `NEXT_PUBLIC_APP_URL` | Ссылки в уведомлениях, напоминаниях, quick-supplement |
| `SUPABASE_URL` | Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage |
| `SUPABASE_STORAGE_PHOTOS_BUCKET` | Имя bucket фото (default `item-photos`) |
| `SUPABASE_STORAGE_ESTIMATES_BUCKET` | Имя bucket смет (default `estimates`) |
| `TELEGRAM_BOT_TOKEN` | `telegram.ts` |
| `TELEGRAM_NOTIFICATION_CHAT_ID` / `TELEGRAM_WAREHOUSE_CHAT_ID` | Чат склада |
| `TELEGRAM_NOTIFICATION_TOPIC_ID` / `TELEGRAM_WAREHOUSE_TOPIC_ID` | Топик в форуме |
| `TELEGRAM_GREENWICH_CHAT_ID` | Опционально |
| `TELEGRAM_SEND_TIMEOUT_MS` | Таймаут |
| `TELEGRAM_HTTPS_PROXY` / `TELEGRAM_PROXY` / `HTTPS_PROXY` | Прокси для Telegram в РФ |
| `REMINDERS_CRON_TOKEN` | `POST /api/reminders/run` (заголовок `x-cron-token`) |
| `INVENTORY_AUDIT_CRON_TOKEN` | Cron аудита |
| `INVENTORY_AUDIT_RETENTION_DAYS` | Хранение записей аудита (default 21) |
| `SEED_*` | Только `prisma/seed.cjs` (логины/пароли тестовых пользователей) |

## Продуктовые «не ломать»

- Два источника заявок и разная семантика цены (**Greenwich 0.76** vs полная цена).
- Разделение прав **Greenwich только свои заявки** там, где это уже зашито в API.
