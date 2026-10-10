# Защита БД и выпуска — 10.10.2026

## Что изменено

- Supabase public business tables: RLS на 87 таблицах, grants PUBLIC/anon/authenticated и public RPC EXECUTE отозваны. Postgres/server Prisma и Storage service_role сохранены. Auth/storage schemas не менялись.
- Реальные anon REST-запросы к User/Session/Order/Project возвращают HTTP 401, SQLSTATE 42501; строк через этот путь не читали. Серверные Prisma-чтения продолжают работать. Это подтверждает закрытие пути, но не доказывает отсутствие исторического доступа третьих лиц.
- Next/eslint-config-next 16.4.0, sharp 0.35.5, undici 7.29.1; SheetJS официальный 0.20.3 вместо устаревшей npm-версии. Импорт .xls сохранён и проверен BIFF8 regression test.
- Транзитивные overrides: @prisma/config -> effect 3.22.2 / deepmerge-ts 8.0.0; defu 6.1.7; ExcelJS -> uuid 11.1.1. Prisma generate, XLSX-экспорт, тесты и сборка проходят. Prisma остаётся 6.19.2, major downgrade/upgrade не делали.
- CI: lint-ratchet, unit tests, production audit, Next build; отдельная пустая PostgreSQL 17.6 с replay всех миграций, drift/access checks и HTTP smoke.
- Vercel build command в vercel.json: npm run build:verified. Он не применяет миграции. GitHub job миграций — дополнительная проверка, а не автоматически настроенная защита ветки или Deployment Check.
- README исправлен: репозиторий сейчас публичный. Его видимость не меняли без отдельного решения владельца.

## Миграции и данные

Consistent pg_dump public/schema + data сохранён в git-ignored data/security/2026-10-10-public.pgdump. Дамп восстановлен в локальную UTF8-БД PostgreSQL 17; count всех 87 таблиц совпал. Это не backup файлов Storage, auth schema или всего Supabase-проекта. ACL/RLS rollback сохранён отдельно: data/security/2026-10-10-public-access-rollback.sql; его применение вернуло бы небезопасные grants.

Историческая миграция 20260615120000_project_estimate_line_internal_expenses имела UTF-8 BOM и не исполнялась на пустой PostgreSQL. BOM удалён; успешной записи для неё в рабочем журнале не было. Остальные 31 успешный checksum сверены с файлами (с учётом CRLF/LF), не переписаны.

Восстановленная копия показала 11 недостающих FK задач. Семь старых checklist rows ссылались на отсутствующий WorkTask. По явному разрешению пользователя эти строки сохранены целиком в maintenance.OrphanedChecklistArchive и удалены из рабочих checklist tables; связанных assignee rows не было. Проекты, заявки и существующие задачи не удалялись. Архив закрыт для Data API, расположен вне public, доступен серверному владельцу. Восстановление — после возвращения валидного parent task; все исходные поля содержатся в rowData.

Additive миграция reconcile_manual_schema добавила валидированные FK, primary-estimate index, переименовала два исторически усечённых индекса и убрала два лишних updatedAt default. Проверена на свежей БД и восстановленной копии перед production. Нативное сравнение колонок/defaults, CHECK/PK/UNIQUE/FK и индексов совпало; порядок enum labels совпадает (численные enumsortorder могут отличаться после ADD VALUE AFTER).

44 отсутствующие/незавершённые записи приняты через официальный prisma migrate resolve --applied после проверки схемы, backup restore, seed categories, creator/assignee/rating invariants. Старые массовые UPDATE цен, rental частей суток, рейтингов, sticker flags и сортировки **не запускались повторно**. Это принятие проверенного актуального состояния, не восстановление исторической хронологии операций. В рабочем журнале теперь 75 успешных записей, незавершённых нет; prisma migrate status: Database schema is up to date; Prisma diff: No difference detected.

Проверенные и принятые записи:

