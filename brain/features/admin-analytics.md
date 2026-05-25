# Админ-аналитика

## Цель
Пересобрать админ-аналитику в управленческий дашборд с одним глобальным периодом, четырьмя вкладками и надежными финансовыми формулами.

## Вкладки
- `Обзор`: основные KPI, факт по реквизиту, прогноз по проектам, риски и быстрые управленческие сигналы.
- `Реквизит`: текущая фактическая аналитика по закрытым заявкам, рентабельность, ROI, топы и услуги.
- `Заказчики`: ценность клиентов через проекты и заявки: LTV, повторность, средний чек, маржа, отмены.
- `Проекты`: сухие метрики, финансы по сметам, воронка, риски, зависания по статусам.

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
- Один глобальный период `from/to` на всю страницу.
- `Реквизит` считает факт по `Order.endDate` и только по закрытым заявкам для денежных KPI.
- `Проекты` считают прогноз по основной версии проектной сметы.
- `CANCELLED` проекты не входят в финансовый прогноз, но остаются в метриках отмен и воронке.
- Проектная выручка/маржа считается теми же helper-формулами, что проектная смета и XLSX.
- Метрики времени в статусах считаются только по `ProjectActivityLog`; точность явно подписывается в UI.
- Excel-экспорт должен использовать тот же read-model, что UI.

## Приёмка
- [ ] Есть вкладки `Обзор`, `Реквизит`, `Заказчики`, `Проекты`.
- [ ] Нет локальных date-фильтров у секций.
- [ ] Есть общий XLSX за глобальный период с листами по разделам.
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
