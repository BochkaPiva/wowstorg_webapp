# API (V1) — контракт

База: Next.js App Router `src/app/api/**/route.ts`

Общие принципы:
- Все мутации выполняются транзакционно (Prisma `$transaction`).
- Ошибки уведомлений/генерации документов **не** ломают бизнес-ответ (best-effort).
- Авторизация через cookie (httpOnly), без саморегистрации.

## Auth
### `POST /api/auth/login`
Вход по логину/паролю.

Request JSON:
- `login: string`
- `password: string`

Response 200 JSON:
- `user: { id, login, displayName, role }`

Ошибки:
- 400: invalid input
- 401: wrong credentials / inactive

### `POST /api/auth/logout`
Снимает сессию.

Response 200 JSON: `{ ok: true }`

### `GET /api/auth/me`
Текущий пользователь.

Response 200 JSON:
- `user: { id, login, displayName, role } | null`

## Catalog
### `GET /api/catalog/items?query=&category=&internalOnly=&startDate=&endDate=&readyByDate=`
Возвращает список позиций + computed availability на выбранные даты.

Response 200 JSON:
- `items: Array<{ id, name, type, pricePerDay, photo1Key?, photo2Key?, buckets, availability }>`

### `GET /api/catalog/categories`
Список категорий/подборок.

### `GET /api/catalog/kits`
Список пакетов (kit + lines).

## Users (склад)
### `GET /api/users/greenwich`
Список сотрудников Greenwich (id, displayName) для выбора «заявка на кого». Только WOWSTORG.

Response 200 JSON: `{ users: Array<{ id, displayName }> }`

## Orders (Greenwich и склад)
### `POST /api/orders`
Создание заказа из корзины. Могут вызывать GREENWICH и WOWSTORG.

Body (общее): customerId, readyByDate, startDate, endDate, eventName?, comment?, deliveryEnabled?, deliveryComment?, deliveryPrice?, montageEnabled?, montageComment?, montagePrice?, demontageEnabled?, demontageComment?, demontagePrice?, lines.

Для WOWSTORG дополнительно: source (`GREENWICH_INTERNAL` | `WOWSTORG_EXTERNAL`), при source=GREENWICH_INTERNAL обязателен greenwichUserId.

### `GET /api/orders/my`
Список “мои заявки”.

### `GET /api/orders/:id`
Детали заказа.

### `PATCH /api/orders/:id`
Редактирование заказа (только пока разрешено статусом).

### `POST /api/orders/:id/send-estimate`
Отправить смету (склад). Только статус SUBMITTED → ESTIMATE_SENT.

### `POST /api/orders/:id/approve`
Согласовать заявку (склад). SUBMITTED или ESTIMATE_SENT → APPROVED_BY_GREENWICH. Body: `{ lines?: [{ orderLineId, approvedQty }] }`.

### `POST /api/orders/:id/issue`
Выдать заказ (склад). APPROVED_BY_GREENWICH или PICKING → ISSUED.

### `POST /api/orders/:id/return-declared`
Greenwich отправил возврат на приёмку. ISSUED → RETURN_DECLARED. Только свой заказ (greenwichUserId).

### `POST /api/orders/:id/check-in`
Складская приёмка. RETURN_DECLARED → CLOSED. Body: `{ lines: [{ orderLineId, condition: "OK"|"NEEDS_REPAIR"|"BROKEN"|"MISSING", qty }] }`.

### `POST /api/orders/:id/cancel`
Отменить заявку. Только статусы SUBMITTED, ESTIMATE_SENT, CHANGES_REQUESTED. Greenwich — свой заказ, склад — любой.

## Warehouse
### `GET /api/warehouse/queue`
Очередь (только актуальные статусы, без CLOSED/CANCELLED).

### `GET /api/warehouse/archive`
Архив (только CLOSED и CANCELLED).

## Incidents / Loss
### `GET /api/incidents`
### `PATCH /api/loss/:id`

