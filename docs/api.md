# API (V1) — контракт

База: Next.js App Router `src/app/api/**/route.ts`

**Полный реестр путей и HTTP-методов** (источник правды, обновлять через скрипт): [`brain/reference/api-inventory.md`](../brain/reference/api-inventory.md). Ниже — смысловой обзор и принципы; при расхождении приоритет у инвентаря.

Общие принципы:

- Мутации, затрагивающие согласованность данных, выполняются через Prisma **`$transaction`** (см. [`brain/reference/prisma-transactions.md`](../brain/reference/prisma-transactions.md)).
- Ошибки уведомлений / генерации документов **не** ломают бизнес-ответ (best-effort); отложенные задачи — [`brain/reference/schedule-after-response.md`](../brain/reference/schedule-after-response.md).
- Авторизация через cookie (httpOnly), без саморегистрации.

## Auth

### `POST /api/auth/login`

Вход по логину/паролю.

### `POST /api/auth/first-login`

Установка пароля при первом входе (flow активации).

### `POST /api/auth/logout`

Снимает сессию.

### `GET /api/auth/me`

Текущий пользователь или `null`.

## Catalog

### `GET /api/catalog/items`

Список позиций и доступность на даты (query-параметры).

### `GET /api/catalog/categories`

### `GET /api/catalog/kits`

## Users (склад)

### `GET /api/users/greenwich`

Список сотрудников Greenwich для выбора в заявке. Только `WOWSTORG`.

## Orders

### `POST /api/orders`

Создание заявки из корзины (`GREENWICH` или `WOWSTORG`).

### `GET /api/orders/my`

Список заявок текущего Greenwich.

### `GET /api/orders/[id]`

Детали заявки (только **GET** в этом файле; правки — отдельные маршруты ниже).

### Редактирование и служебные маршруты заказа

- **`PATCH /api/orders/[id]/greenwich-edit`** — правки со стороны Greenwich.
- **`PATCH /api/orders/[id]/warehouse-edit`** — правки склада.
- **`PATCH /api/orders/[id]/internal-note`** — внутренняя заметка склада.

### Типовые переходы статуса

- `POST .../send-estimate`, `approve`, `request-changes`, `start-picking`, `issue`, `return-declared`, `check-in`, `cancel`, а также quick-supplement и `GET .../estimate` — см. инвентарь.

## Warehouse (очередь и архив)

### `GET /api/warehouse/queue`

### `GET /api/warehouse/archive`

## Инциденты и потери (склад)

Ранее в этом файле ошибочно были указаны `/api/incidents` и `/api/loss/:id`. Фактические маршруты:

### `GET /api/warehouse/incidents`

### `POST /api/warehouse/incidents/[id]/repair`

### `POST /api/warehouse/incidents/[id]/utilize`

### `GET /api/warehouse/losses`

### `POST /api/warehouse/losses/[id]/found`

### `POST /api/warehouse/losses/[id]/write-off`

### `GET /api/warehouse/repair-items`

## Прочее

Дашборды, админка (пользователи, аналитика, Telegram, аудит инвентаря), Greenwich (рейтинг, ачивки, башня), напоминания (`POST /api/reminders/run`), уведомления (`/api/me/notifications`), инвентарь (позиции, фото, пакеты, подборки, «в аренде»), заказчики — см. **[`brain/reference/api-inventory.md`](../brain/reference/api-inventory.md)**.
