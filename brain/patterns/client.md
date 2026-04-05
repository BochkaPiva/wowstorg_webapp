# Паттерн: клиентские страницы (`use client`)

## Авторизация

- Использовать **`useAuth()`** из `src/app/providers.tsx`.
- Редирект на `/login` при `anonymous` — как в **`AppShell`**; не дублировать противоречивую логику на каждой странице без нужды.

## Обработка ошибок в браузере

- `src/instrumentation-client.ts` — точечная работа с `unhandledrejection` / оверлеем Next (см. [`docs/DEBUG_UNHANDLED_REJECTION.md`](../../docs/DEBUG_UNHANDLED_REJECTION.md)). Новые глобальные перехватчики не добавлять без понимания этого файла.

## Запросы к API

- Предпочтительно **`readJsonSafe`** после `fetch` (см. `src/lib/fetchJson.ts`).
- Для повторяющегося JSON-fetch можно выносить маленькие хелперы **рядом с фичей**, не плодя разные контракты ошибок.

## Состояние загрузки / ошибок

- Явные состояния **`loading`** и сообщения об ошибке для пользователя; не полагаться на «тихий» провал.

## Навигация

- **`AppShell`** задаёт общий фон, навигацию и **`InAppNotifications`** для Greenwich. Новые «логины» страниц согласовывать с существующими разделами и **`sectionBackHref`**.

## См. также

- [`error_handling.md`](./error_handling.md)
- [`../ui/layouts_and_shell.md`](../ui/layouts_and_shell.md)
