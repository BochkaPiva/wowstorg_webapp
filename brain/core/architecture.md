# Архитектура приложения

## Модель запросов

1. Браузер → **Route Handler** (`src/app/api/.../route.ts`) или **Server/Client Component** (`src/app/...`).
2. Защищённые API: **`requireUser()` / `requireRole()`** из `src/server/auth/require.ts`.
3. Доменная логика: **внутри handler-а** и/или в **модулях** `src/server/**` (например `orders/reserve.ts`, `notifications/order-notifications.ts`). Отдельного слоя «сервисов» как в Nest нет — **паттерн = тонкий route + вызовы prisma и хелперов**.

## Данные

- **Prisma Client** — синглтон `src/server/db.ts` (в dev кэш на `globalThis`, в prod новый инстанс на функцию Vercel — нормально для serverless).
- Транзакции: **`prisma.$transaction`**, для конкурентных сценариев с резервом — **`isolationLevel: "Serializable"`** (см. `POST /api/orders` и правки строк заявок).

## Аутентификация

- Сессия в БД: модель **`Session`**, cookie **`wowstorg_session`** (httpOnly, `secure` только в production).
- Реализация: `src/server/auth/session.ts`.

## Файлы (фото, сметы)

- **`src/server/file-storage.ts`**: если заданы `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → Supabase Storage; иначе в development — **`data/item-photos`**, **`data/estimates`**.
- В **production** без Supabase Storage приложение **падает при записи** (явная проверка).

## Фоновые задачи после ответа

- **`scheduleAfterResponse`** (`src/server/notifications/schedule-after-response.ts`) использует **`after()`** из `next/server` для Telegram и т.п., чтобы HTTP-ответ не ждал внешнюю сеть.

## Кэш

- **`getOrSetRuntimeCache`** (`src/server/runtime-cache.ts`) — процессный TTL-кэш для части **read-only** API. Не использовать для данных, где нужна мгновенная согласованность после мутаций.

## Клиент

- Состояние авторизации: **`Providers`** (`src/app/providers.tsx`), `useAuth()`.
- Оболочка приложения: **`AppShell`** (`src/app/_ui/AppShell.tsx`).
- Для `fetch` + `json`: предпочитать **`readJsonSafe`** / **`fetchJson`** из `src/lib/fetchJson.ts` там, где уже принят этот стиль (см. `brain/patterns/client.md`).

## Что не делать без обсуждения

- Вводить второй способ хранения сессий или смешивать JWT и текущую cookie-модель.
- Писать бизнес-логику заказов/остатков **вне** транзакций там, где уже есть транзакционные пути.
