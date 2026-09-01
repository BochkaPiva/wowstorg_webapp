# Project Workspace V2 — выпуск и приёмка

## Что уже готово в коде

- аддитивная Prisma-схема и backfill старых полных проектов;
- создатель, ответственный и участники;
- модульная сетка, шаблоны, ширина/высота, hide/restore и legacy fallback;
- свободная доска с revision/idempotency/offline recovery;
- табличная смета, batch autosave, конфликт вкладок и карточный fallback;
- пользовательские вспомогательные колонки без влияния на канонические финансы;
- переиспользование таблицы независимыми сметами;
- lazy loading и локальная изоляция ошибок тяжёлых модулей.

## 1. Перед SQL Editor

1. Сделать backup базы Supabase.
2. Убедиться, что production-приложение ещё не использует новую схему.
3. Открыть файл [`prisma/migrations/20260828110000_project_workspace_foundation/migration.sql`](../prisma/migrations/20260828110000_project_workspace_foundation/migration.sql) и выполнить его **один раз целиком** в Supabase SQL Editor.
4. Затем выполнить [`prisma/migrations/20260901153000_project_workspace_board_48_columns/migration.sql`](../prisma/migrations/20260901153000_project_workspace_board_48_columns/migration.sql), синхронизирующий ограничения координат доски с 48-колоночным клиентом.
5. Не выполнять migrations повторно: это forward-only Prisma migrations, а не seed.

## 2. Проверка после миграции

Выполнить в SQL Editor:

```sql
select count(*) as projects_without_creator
from "Project"
where "createdByUserId" is null;

select count(*) as projects_without_owner_member
from "Project" p
where not exists (
  select 1
  from "ProjectMember" pm
  where pm."projectId" = p.id
    and pm."userId" = p."ownerUserId"
    and pm.role = 'OWNER'
);

select count(*) as full_projects_without_estimate_widget
from "Project" p
where p.mode = 'FULL'
  and not exists (
    select 1 from "ProjectWidget" w
    where w."projectId" = p.id and w.type = 'ESTIMATE'
  );

select count(*) as full_projects_without_orders_widget
from "Project" p
where p.mode = 'FULL'
  and not exists (
    select 1 from "ProjectWidget" w
    where w."projectId" = p.id and w.type = 'ORDERS'
  );

select type, count(*)
from "ProjectWidget"
group by type
order by type;

select pg_get_constraintdef(oid) as board_bounds
from pg_constraint
where conname = 'ProjectWorkspaceItem_bounds_check';
```

Первые четыре результата должны быть `0`. Обзор типов контролирует backfill, а последнее ограничение должно содержать `x + width <= 48`.

## 3. Feature flags

Добавить в Preview, затем в Production:

```text
PROJECT_WORKSPACE_V2_ENABLED=1
PROJECT_ESTIMATE_GRID_V2_ENABLED=1
```

Для мгновенного UI fallback без отката данных:

```text
PROJECT_WORKSPACE_V2_ENABLED=0
PROJECT_ESTIMATE_GRID_V2_ENABLED=0
```

Если переменная отсутствует или содержит неизвестное значение, соответствующий V2-интерфейс также остаётся выключенным.

Для точечной проверки конкретной карточки доступны `?workspace=legacy` и `?workspace=v2`.

## 4. Браузерная приёмка Preview

1. Открыть старый полный проект: шапка, смета и заявки не потеряны.
2. Сменить ответственного, добавить участника, сохранить и обновить страницу.
3. Переставить модуль, изменить ширину и высоту, скрыть необязательный модуль и вернуть его.
4. Проверить, что смета и заявки скрытием не удаляются.
5. В смете из 50–70 строк проверить Enter/Shift+Enter, стрелки, вставку TSV и sticky header.
6. Быстро изменить несколько ячеек, обновить страницу и проверить конечное состояние.
7. Открыть две вкладки, изменить одну смету в обеих и убедиться, что появляется управляемый 409-конфликт без тихой потери данных.
8. Проверить свободную доску: создать, переместить, сгруппировать, обновить страницу.
9. Отключить каждый feature flag и проверить legacy/card fallback.
10. Проверить архивный проект: интерфейс и API остаются read-only.

## 5. Production gate

- SQL validation зелёный;
- Preview-приёмка пройдена;
- `npm test`, `npm run lint`, `npm run build` зелёные;
- только после этого включать оба флага в Production;
- legacy UI не удалять до отдельного решения после периода стабильности.
