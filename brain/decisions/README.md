# Архитектурные решения (ADR)

Короткие записи: **контекст → решение → последствия**. Номер фиксирован; новые темы — следующий свободный номер.

| # | Файл | Тема |
|---|------|------|
| 001 | [001-storage-supabase-prod-local-data.md](./001-storage-supabase-prod-local-data.md) | Файлы: Supabase vs `data/` |
| 002 | [002-serializable-inventory-critical.md](./002-serializable-inventory-critical.md) | Serializable для резерва |
| 003 | [003-session-cookie-db.md](./003-session-cookie-db.md) | Сессии cookie + БД |
| 004 | [004-deferred-notifications.md](./004-deferred-notifications.md) | Уведомления через `after()` |
| 005 | [005-order-status-enums.md](./005-order-status-enums.md) | Enum статусов в Prisma |

**Правило:** менять принятое решение только с новым ADR или явным обновлением старого (с датой внизу файла).
