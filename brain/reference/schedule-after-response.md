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
| `src/app/api/orders/[id]/warehouse-edit/route.ts` | `notifyProjectEstimateFromWarehouseEdit` |
| `src/app/api/projects/[id]/route.ts` | `notifyProjectFieldChanges` |
| `src/app/api/projects/[id]/contacts/route.ts` | `notifyProjectContactCreated` |
| `src/app/api/projects/[id]/contacts/[contactId]/route.ts` | `notifyProjectContactUpdated` |
| `src/app/api/projects/[id]/contacts/[contactId]/entries/route.ts` | `notifyProjectContactEntry` |
| `src/app/api/projects/[id]/draft-order/route.ts` | `notifyProjectDraftOrderUpdated`, `notifyProjectDraftOrderDeleted` |
| `src/app/api/projects/[id]/draft-order/materialize/route.ts` | `notifyProjectDraftMaterialized` |
| `src/app/api/projects/[id]/estimate/route.ts` | `notifyProjectEstimateDraftSaved` |
| `src/app/api/projects/[id]/estimate/versions/route.ts` | `notifyProjectEstimateVersionCreated`, `notifyProjectEstimatePatched`, `notifyProjectEstimateDeleted` |
| `src/app/api/projects/[id]/estimate/sections/route.ts` | `notifyProjectEstimateSectionCreated` |
| `src/app/api/projects/[id]/estimate/sections/[sectionId]/route.ts` | `notifyProjectEstimateSectionUpdated`, `notifyProjectEstimateSectionDeleted` |
| `src/app/api/projects/[id]/estimate/sections/[sectionId]/lines/route.ts` | `notifyProjectEstimateLineCreated` |
| `src/app/api/projects/[id]/estimate/lines/[lineId]/route.ts` | `notifyProjectEstimateLineUpdated`, `notifyProjectEstimateLineDeleted` |
| `src/app/api/projects/[id]/schedule/route.ts` | `notifyProjectScheduleCreated`, `notifyProjectScheduleDraftSaved` |
| `src/app/api/projects/[id]/schedule/days/[dayId]/route.ts` | `notifyProjectScheduleDayUpdated`, `notifyProjectScheduleDayDeleted` |
| `src/app/api/projects/[id]/schedule/days/[dayId]/slots/route.ts` | `notifyProjectScheduleSlotCreated` |
| `src/app/api/projects/[id]/schedule/slots/[slotId]/route.ts` | `notifyProjectScheduleSlotUpdated`, `notifyProjectScheduleSlotDeleted` |
| `src/app/api/projects/[id]/files/upload/route.ts` | `notifyProjectFileUploaded` |
| `src/app/api/projects/[id]/files/[fileId]/route.ts` | `notifyProjectFileDeleted`, `notifyProjectFileRenamed` |
| `src/app/api/projects/[id]/files/folders/route.ts` | `notifyProjectFolderCreated` |
| `src/app/api/projects/[id]/files/folders/[folderId]/route.ts` | `notifyProjectFolderRenamed`, `notifyProjectFolderDeleted` |

Реализация: `src/server/notifications/schedule-after-response.ts` → `after()` из `next/server`.
