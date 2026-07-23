# Админ-аналитика

## Цель
Пересобрать админ-аналитику в управленческий центр с независимыми периодами рабочих контуров и надежными финансовыми формулами.

## Вкладки
- `Сводка`: факт, прогноз, структура финансового результата и управленческие сигналы.
- `Бонусы`: отдельный период, фактический бонусный пул, сумма на человека и отдельный прогноз.
- `Реквизит`: аналитика по закрытым заявкам, рентабельность, ROI, топы и услуги.
- `Проекты`: финансы по сметам, воронка, риски и зависания по статусам.
- `Клиенты`: LTV, повторность, средний чек, маржа, отмены и состав базы.

## Границы
- Не менять бизнес-логику заявок, проектов и смет.
- Не вводить новую таблицу истории статусов в первой итерации.
- Не смешивать факт по заявкам и прогноз по проектным сметам в одну денежную цифру без явной подписи.
- Не ухудшать существующую аналитику реквизита.

## Затронуто
- UI: `src/app/admin/analytics/page.tsx`
- API: `src/app/api/admin/analytics/route.ts`, `src/app/api/admin/analytics/export/route.ts`
- Server: `src/server/admin-analytics.ts`, `src/server/admin-analytics-xlsx.ts`
- Project formulas: `src/server/projects/estimate-read-model.ts`, `src/lib/project-estimate-totals.ts`
- Requisite formulas: `src/server/orders/order-pricing.ts`
- Docs: `docs/ADMIN_ANALYTICS_REDESIGN.md`

## Инварианты
- У каждого рабочего контура собственный период `from/to`; периоды не сбрасывают друг друга.
- `Реквизит` считает факт по `Order.endDate` и только по закрытым заявкам для денежных KPI.
- `Проекты` считают прогноз по основной версии проектной сметы.
- `CANCELLED` проекты не входят в финансовый прогноз, но остаются в метриках отмен и воронке.
- Проектная выручка/маржа считается теми же helper-формулами, что проектная смета и XLSX.
- Метрики времени в статусах считаются только по `ProjectActivityLog`; точность явно подписывается в UI.
- Excel-экспорт должен использовать тот же read-model, что UI.

## Приёмка
- [ ] Есть рабочие контуры `Сводка`, `Бонусы`, `Реквизит`, `Проекты`, `Клиенты`.
- [ ] У каждого контура свой период, который сохраняется при переключении вкладок.
- [ ] Есть общий XLSX за период сводки с листами по разделам.
- [ ] `Реквизит`, `Заказчики`, `Проекты` скачиваются отдельными XLSX.
- [ ] Факт по реквизиту совпадает с текущей аналитикой после внедрения.
- [ ] Проектные суммы совпадают с проектной сметой/XLSX на тестовых проектах.
- [ ] Метрики статусов проекта имеют tooltip с источником `ProjectActivityLog`.

## Ссылки
- `docs/ADMIN_ANALYTICS_REDESIGN.md`

## Update 2026-05-25: finance ownership
- Standalone order finance in admin analytics means `Order.projectId = null`.
- If an order is linked to a project, its revenue, services, tax/profit signal and customer contribution belong to the project side and are excluded from standalone requisites analytics.
- Overview separates fact from forecast: fact is standalone closed orders plus completed projects; forecast is standalone active orders plus active non-archived projects.
- Bonuses in overview are calculated as 15% of profit and split between 2 people.
- Project period filtering uses event dates (`eventStartDate` / `eventEndDate`) and includes projects whose event interval intersects the selected period.

## Update 2026-05-25: director XLSX
- The global XLSX export is a finance report, not an operational signal dump.
- Global export sheets: `Обзор`, `Факт и прогноз`, `Динамика`, `Заявки`, `Проекты`, `Заказчики`, `Методология`.
- Project risk/status-aging sheets are intentionally excluded from the global report.
- `Динамика` shows month-by-month fact and month-over-month comparison when the selected period contains several months.

## Update 2026-07-23: independent analytics workspaces

- The UI is split into five workspaces: overview, bonuses, requisites, projects, and customers.
- Each workspace owns its `from/to` period in client state. Changing one period must not reset the others.
- Bonuses use a dedicated period and are not presented as part of the overview period.
- Bonus fact is still 15% of actual profit, split between 2 recipients. Forecast is displayed separately and is not an accrued amount.
- Overview and requisites include a lightweight monthly revenue/profit timeline; no heavy chart dependency is introduced.
- Existing API formulas and XLSX formulas remain the source of truth. The redesign changes information architecture, not order or project economics.
