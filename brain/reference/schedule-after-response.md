# `scheduleAfterResponse` — где вызывается (сверка с кодом)

> **Дата сверки:** 2026-04-05 — импорт/вызов в `src/app/api`.

| Файл | Имя задачи (1-й аргумент) |
|------|---------------------------|
| `src/app/api/orders/route.ts` | `notifyOrderCreated` |
| `src/app/api/orders/[id]/approve/route.ts` | `notifyEstimateApproved` |
| `src/app/api/orders/[id]/cancel/route.ts` | `notifyOrderCancelled`, `recomputeGreenwichAchievementsOnCancel` |
| `src/app/api/orders/[id]/check-in/route.ts` | `notifyCheckInClosed`, `recomputeGreenwichAchievementsOnClosed` |
| `src/app/api/orders/[id]/greenwich-edit/route.ts` | `notifyGreenwichEdited` |
| `src/app/api/orders/[id]/issue/route.ts` | `notifyIssued` |
| `src/app/api/orders/[id]/quick-supplement/greenwich/route.ts` | `quick-supplement-greenwich-telegram` |
| `src/app/api/orders/[id]/quick-supplement/warehouse/route.ts` | `quick-supplement-warehouse-telegram` |
| `src/app/api/orders/[id]/request-changes/route.ts` | `notifyChangesRequested` |
| `src/app/api/orders/[id]/return-declared/route.ts` | `notifyReturnDeclared` |
| `src/app/api/orders/[id]/send-estimate/route.ts` | `notifyEstimateSent` |
| `src/app/api/orders/[id]/start-picking/route.ts` | `notifyStartPicking` |

Реализация: `src/server/notifications/schedule-after-response.ts` → `after()` из `next/server`.
