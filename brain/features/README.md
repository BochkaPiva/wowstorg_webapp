# Крупные фичи — как вести документацию

## Где живут длинные ТЗ

Исторические и детальные планы остаются в **[`docs/`](../../docs/)** (например `GREENWICH_ACHIEVEMENTS_IMPLEMENTATION_PLAN.md`, `INVENTORY_AUDIT_SYSTEM_PLAN.md`).

## Когда создавать файл здесь

Создай **`brain/features/<slug>.md`**, если:

- фича затрагивает **несколько модулей** и **схему БД**;
- нужен **короткий** чеклист приёмки и ссылки на API/страницы;
- хочешь, чтобы агент **сначала** прочитал одну страницу, а не весь `docs/`.

## Шаблон карточки фичи

```markdown
# <Название>

## Цель
Одна-две фразы.

## Границы (out of scope)
Что не делаем в этой итерации.

## Затронуто
- Prisma: ...
- API: ...
- UI: ...

## Инварианты
- Не нарушать ADR из brain/decisions/
- ...

## Приёмка
- [ ] ...
## Ссылки
- docs/...
```

## Карточки фич в `brain/features/`

| Тема | Документ |
|------|----------|
| Проекты / мероприятия (ивент-ведение) | [`projects.md`](./projects.md) |

## Индекс существующих крупных тем (в docs)

| Тема | Документ |
|------|----------|
| V1 scope | `docs/v1-scope.md` |
| API обзор | `docs/api.md` |
| Модель данных | `docs/data-model.md` |
| Деплой Vercel + Supabase | `docs/DEPLOY_VERCEL_SUPABASE.md` |
| Ачивки Greenwich | `docs/GREENWICH_ACHIEVEMENTS_IMPLEMENTATION_PLAN.md` |
| Первый вход / пароль | `docs/FIRST_LOGIN_AUTH_PLAN.md` |
| Аудит инвентаря | `docs/INVENTORY_AUDIT_SYSTEM_PLAN.md` |
| Внешние заявки склада | `docs/EXTERNAL_ORDER_FLOW_WAREHOUSE.md` |
| Рентабельность | `docs/ITEM_PROFITABILITY_PLAN.md` |
| Аудит проекта / риски | `docs/PROJECT_AUDIT.md` |
| Telegram | `docs/telegram-notifications.md` |
| Календарь выдачи | `docs/ADMIN_ISSUANCE_CALENDAR.md` |
