# Архитектурные решения (ADR)

Короткие записи: **контекст → решение → последствия**. Номер фиксирован; новые темы — следующий свободный номер.

| # | Файл | Тема |
|---|------|------|
| 001 | [001-storage-supabase-prod-local-data.md](./001-storage-supabase-prod-local-data.md) | Файлы: Supabase vs `data/` |
| 002 | [002-serializable-inventory-critical.md](./002-serializable-inventory-critical.md) | Serializable для резерва |
| 003 | [003-session-cookie-db.md](./003-session-cookie-db.md) | Сессии cookie + БД |
| 004 | [004-deferred-notifications.md](./004-deferred-notifications.md) | Уведомления через `after()` |
| 005 | [005-order-status-enums.md](./005-order-status-enums.md) | Enum статусов в Prisma |
| 006 | [006-project-demo-draft-requisition.md](./006-project-demo-draft-requisition.md) | Demo-заявка проекта как отдельный draft-слой |
| 007 | [007-unified-work-queue-and-estimate-mode.md](./007-unified-work-queue-and-estimate-mode.md) | Единая рабочая очередь и режим быстрых расчётов |
| 008 | [008-external-financial-snapshots.md](./008-external-financial-snapshots.md) | Финансовые снимки внешних заявок |
| 009 | [009-greenwich-rating-ledger-and-price-snapshots.md](./009-greenwich-rating-ledger-and-price-snapshots.md) | Журнал рейтинга и строковые снимки скидки |
| 010 | [010-greenwich-monthly-bonus-redemption.md](./010-greenwich-monthly-bonus-redemption.md) | Аккаунтный месячный бонус и атомарное погашение |
| 011 | [011-order-quality-feedback-and-dirty-returns.md](./011-order-quality-feedback-and-dirty-returns.md) | Оценка закрытых заявок и загрязнение возврата |
| 012 | [012-modular-project-workspace.md](./012-modular-project-workspace.md) | Модульное рабочее пространство проекта |

**Правило:** менять принятое решение только с новым ADR или явным обновлением старого (с датой внизу файла).
