# Паттерн: API Route Handlers

## Расположение

`src/app/api/<area>/.../route.ts` — экспорт именованных функций **`GET`**, **`POST`**, **`PATCH`**, **`DELETE`** по необходимости.

## Авторизация

1. В начале handler-а: **`const auth = await requireUser()`** или **`requireRole("WOWSTORG")`** / **`"GREENWICH"`**.
2. Если `!auth.ok` → **`return auth.response`** (уже `jsonError` с 401/403).

Не дублировать проверку роли строками там, где достаточно `requireRole`.

## Ввод

- Тело JSON: **`await req.json()`** в `try/catch` → при ошибке **`jsonError(400, "Invalid JSON body")`**.
- Валидация: **Zod** (`safeParse` / `parse`), ошибки → **`jsonError(400, "Invalid input", flattened)`** или узкое сообщение по домену.

Используйте общие схемы дат из `src/server/dates.ts` (`DateOnlySchema`, `parseDateOnlyToUtcMidnight`), если речь о полях заявок.

## Ответы

- Успех: **`jsonOk(data)`** из `src/server/http.ts`.
- Ошибка: **`jsonError(status, message, details?)`** — тело **`{ error: { message, details } }`**.
- Доменные ошибки из транзакций (например `CUSTOMER_NOT_FOUND`, `EXCEEDS_AVAILABILITY`, код Prisma **`P2034`**) мапить в **400 / 409** с понятным текстом — как в существующих роутах заказов.

## Где жить логике

- **Валидация и оркестрация** — в route.
- Повторяемые куски — вынести в **`src/server/<domain>/...`** (как `getReservedQtyByItemId`, `makeEstimateArtifactsForOrder`).
- **Не раздувать** route файлы сверх необходимости; но и не вводить лишний слой «Service» без нужды — следовать соседним файлам в той же папке API.

## После успешной мутации

- Если нужны Telegram / тяжёлые побочные эффекты — **`scheduleAfterResponse("имя", async () => { ... })`**, а не блокировать ответ.

## Защищённые cron-эндпоинты

- Сравнение секрета с `process.env.*_CRON_TOKEN` и заголовка (например **`x-cron-token`**). Без токена в env — **500** или отказ, как в текущих роутах.

## См. также

- [`error_handling.md`](./error_handling.md)
- [`prisma.md`](./prisma.md)
- Обзор контрактов: [`docs/api.md`](../../docs/api.md)
