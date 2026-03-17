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

## Orders (Greenwich)
### `POST /api/orders`
Создание заказа из корзины.

### `GET /api/orders/my`
Список “мои заявки”.

### `GET /api/orders/:id`
Детали заказа.

### `PATCH /api/orders/:id`
Редактирование заказа (только пока разрешено статусом).

## Warehouse workflow
### `GET /api/warehouse/queue`
Очередь.

### `POST /api/workflow/:id/send-estimate`
Отправить смету + snapshot + xlsx.

### `POST /api/workflow/:id/approve-by-warehouse`
Запуск сборки / approve (в зависимости от статуса).

### `POST /api/workflow/:id/issue`
Выдать заказ.

### `POST /api/workflow/:id/return-declared`
Greenwich отправил на приёмку (quick/by-line).

### `POST /api/workflow/:id/check-in`
Складская приёмка (финальная).

## Incidents / Loss
### `GET /api/incidents`
### `PATCH /api/loss/:id`

