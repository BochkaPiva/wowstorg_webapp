# Реестр HTTP API (сгенерировано из кода)

> **Сгенерировано:** 2026-04-21T07:13:55.688Z  
> **Файлов route.ts:** 92  
> Команда: `npm run brain:inventory`  
> См. также: `brain/reference/README.md` (ручные реестры: prisma-transactions, schedule-after-response).  
> Расхождение других доков с этой таблицей — **ошибка документации**.

| HTTP | Путь (App Router) | Файл |
|------|-------------------|------|
| GET | `/api/admin/analytics/export` | `src/app/api/admin/analytics/export/route.ts` |
| GET | `/api/admin/analytics/profitability` | `src/app/api/admin/analytics/profitability/route.ts` |
| GET | `/api/admin/analytics` | `src/app/api/admin/analytics/route.ts` |
| GET, POST | `/api/admin/inventory-audit/cron` | `src/app/api/admin/inventory-audit/cron/route.ts` |
| POST | `/api/admin/inventory-audit/run` | `src/app/api/admin/inventory-audit/run/route.ts` |
| GET | `/api/admin/inventory-audit/runs/[id]` | `src/app/api/admin/inventory-audit/runs/[id]/route.ts` |
| GET | `/api/admin/inventory-audit/runs` | `src/app/api/admin/inventory-audit/runs/route.ts` |
| GET | `/api/admin/inventory-audit/status` | `src/app/api/admin/inventory-audit/status/route.ts` |
| POST | `/api/admin/order-cleanup/delete` | `src/app/api/admin/order-cleanup/delete/route.ts` |
| GET | `/api/admin/order-cleanup` | `src/app/api/admin/order-cleanup/route.ts` |
| GET, POST | `/api/admin/telegram` | `src/app/api/admin/telegram/route.ts` |
| PATCH | `/api/admin/users/[id]` | `src/app/api/admin/users/[id]/route.ts` |
| GET, POST | `/api/admin/users` | `src/app/api/admin/users/route.ts` |
| POST | `/api/auth/first-login` | `src/app/api/auth/first-login/route.ts` |
| POST | `/api/auth/login` | `src/app/api/auth/login/route.ts` |
| POST | `/api/auth/logout` | `src/app/api/auth/logout/route.ts` |
| GET | `/api/auth/me` | `src/app/api/auth/me/route.ts` |
| GET | `/api/catalog/categories` | `src/app/api/catalog/categories/route.ts` |
| GET | `/api/catalog/items` | `src/app/api/catalog/items/route.ts` |
| GET | `/api/catalog/kits` | `src/app/api/catalog/kits/route.ts` |
| PATCH | `/api/customers/[id]` | `src/app/api/customers/[id]/route.ts` |
| GET, POST | `/api/customers` | `src/app/api/customers/route.ts` |
| GET | `/api/dashboard/greenwich` | `src/app/api/dashboard/greenwich/route.ts` |
| GET | `/api/dashboard/issuance-calendar` | `src/app/api/dashboard/issuance-calendar/route.ts` |
| GET | `/api/dashboard/wowstorg` | `src/app/api/dashboard/wowstorg/route.ts` |
| GET | `/api/greenwich/achievements` | `src/app/api/greenwich/achievements/route.ts` |
| GET | `/api/greenwich/rating` | `src/app/api/greenwich/rating/route.ts` |
| POST | `/api/greenwich/tower-score` | `src/app/api/greenwich/tower-score/route.ts` |
| GET, PATCH, DELETE | `/api/inventory/collections/[id]` | `src/app/api/inventory/collections/[id]/route.ts` |
| GET, POST | `/api/inventory/collections` | `src/app/api/inventory/collections/route.ts` |
| GET | `/api/inventory/in-rent` | `src/app/api/inventory/in-rent/route.ts` |
| GET, PATCH, DELETE | `/api/inventory/packages/[id]` | `src/app/api/inventory/packages/[id]/route.ts` |
| GET, POST | `/api/inventory/packages` | `src/app/api/inventory/packages/route.ts` |
| GET, POST, DELETE | `/api/inventory/positions/[id]/photo` | `src/app/api/inventory/positions/[id]/photo/route.ts` |
| GET, PATCH, DELETE | `/api/inventory/positions/[id]` | `src/app/api/inventory/positions/[id]/route.ts` |
| GET, POST | `/api/inventory/positions` | `src/app/api/inventory/positions/route.ts` |
| GET, PATCH | `/api/me/notifications` | `src/app/api/me/notifications/route.ts` |
| POST | `/api/orders/[id]/approve` | `src/app/api/orders/[id]/approve/route.ts` |
| POST | `/api/orders/[id]/cancel` | `src/app/api/orders/[id]/cancel/route.ts` |
| POST | `/api/orders/[id]/check-in` | `src/app/api/orders/[id]/check-in/route.ts` |
| GET | `/api/orders/[id]/estimate` | `src/app/api/orders/[id]/estimate/route.ts` |
| PATCH | `/api/orders/[id]/greenwich-edit` | `src/app/api/orders/[id]/greenwich-edit/route.ts` |
| PATCH | `/api/orders/[id]/internal-note` | `src/app/api/orders/[id]/internal-note/route.ts` |
| POST | `/api/orders/[id]/issue` | `src/app/api/orders/[id]/issue/route.ts` |
| POST | `/api/orders/[id]/quick-supplement/greenwich` | `src/app/api/orders/[id]/quick-supplement/greenwich/route.ts` |
| GET | `/api/orders/[id]/quick-supplement/parent` | `src/app/api/orders/[id]/quick-supplement/parent/route.ts` |
| POST | `/api/orders/[id]/quick-supplement/warehouse` | `src/app/api/orders/[id]/quick-supplement/warehouse/route.ts` |
| POST | `/api/orders/[id]/request-changes` | `src/app/api/orders/[id]/request-changes/route.ts` |
| POST | `/api/orders/[id]/return-declared` | `src/app/api/orders/[id]/return-declared/route.ts` |
| GET | `/api/orders/[id]` | `src/app/api/orders/[id]/route.ts` |
| POST | `/api/orders/[id]/send-estimate` | `src/app/api/orders/[id]/send-estimate/route.ts` |
| POST | `/api/orders/[id]/start-picking` | `src/app/api/orders/[id]/start-picking/route.ts` |
| PATCH | `/api/orders/[id]/warehouse-edit` | `src/app/api/orders/[id]/warehouse-edit/route.ts` |
| GET | `/api/orders/my` | `src/app/api/orders/my/route.ts` |
| POST | `/api/orders` | `src/app/api/orders/route.ts` |
| POST | `/api/projects/[id]/contacts/[contactId]/entries` | `src/app/api/projects/[id]/contacts/[contactId]/entries/route.ts` |
| PATCH, DELETE | `/api/projects/[id]/contacts/[contactId]` | `src/app/api/projects/[id]/contacts/[contactId]/route.ts` |
| GET, POST, PATCH | `/api/projects/[id]/contacts` | `src/app/api/projects/[id]/contacts/route.ts` |
| POST | `/api/projects/[id]/draft-order/materialize` | `src/app/api/projects/[id]/draft-order/materialize/route.ts` |
| GET, PATCH, DELETE | `/api/projects/[id]/draft-order` | `src/app/api/projects/[id]/draft-order/route.ts` |
| PATCH, DELETE | `/api/projects/[id]/estimate/lines/[lineId]` | `src/app/api/projects/[id]/estimate/lines/[lineId]/route.ts` |
| GET | `/api/projects/[id]/estimate/pdf` | `src/app/api/projects/[id]/estimate/pdf/route.ts` |
| GET, PATCH | `/api/projects/[id]/estimate` | `src/app/api/projects/[id]/estimate/route.ts` |
| POST | `/api/projects/[id]/estimate/sections/[sectionId]/lines` | `src/app/api/projects/[id]/estimate/sections/[sectionId]/lines/route.ts` |
| PATCH, DELETE | `/api/projects/[id]/estimate/sections/[sectionId]` | `src/app/api/projects/[id]/estimate/sections/[sectionId]/route.ts` |
| POST | `/api/projects/[id]/estimate/sections` | `src/app/api/projects/[id]/estimate/sections/route.ts` |
| POST, PATCH, DELETE | `/api/projects/[id]/estimate/versions` | `src/app/api/projects/[id]/estimate/versions/route.ts` |
| GET, DELETE, PATCH | `/api/projects/[id]/files/[fileId]` | `src/app/api/projects/[id]/files/[fileId]/route.ts` |
| PATCH, DELETE | `/api/projects/[id]/files/folders/[folderId]` | `src/app/api/projects/[id]/files/folders/[folderId]/route.ts` |
| POST | `/api/projects/[id]/files/folders` | `src/app/api/projects/[id]/files/folders/route.ts` |
| GET | `/api/projects/[id]/files` | `src/app/api/projects/[id]/files/route.ts` |
| POST | `/api/projects/[id]/files/upload` | `src/app/api/projects/[id]/files/upload/route.ts` |
| GET, PATCH | `/api/projects/[id]` | `src/app/api/projects/[id]/route.ts` |
| PATCH, DELETE | `/api/projects/[id]/schedule/days/[dayId]` | `src/app/api/projects/[id]/schedule/days/[dayId]/route.ts` |
| POST | `/api/projects/[id]/schedule/days/[dayId]/slots` | `src/app/api/projects/[id]/schedule/days/[dayId]/slots/route.ts` |
| GET | `/api/projects/[id]/schedule/export` | `src/app/api/projects/[id]/schedule/export/route.ts` |
| GET, POST, PATCH | `/api/projects/[id]/schedule` | `src/app/api/projects/[id]/schedule/route.ts` |
| PATCH, DELETE | `/api/projects/[id]/schedule/slots/[slotId]` | `src/app/api/projects/[id]/schedule/slots/[slotId]/route.ts` |
| GET, POST | `/api/projects` | `src/app/api/projects/route.ts` |
| POST | `/api/reminders/run` | `src/app/api/reminders/run/route.ts` |
| GET | `/api/users/greenwich` | `src/app/api/users/greenwich/route.ts` |
| GET | `/api/warehouse/archive` | `src/app/api/warehouse/archive/route.ts` |
| POST | `/api/warehouse/incidents/[id]/repair` | `src/app/api/warehouse/incidents/[id]/repair/route.ts` |
| POST | `/api/warehouse/incidents/[id]/utilize` | `src/app/api/warehouse/incidents/[id]/utilize/route.ts` |
| GET | `/api/warehouse/incidents` | `src/app/api/warehouse/incidents/route.ts` |
| POST | `/api/warehouse/losses/[id]/found` | `src/app/api/warehouse/losses/[id]/found/route.ts` |
| POST | `/api/warehouse/losses/[id]/write-off` | `src/app/api/warehouse/losses/[id]/write-off/route.ts` |
| GET | `/api/warehouse/losses` | `src/app/api/warehouse/losses/route.ts` |
| GET | `/api/warehouse/queue` | `src/app/api/warehouse/queue/route.ts` |
| POST | `/api/warehouse/repair-items/[id]/restore` | `src/app/api/warehouse/repair-items/[id]/restore/route.ts` |
| POST | `/api/warehouse/repair-items/[id]/write-off` | `src/app/api/warehouse/repair-items/[id]/write-off/route.ts` |
| GET | `/api/warehouse/repair-items` | `src/app/api/warehouse/repair-items/route.ts` |
