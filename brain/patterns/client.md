# Паттерн: клиентские страницы (`use client`)

## Авторизация

- Использовать **`useAuth()`** из `src/app/providers.tsx`.
- Редирект на `/login` при `anonymous` — как в **`AppShell`**; не дублировать противоречивую логику на каждой странице без нужды.

## Обработка ошибок в браузере

- `src/instrumentation-client.ts` — точечная работа с `unhandledrejection` / оверлеем Next (см. [`docs/DEBUG_UNHANDLED_REJECTION.md`](../../docs/DEBUG_UNHANDLED_REJECTION.md)). Новые глобальные перехватчики не добавлять без понимания этого файла.

## Запросы к API

- Предпочтительно **`readJsonSafe`** после `fetch` (см. `src/lib/fetchJson.ts`).
- Для повторяющегося JSON-fetch можно выносить маленькие хелперы **рядом с фичей**, не плодя разные контракты ошибок.
- Для обычных независимых GET-ресурсов есть `src/lib/use-json-resource.ts`: `null` URL отключает запрос, начальный/key-change loading вычисляется, `refresh()` вызывается из действия пользователя и возвращает Promise. AbortController + generation отбрасывают старые ответы; поздний refresh от старой сущности игнорируется. Мутации, autosave/CAS, очереди и optimistic updates не переносить в этот GET-хук автоматически. Для защищённого списка URL задаётся только после подтверждения роли/сессии. Это клиентское улучшение, не замена серверной авторизации.
- Для связанных read-only запросов тот же lifecycle доступен через `useReadResource(key, reader, errorMessage)`: reader стабилен (`useCallback`), key включает весь входной scope; `Promise.all` возвращает один согласованный UI-результат. Не использовать для мутаций. `useJsonResource` — HTTP GET-адаптер этого же механизма, с поддержкой jsonError и старых string errors.
- Browser-only portal: `useClientReady()` из `src/lib/use-client-ready.ts`, с согласованным SSR/hydration snapshot. Не делать `setMounted(true)` эффектом и не читать localStorage во время SSR.

## Состояние загрузки / ошибок

- Явные состояния **`loading`** и сообщения об ошибке для пользователя; не полагаться на «тихий» провал.

## Навигация

- **`AppShell`** задаёт общий фон, навигацию и **`InAppNotifications`** для Greenwich. Новые «логины» страниц согласовывать с существующими разделами и **`sectionBackHref`**.

## См. также

- [`error_handling.md`](./error_handling.md)
- [`../ui/layouts_and_shell.md`](../ui/layouts_and_shell.md)
