# Использование `prisma.$transaction` (сверка с кодом)

> **Дата сверки:** 2026-09-02 — преобразование независимой сметы защищено расширенным timeout и конфликтом `P2034`.

Файлы, где вызывается **`prisma.$transaction`** (или эквивалент с клиентом транзакции):

| Файл | Serializable |
|------|----------------|
| `src/app/api/admin/loyalty/route.ts` | нет (обновление политики и уровней одним действием) |
| `src/app/api/greenwich/achievements/route.ts` | нет |
| `src/app/api/greenwich/bonuses/route.ts` | нет (единый снимок бонусов, рейтинга и истории) |
| `src/app/api/greenwich/feedback/route.ts` | нет (оценка или пропуск и подавление более старых просьб одним действием) |
| `src/app/api/greenwich/tower-score/route.ts` | нет |
| `src/app/api/inventory/collections/[id]/route.ts` | нет |
| `src/app/api/inventory/packages/[id]/route.ts` | нет |
| `src/app/api/inventory/positions/[id]/route.ts` | нет |
| `src/app/api/orders/route.ts` | **да** |
| `src/app/api/orders/[id]/cancel/route.ts` | нет (отмена и возврат месячного бонуса атомарны; отдельная транзакция достижений в отложенной задаче) |
| `src/app/api/orders/[id]/check-in/route.ts` | нет (две отдельные транзакции в файле) |
| `src/app/api/orders/[id]/dates/route.ts` | **да** (проверка и повторная проверка при применении) |
| `src/app/api/orders/[id]/greenwich-edit/route.ts` | **да** |
| `src/app/api/orders/[id]/issue/route.ts` | нет |
| `src/app/api/orders/[id]/quick-supplement/greenwich/route.ts` | **да** |
| `src/app/api/orders/[id]/quick-supplement/warehouse/route.ts` | **да** |
| `src/app/api/orders/[id]/return-declared/route.ts` | нет |
| `src/app/api/orders/[id]/warehouse-edit/route.ts` | **да** |
| `src/app/api/projects/route.ts` | **да** (проект, участники, стартовые виджеты, папки и activity log создаются одним действием) |
| `src/app/api/projects/[id]/workspace/route.ts` | **да** (owner, members, layout виджетов и revision сохраняются атомарно; timeout 15 с, итоговый снимок читается после commit; конфликт возвращает 409) |
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
| `src/app/api/warehouse/incidents/[id]/repair/route.ts` | нет |
| `src/app/api/warehouse/incidents/[id]/utilize/route.ts` | нет |
| `src/app/api/warehouse/losses/[id]/found/route.ts` | нет |
| `src/app/api/warehouse/losses/[id]/write-off/route.ts` | нет |
| `src/server/ratings/greenwich-bonuses.ts` | нет (идемпотентное начисление, истечение и журнал бонусов) |
| `src/server/orders/approve-estimate.ts` | нет (атомарный захват допустимого статуса и согласование строк для сайта/Telegram) |
| `src/server/orders/declare-return.ts` | нет (атомарный перевод `ISSUED → RETURN_DECLARED`, декларация позиций и событие рейтинга для сайта/Telegram) |
| `src/server/orders/service-feedback.ts` | нет (единая оценка закрытой заявки и подавление старых просьб об оценке) |
| `src/server/reminders/reminder-runner.ts` | нет (идемпотентное начисление месячного бонуса, событие рейтинга и закрытие предупреждения) |

Итого **Serializable** на путях создания/редактирования реальных заявок, переноса дат с пересчётом доступности, создания проектного пространства, materialize demo-черновика проекта и преобразования независимой сметы в полноценный проект (см. ADR 002, ADR 006, ADR 007 и ADR 012).
