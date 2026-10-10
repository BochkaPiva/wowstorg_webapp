# ADR 020 — Источник API-запроса и отзыв сессий

Дата: 10.10.2026. Статус: принято. Дополняет ADR 003/018, не меняет cookie/DB-модель.

## Контекст

SameSite=Lax не является единственным достаточным контролем CSRF. Вход, первая активация и остальные Route Handlers не имели общего origin gate. Смена пароля/блокировка могла оставлять старые сессии, вновь действующие после разблокировки. Первая активация читала состояние до hash и затем безусловно обновляла пароль.

## Решение

- `src/proxy.ts` охватывает только `/api/:path*`: POST/PUT/PATCH/DELETE требуют тот же Origin, либо same-origin Referer/Fetch Metadata. Cross-site отклоняется; same-site без доказательства origin не принимается. Missing/null/invalid Origin не разрешается автоматически.
- Целевой origin определяется фактическим протоколом URL и Host с проверкой синтаксиса/порта; произвольные X-Forwarded-Host не доверяются. Preview/custom domain проверяется против себя, не wildcard `.vercel.app`.
- Только точные `/api/reminders/run`, `/api/admin/inventory-audit/cron`, `/api/telegram/webhook` принимают machine-запросы без browser metadata. Их обработчики по-прежнему проверяют отдельные секреты. GET/HEAD/OPTIONS не заменяют существующую авторизацию; новых мутаций через GET не добавлять.
- Proxy не читает БД и не принимает решений о пользователе/роли: существующие requireUser/requireRole остаются обязательны.
- Включить nosniff, SAMEORIGIN/frame-ancestors self, object-src none, base-uri self и Referrer-Policy. Auth-ответы no-store. Полный script-src CSP требует отдельной приёмки Next/GSAP, здесь не заявляется.
- Admin password/reset-first-login/block/role change атомарно удаляет все Session пользователя. Profile-only change сессии сохраняет. getCurrentUser отвергает mustSetPassword и не выбирает passwordHash.
- Первая активация использует conditional update `isActive && mustSetPassword` и отзыв сессий в одной транзакции: повтор/конкурентный блок не перезаписывают пароль.

## Последствия и ограничения

Cookie-authenticated scripts вне браузера должны передавать Origin, равный адресу запроса; это не аутентификация и не защита от клиента, уже владеющего cookie. Не освобождать новый endpoint от gate ради теста: адаптировать тестовый клиент.

Активация только по логину остаётся известным риском: нужен одноразовый admin-issued token и общий rate limiter, не process-local Map на Vercel. Это отдельное изменение onboarding, формат согласовывается с владельцем. XSS, credential stuffing и компрометацию cookie origin gate не решает.

Источники: [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Next Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
