# Диагностика «[object Event]» / unhandledrejection (каталог)

## 1. Что в коде

В **`src/instrumentation-client.ts`** только тихий **`preventDefault`** для отказов с DOM `Event` (без `console.error`: в Next.js это вызывает ложный «Console Error» в оверлее).

## 1a. Как снять детали вручную

В консоли **нельзя** полагаться на наш `console.error` — Next перехватывает его как ошибку.

## 2. Ручная отладка в Chrome / Edge

1. F12 → **Sources**.
2. Справа открыть **Breakpoints** → поставить галочку **Pause on uncaught exceptions** (и при необходимости **caught**).
3. Для промисов: в Console выполнить:

   ```js
   window.addEventListener("unhandledrejection", (e) => { debugger; }, true);
   ```

   Перезагрузить страницу, снова зайти в каталог — выполнение остановится на `debugger`, в **Scope** видно `e.reason`.

4. Вкладка **Network**: при открытии каталога посмотреть, какие запросы **красные** (4xx/5xx/failed) — иногда отказ связан с ними.

## 3. Почему «ничего не меняется» после правок

- Перезапустить `npm run dev` (или Ctrl+F5).
- В оверлее **stale** — перезапуск dev и обновление страницы.

## 4. Что прислать разработчику

1. Скрин **Scope** / `e.reason` из шага с `debugger` выше (или описание из консоли без нашего `console.error`).
2. Версия Next из `package.json` / `npm list next`.
3. Точные шаги воспроизведения.
