# Использование `prisma.$transaction` (сверка с кодом)

> **Дата сверки:** 2026-08-19 — добавлена атомарная отмена заявки из Telegram-подтверждения Greenwich.

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
| `src/app/api/orders/[id]/dates/route.ts` | **да** (проверка и повторная проверка при применении) |
| `src/app/api/orders/[id]/greenwich-edit/route.ts` | **да** |
| `src/app/api/orders/[id]/issue/route.ts` | нет |
| `src/app/api/orders/[id]/quick-supplement/greenwich/route.ts` | **да** |
| `src/app/api/orders/[id]/quick-supplement/warehouse/route.ts` | **да** |
| `src/app/api/orders/[id]/return-declared/route.ts` | нет |
| `src/app/api/orders/[id]/warehouse-edit/route.ts` | **да** |
| `src/app/api/projects/[id]/draft-order/route.ts` | нет |
| `src/app/api/projects/[id]/draft-order/materialize/route.ts` | **да** |
| `src/app/api/projects/[id]/convert/route.ts` | **да** |
| `src/app/api/projects/[id]/estimate/route.ts` | нет (bulk-замена редактируемых разделов, timeout 45 с) |
| `src/app/api/standalone-estimates/route.ts` | нет |
| `src/app/api/standalone-estimates/[id]/estimate/route.ts` | нет |
| `src/app/api/standalone-estimates/[id]/convert/route.ts` | **да** |
| `src/app/api/telegram/webhook/route.ts` | нет (ответ на напоминание + отмена основной и дочерних заявок) |
| `src/app/api/warehouse/incidents/[id]/repair/route.ts` | нет |
| `src/app/api/warehouse/incidents/[id]/utilize/route.ts` | нет |
| `src/app/api/warehouse/losses/[id]/found/route.ts` | нет |
| `src/app/api/warehouse/losses/[id]/write-off/route.ts` | нет |

Итого **Serializable** на путях создания/редактирования реальных заявок, переноса дат с пересчётом доступности, materialize demo-черновика проекта и преобразования независимой сметы в полноценный проект (см. ADR 002, ADR 006 и ADR 007).
