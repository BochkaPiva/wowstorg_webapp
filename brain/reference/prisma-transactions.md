# Использование `prisma.$transaction` (сверка с кодом)

> **Последнее дополнение:** 2026-10-10 — активация пользователя и отзыв сессий при изменении доступа. Предыдущая общая сверка: 2026-10-07.

Файлы, где вызывается **`prisma.$transaction`** (или эквивалент с клиентом транзакции):

| Файл | Serializable |
|------|----------------|
| `src/app/api/auth/first-login/route.ts` | нет (atomic conditional UPDATE допускает одного победителя; отзыв прежних сессий в той же транзакции) |
| `src/app/api/admin/users/[id]/route.ts` | нет (изменение учётной записи, Telegram-профиля и отзыв сессий одним действием) |
| `src/server/projects/project-contractors.ts` | **да** (состав проекта: archive/тайминг guard, идемпотентное добавление, перенос из КП без перезаписи, CAS-правки и activity log) |
| `src/app/api/admin/loyalty/route.ts` | нет (обновление политики и уровней одним действием) |
| `src/app/api/customers/merge/route.ts` | **да** (перенос заявок, проектов, отдельных смет, временных КП, алиасов и запись журнала выполняются атомарно) |
| `src/app/api/projects/[id]/event-dates/route.ts` | нет (коррекция дат завершённого проекта с CAS по прежним датам и атомарным журналом; архив/статус/резерв не меняются) |
| `src/app/api/customers/route.ts` | нет (проверка идентичности и создание карточки одним действием) |
| `src/app/api/customers/[id]/route.ts` | нет (проверка идентичности, сохранение алиаса и переименование одним действием) |
| `src/app/api/greenwich/achievements/route.ts` | нет |
| `src/app/api/greenwich/bonuses/route.ts` | нет (единый снимок бонусов, рейтинга и истории) |
| `src/app/api/greenwich/feedback/route.ts` | нет (оценка или пропуск и подавление более старых просьб одним действием) |
| `src/app/api/greenwich/tower-score/route.ts` | нет |
| `src/app/api/inventory/collections/[id]/route.ts` | нет |
| `src/app/api/inventory/packages/[id]/route.ts` | нет |
| `src/app/api/inventory/positions/[id]/route.ts` | **да** (2026-09-05: защита остатков от конкурирующих изменений) |
| `src/app/api/orders/route.ts` | **да** |
| `src/app/api/orders/[id]/cancel/route.ts` | **да** (мягкая отмена и возврат месячного бонуса атомарны; поздние складские этапы требуют явного подтверждения освобождения резерва) |
| `src/app/api/orders/[id]/check-in/route.ts` | нет (две отдельные транзакции в файле) |
| `src/app/api/orders/[id]/dates/route.ts` | **да** (проверка и повторная проверка при применении) |
| `src/app/api/orders/[id]/discount-request/reject/route.ts` | **да** (атомарное закрытие только ещё активного запроса скидки) |
| `src/app/api/orders/[id]/force-return-declared/route.ts` | **да** (статус, фактические количества и декларация возврата меняются одним действием) |
| `src/app/api/orders/[id]/greenwich-edit/route.ts` | **да** |
| `src/app/api/orders/[id]/issue/route.ts` | нет |
| `src/app/api/orders/[id]/quick-supplement/greenwich/route.ts` | **да** |
| `src/app/api/orders/[id]/quick-supplement/warehouse/route.ts` | **да** |
| `src/app/api/orders/[id]/return-declared/route.ts` | нет |
| `src/app/api/orders/[id]/warehouse-edit/route.ts` | **да** |
| `src/app/api/projects/route.ts` | **да** (проект, участники, стартовые виджеты, папки и activity log создаются одним действием) |
| `src/app/api/proposals/route.ts` | **да** (обёртка временного КП, дерево, основной вариант и стартовая услуга создаются атомарно) |
| `src/app/api/proposals/[id]/route.ts` | **да** (metadata, customer wrapper, revision и activity log проектного КП) |
| `src/app/api/proposals/[id]/convert/route.ts` | **да** (CAS, создание проекта и перенос существующего дерева без копирования) |
| `src/app/api/proposals/[id]/attach/route.ts` | **да** (CAS, перенос в существующий проект без замены активного КП) |
| `src/server/proposals/mutate.ts` | **да** (единые мутации КП, перестановка разделов и перенос услуг внутри варианта без смены ID, CAS, actor-scoped UUID receipts/hash и серверные compensating deltas для undo/redo; изменения, revision, receipt и log атомарны) |
| `src/app/api/projects/[id]/proposals/[proposalId]/transfer-to-estimate/route.ts` | **да** (идемпотентный перенос со связями, CAS КП и revision сметы; ADR 014) |
| `src/app/api/projects/[id]/workspace/route.ts` | **да** (owner, members, layout виджетов и revision сохраняются атомарно; timeout 15 с, итоговый снимок читается после commit; конфликт возвращает 409) |
| `src/app/api/projects/[id]/workspace/items/batch/route.ts` | **да** (доска: actor-scoped UUID receipt, archive/widget scope, проверки принадлежности восьми типов связанных сущностей проекту, revision CAS, soft-delete и activity log атомарны; осиротевшую ссылку можно только сохранить без подмены) |
| `src/app/api/projects/[id]/draft-order/route.ts` | нет |
| `src/app/api/projects/[id]/draft-order/materialize/route.ts` | **да** |
| `src/app/api/projects/[id]/convert/route.ts` | **да** |
| `src/app/api/projects/[id]/estimate/route.ts` | нет (bulk-замена редактируемых разделов, timeout 45 с) |
| `src/app/api/standalone-estimates/route.ts` | нет |
| `src/app/api/standalone-estimates/[id]/estimate/route.ts` | нет |
| `src/app/api/standalone-estimates/[id]/convert/route.ts` | **да** (перенос версий и создание проекта атомарны; timeout 15 с, `P2034` возвращает 409) |
| `src/app/api/tasks/checklist/[id]/route.ts` | нет (изменение/удаление подзадачи и запись события в журнал атомарны) |
| `src/app/api/tasks/columns/[id]/tasks/route.ts` | нет (создание задачи и первая запись журнала атомарны) |
| `src/app/api/tasks/tasks/[id]/checklist/route.ts` | нет (создание подзадачи и запись события атомарны) |
| `src/app/api/tasks/tasks/[id]/duplicate/route.ts` | нет (задача, подзадачи и первая запись журнала создаются одним действием) |
| `src/app/api/tasks/tasks/[id]/route.ts` | нет (изменение задачи и системные записи журнала атомарны) |
| `src/app/api/telegram/webhook/route.ts` | нет (ответ на напоминание + отмена основной и дочерних заявок + возврат их бонусов) |
| `src/app/api/warehouse/incidents/[id]/repair/route.ts` | **да** (2026-09-05: защита остатков от конкурирующих изменений) |
| `src/app/api/warehouse/incidents/[id]/utilize/route.ts` | **да** (2026-09-05: защита остатков от конкурирующих изменений) |
| `src/app/api/warehouse/losses/[id]/found/route.ts` | **да** (2026-09-05: защита остатков от конкурирующих изменений) |
| `src/app/api/warehouse/losses/[id]/write-off/route.ts` | **да** (2026-09-05: защита остатков от конкурирующих изменений) |
| `src/server/ratings/greenwich-bonuses.ts` | нет (идемпотентное начисление, истечение и журнал бонусов) |
| `src/server/orders/approve-estimate.ts` | нет (атомарный захват допустимого статуса и согласование строк для сайта/Telegram) |
| `src/server/orders/declare-return.ts` | нет (атомарный перевод `ISSUED → RETURN_DECLARED`, декларация позиций и событие рейтинга для сайта/Telegram) |
| `src/server/orders/service-feedback.ts` | нет (единая оценка закрытой заявки и подавление старых просьб об оценке) |
| `src/server/reminders/reminder-runner.ts` | нет (идемпотентное начисление месячного бонуса, событие рейтинга и закрытие предупреждения) |

Итого **Serializable** на путях создания/редактирования реальных заявок, конкурентных статусных действий, переноса дат с пересчётом доступности, создания проектного пространства, materialize demo-черновика проекта и преобразования независимой сметы в полноценный проект (см. ADR 002, ADR 006, ADR 007 и ADR 012).

С 2026-09-05: `src/app/api/warehouse/repair-items/[id]/restore/route.ts` и `write-off/route.ts` используют **Serializable** и проверку ручного остатка за вычетом открытых Incident. GET `src/app/api/warehouse/repair-items/route.ts` читает позиции и случаи в **RepeatableRead**, чтобы сверять один снимок. Подробности: [учёт ремонта](../features/inventory-repair-accounting.md).

С 2026-10-08: `src/server/projects/proposal-export-snapshot.ts` фиксирует неизменяемый клиентский снимок КП в **Serializable** с CAS revision и UUID идемпотентности (maxWait 5 с, timeout 15 с). Фото готовятся до транзакции, внутри повторно проверяются revision и UUID, назначается versionNumber и записывается checksum. HTTP-вход: `src/app/api/proposals/[id]/exports/route.ts`. См. ADR 014/015.
