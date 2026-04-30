# Домен (кратко)

Подробности статусов и ролей: [`docs/v1-scope.md`](../../docs/v1-scope.md), схема полей: [`docs/data-model.md`](../../docs/data-model.md).

## Роли (`User.role`)

| Роль | Код | Смысл |
|------|-----|--------|
| Склад / админ Wowstorg | `WOWSTORG` | Полный доступ к очереди, инвентарю, админке, внешним заявкам |
| Сотрудник Greenwich | `GREENWICH` | Каталог со скидкой, свои заявки, согласование сметы, возврат |

Дополнительно у пользователя: **`isActive`**, **`mustSetPassword`**, **`passwordSetAt`** (первый вход / блокировка).

## Источники заявки (`Order.source`)

- **`GREENWICH_INTERNAL`** — внутренняя заявка Greenwich; аренда реквизита считается с коэффициентом **`payMultiplier`** (по умолчанию **0.70** — константа `PAY_MULTIPLIER_GREENWICH` в `src/lib/constants.ts`). Налог **6%** добавляется отдельной строкой ко всему чеку заявки.
- **`WOWSTORG_EXTERNAL`** — заявка склада для внешнего клиента; отдельный флоу (сразу «согласована», смета и т.д., см. `docs/EXTERNAL_ORDER_FLOW_WAREHOUSE.md`).

## Жизненный цикл заявки

Статусы — enum **`OrderStatus`** в Prisma (`SUBMITTED` → … → `CLOSED` / `CANCELLED`). Разрешённые действия зависят от статуса и роли; нельзя добавлять «тихие» обходы статусной машины.

## Остатки и резерв

- У позиции **`Item`**: `total`, `inRepair`, `broken`, `missing`; доступное количество считается в коде.
- **Резерв на даты**: пересечение интервалов `[startDate, endDate]` с активными заявками; количество в резерве — **`issuedQty ?? approvedQty ?? requestedQty`** (как в каталоге и при создании заявки). Реализация: `src/server/orders/reserve.ts`.

## Приёмка и инциденты

- **`ReturnSplit`**: фазы `DECLARED` (что заявил Greenwich) и `CHECKED_IN` (факт склада).
- **`Incident`**, **`LossRecord`** — пост-приёмка; жизненные циклы не ломать без миграции и ADR.

## Даты

- Ввод и бизнес-правила — **date-only** (строки `YYYY-MM-DD` + нормализация к полуночи UTC в серверных хелперах). Часовой пояс для напоминаний и части расчётов — **Омск** (`Asia/Omsk`), см. `src/server/dates.ts` и доки по дашборду.

## Ачивки и рейтинг (Greenwich)

- Прогресс/разблокировки: модели **`AchievementProgress`**, **`AchievementUnlock`**; логика в `src/server/achievements/`.
- Рейтинг: **`GreenwichRating`**; пересчёт при ключевых событиях заявки (см. `docs/PLAN_DASHBOARD_RATING_NOTIFICATIONS.md`).

## Инвентарный аудит

- Снимки расхождений: **`InventoryAuditRun`**, **`InventoryAuditItemResult`**, сервис `src/server/inventory-audit.ts`, cron с токеном (см. `brain/core/constraints.md`).
