# Использование `prisma.$transaction` (сверка с кодом)

> **Дата сверки:** 2026-04-05 — поиск по `src/**/*.ts`.

Файлы, где вызывается **`prisma.$transaction`** (или эквивалент с клиентом транзакции):

| Файл | Serializable |
|------|----------------|
| `src/app/api/greenwich/achievements/route.ts` | нет |
| `src/app/api/greenwich/tower-score/route.ts` | нет |
| `src/app/api/inventory/collections/[id]/route.ts` | нет |
| `src/app/api/inventory/packages/[id]/route.ts` | нет |
| `src/app/api/inventory/positions/[id]/route.ts` | нет |
| `src/app/api/orders/route.ts` | **да** |
| `src/app/api/orders/[id]/approve/route.ts` | нет |
| `src/app/api/orders/[id]/cancel/route.ts` | нет (вторая транзакция внутри отложенной задачи) |
| `src/app/api/orders/[id]/check-in/route.ts` | нет (две отдельные транзакции в файле) |
| `src/app/api/orders/[id]/greenwich-edit/route.ts` | **да** |
| `src/app/api/orders/[id]/issue/route.ts` | нет |
| `src/app/api/orders/[id]/quick-supplement/greenwich/route.ts` | **да** |
| `src/app/api/orders/[id]/quick-supplement/warehouse/route.ts` | **да** |
| `src/app/api/orders/[id]/return-declared/route.ts` | нет |
| `src/app/api/orders/[id]/warehouse-edit/route.ts` | **да** |
| `src/app/api/warehouse/incidents/[id]/repair/route.ts` | нет |
| `src/app/api/warehouse/incidents/[id]/utilize/route.ts` | нет |
| `src/app/api/warehouse/losses/[id]/found/route.ts` | нет |
| `src/app/api/warehouse/losses/[id]/write-off/route.ts` | нет |

Итого **Serializable** только в пяти order-роутах (см. ADR 002).