- 20260407183000_project_event_date_range
- 20260408005000_project_contact_sort_order
- 20260408140000_project_archive_note
- 20260408193000_project_demo_draft_order
- 20260408193000_project_estimate_primary_version
- 20260408194000_project_estimate_orderline_nonunique
- 20260408213000_project_contact_categories_and_notifications
- 20260408230000_project_draft_order_target_estimate_version
- 20260408233000_project_draft_order_line_planned_days
- 20260409120000_order_service_internal_costs
- 20260410120000_estimate_section_templates
- 20260428071000_in_app_notification_types
- 20260428083000_browser_push_subscriptions
- 20260428143000_order_discounts
- 20260430120000_rental_part_of_day
- 20260430200000_orders_rental_morning_end
- 20260519120000_item_related_items
- 20260523120000_order_notification_cooldown
- 20260525120000_order_service_payment_methods
- 20260527120000_project_estimate_finance_toggles
- 20260528090000_work_task_archive
- 20260528120000_project_estimate_documents
- 20260601100000_order_hidden_expenses
- 20260602090000_project_estimate_client_charge_tax
- 20260615120000_project_estimate_line_internal_expenses
- 20260818143000_order_client_payment_method
- 20260819110000_greenwich_order_reminders
- 20260820150000_greenwich_loyalty_v2
- 20260820193000_greenwich_monthly_bonuses
- 20260824210000_work_tasks_collaboration
- 20260824234500_work_task_nested_subtasks
- 20260824235500_work_task_sticker_state
- 20260824235900_work_task_multiple_assignees
- 20260825020000_greenwich_confirmation_day_14
- 20260828110000_project_workspace_foundation
- 20260901153000_project_workspace_board_48_columns
- 20260908120000_event_proposal_builder_foundation
- 20261007120000_standalone_proposals_v2
- 20261008120000_proposal_command_receipts
- 20261008193713_project_contractors_roster
- 20261009123000_project_contractor_categories
- 20261010120000_server_only_public_access
- 20261010121500_archive_orphaned_checklist
- 20261010123000_reconcile_manual_schema

Эту процедуру нельзя автоматически повторять для другой существующей базы. Обычный migrate deploy допустим только после проверки target/backup/pending SQL. Скрипт одноразового принятия истории остался вне Git: он привязан к проверенной БД и локальным доказательствам восстановления.

## Подтверждённые проверки

- 330 unit/domain/quality tests, 57 files (включая проверку отсутствия BOM и legacy .xls).
- npm audit --omit=dev: 0 vulnerabilities.
- npm run build:verified: PASS на Node 24.14.1; для этой проверки обе строки БД указывают на недоступный loopback port, не на production.
- Read-only check-db-access: 87 public tables, unprotected 0, API-accessible 0, API-callable 0.
- Supabase Security Advisor больше не сообщает ERROR/WARN по проверенным business tables. Остался INFO [RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) на 88 таблицах (public + private recovery archive): это ожидаемая server-only конфигурация, не повод открывать browser policies.
- HTTP smoke на отдельной локальной БД: настоящий login/password/session cookie, WOWSTORG access, GREENWICH 403, unauth 401, ADD_SECTION/ADD_MANUAL_ITEM, idempotent UUID retry, CAS 409 без перезаписи, export snapshot retry, PDF signature и PPTX ZIP, analytics, logout и запрет старой cookie.
- HTTP smoke не использует mock Prisma/API. Он разрешает только loopback и явно названные disposable databases; отключает внешние Storage/Telegram/cron env, удаляет только свои fixtures. Открытие страницы в браузере, реальные production-фото и Office rendering этим тестом не проверяются.

## Осталось явно, без ложной отметки «готово»

- Полный npm audit содержит 5 high записей dev-цепочки ESLint -> fast-glob/micromatch -> braces 3.0.3. На момент проверки patched braces отсутствует; npm предлагает downgrade Next ESLint, который не применяли. Production graph чист. Не использовать lint-сервис с непроверенными пользовательскими glob patterns; повторно проверять advisory перед следующим обновлением.
- 164 исторические ESLint errors. npm run lint всё ещё красный; lint:ci запрещает увеличение по файлу/правилу и всегда отклоняет parser fatal. Это постепенное устранение долга, не «чистый lint».
- GitHub required branch checks / Deployment Checks и private visibility требуют отдельного административного решения/доступа. Добавление workflow само по себе не блокирует merge.
- Полная мобильная приёмка студии и PPTX в PowerPoint, Google Slides, LibreOffice остаются отдельными acceptance-пунктами. HTTP скачивание/структура файла не равно Office visual smoke.
- Backup Storage и регулярная off-device проверка disaster recovery не настроены этой разовой процедурой; private maintenance archive нужно включать в будущие DB backups.

## Источники решений

[Supabase: защита API](https://supabase.com/docs/guides/api/securing-your-api), [SheetJS: официальный Node package](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [Next 16.4.0](https://github.com/vercel/next.js/releases/tag/v16.4.0), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Архитектурные границы и последствия — ADR 018/019.
