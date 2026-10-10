# Ограничение попыток входа

## Цель

Ограничить перебор паролей общими счётчиками БД, одинаковыми для всех экземпляров Vercel Functions.

## Границы

Не менять существующие пароли, роли, интерфейс и cookie/Session авторизацию. Не вводить MFA или приглашения в этой итерации.

## Затронуто

- Prisma: `AuthRateLimit`, additive migration `20261010093638_auth_rate_limits`.
- API: `POST /api/auth/login`, `POST /api/auth/first-login`.
- Сервер: `src/server/auth/rate-limit.ts`.
- UI: существующая форма показывает `error.message`, новые поля не нужны.

## Инварианты

- 8 попыток pair, 40 account, 60 network за 600 секунд; считаются и успешные попытки.
- Отклонённый запрос не продлевает окно и не отключает пользователя/сессию.
- Только доверенный Vercel proxy header; вне Vercel общий бюджет до отдельного адаптера.
- Нет raw login/IP/password в счётчиках; RLS/revoke согласно ADR 018.
- Миграция отдельно до выпуска кода, не внутри сборки.

## Приёмка

- [x] Unit tests: IP canonicalisation/trust, bounds, Retry-After, fail-closed, guards.
- [x] Реальный HTTP → PostgreSQL: параллельный перебор, общий бюджет двух маршрутов, истечение и cleanup, сохранение существующей сессии.
- [x] Fresh replay и restored production clone: schema/access checks.
- [x] `npm run build:verified`.
- Production SHA/CI/READY и обновление PostgreSQL фиксируются в release report.

## Ссылки

- [ADR 021](../decisions/021-shared-auth-attempt-limits.md).
- [Безопасность и сопровождение](../../docs/SECURITY_OPERATIONS.md).
