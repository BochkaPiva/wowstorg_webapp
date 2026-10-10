# Защита входа и обновление PostgreSQL — 10.10.2026

## Границы

Владелец согласовал защиту от перебора и обновление PostgreSQL, включая предупреждение Supabase о простое до часа. Пароли, минимальная длина, роли, интерфейсы, первая активация и отсутствие MFA не изменены.

## База данных

- Рабочий проект проверен перед запуском; стабильная версия 17.11.0.003 выбрана вместо предлагаемой PREVIEW.
- До обновления создан consistent logical backup public + maintenance с exported snapshot. Восстановление в отдельную локальную БД: counts всех 88 таблиц совпали, включая 7 архивных checklist rows.
- Обновление запущено через авторизованную панель Supabase в 09:47:29 UTC; панель подтвердила завершение. К 09:54:49 UTC `ACTIVE_HEALTHY`, platform version 17.11.0.003, SQL `server_version=17.11`. Точная продолжительность недоступности приложения отдельно не измерялась.
- До запуска проверены условные несовместимости: logical slots, ltree indexes, float GiST indexes, custom selectivity estimators, special reg* columns, MD5 login roles — отсутствуют; вызовов legacy pgcrypto ciphers в коде нет.
- Применена только новая `20261010093638_auth_rate_limits` после проверки старых checksums и единственной pending миграции. 76 успешных миграций, незавершённых — 0. Старые data migrations не повторялись.
- Prisma drift — 0; public tables 88, RLS выключен на 0, эффективный доступ anon/authenticated к таблицам и public routines — 0.
- Три Storage buckets остаются private; maintenance archive содержит 7 строк; active pending accounts — 0.
- Supabase security advisor: только INFO `rls_enabled_no_policy`, ожидаемый server-only доступ (ADR 018). Не добавлять публичные policies для устранения INFO.

Дамп и скриншот подтверждения хранятся локально в git-ignored `data/security/`. Дамп не включает auth/storage schemas и бинарные файлы buckets. Внешние автоматические резервные копии пока не настроены; восстановление дампа не доказывает полный disaster recovery.

## Защита входа

Общие DB-счётчики для login/first-login: 8 запросов pair, 40 account, 60 network в фиксированном окне 600 секунд. Считаются и успешные попытки. 429 с Retry-After, автоматическое истечение, ограниченная очистка, fail-closed 503. Существующие сессии не блокируются и не отзываются. Trust boundary и компромиссы — [ADR 021](../brain/decisions/021-shared-auth-attempt-limits.md).

## Проверки

- `npm run build:verified`: 404 теста / 62 файла passed; production audit 0 vulnerabilities; Next build passed; lint 164 исторические ошибки, 0 регрессий baseline.
- Полный replay 76 миграций на пустой БД: schema/access checks passed.
- На восстановленной копии рабочей БД: только одна новая миграция, schema/access checks passed.
- Настоящий HTTP → Prisma → PostgreSQL smoke: параллельные попытки, login/first-login общий бюджет, account/IP/pair thresholds, Retry-After, expiry reset, stale cleanup, действующие сессии, прежние пароли; также existing role/origin/session boundaries и КП/PDF/PPTX smoke passed.
- Ошибку клиент отображает существующим `error.message` в login form; UI этой итерацией не менялся. Отдельный визуальный browser smoke в этой итерации не выполнен.
- CI PostgreSQL обновлён до 17.11, наличие официального Docker tag проверено. CI и production READY должны быть сверены на SHA выпуска; GitHub jobs по-прежнему не required branch checks.

## Основания

Использованы skills Supabase, Supabase Postgres Best Practices и Vercel Auth/Verification/Deployments CI/CD: новая миграция, серверные RLS/revoke, короткие транзакции и shared counters, отдельное применение схемы до релиза, негативные и конкурентные проверки. Env Vars/Routing Middleware использованы для проверки trusted proxy границы без смены авторизации.

- [Supabase 17.11 security release](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- [Процедура обновления](https://supabase.com/docs/guides/platform/upgrading).
- [Доверенные request headers Vercel](https://vercel.com/docs/headers/request-headers).
- [INFO о RLS без policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
