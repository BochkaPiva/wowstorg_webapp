# Центр внутренних уведомлений

## Цель
Сделать единый центр уведомлений: колокольчик в верхнем меню, список уведомлений, счетчик непрочитанных, прочтение, очистка и опциональные browser push на устройстве пользователя.

## Границы
- Browser push включается только после добавления VAPID env и разрешения браузера.
- Не заменяем Telegram: сайт хранит короткую суть события, Telegram остается подробным внешним каналом.
- Не ломаем уведомления ачивок Greenwich.

## Затронуто
- Prisma: `InAppNotificationType`, `InAppNotification`, `BrowserPushSubscription`.
- API: `GET/PATCH/DELETE /api/me/notifications`, `GET/POST/DELETE /api/me/push-subscriptions`.
- UI: `src/app/_ui/AppShell.tsx`, `src/app/_ui/InAppNotifications.tsx`.
- Server: `src/server/notifications/in-app.ts`, `src/server/notifications/browser-push.ts`.
- События заявок: route handlers `src/app/api/orders/**`.

## Инварианты
- Уведомления создаются best-effort и не блокируют бизнес-операции.
- История уведомлений не должна исчезать из-за toast.
- `ACHIEVEMENT_UNLOCK` остается отдельным типом для ачивок.
- Payload должен содержать `kind` и ссылочные id (`orderId`, `projectId`) для будущих browser push.
- Browser push использует тот же источник `InAppNotification`, а не отдельную параллельную систему.
- Невалидные push-подписки отключаются через `disabledAt`, не удаляются сразу.

## Приёмка
- [ ] В верхнем меню есть колокольчик.
- [ ] Виден счетчик непрочитанных.
- [ ] По клику открывается список уведомлений.
- [ ] Можно отметить все прочитанными.
- [ ] Можно очистить уведомления.
- [ ] Toast продолжает показывать новые события, но история остается в списке.
- [ ] Ачивки Greenwich продолжают отображаться.
- [ ] Статусы заявок создают короткие in-app уведомления.
- [ ] После включения browser push уведомление приходит даже вне активной вкладки.

## Ссылки
- `docs/IN_APP_NOTIFICATIONS_PLAN.md`
