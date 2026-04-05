# ADR 001: Хранение файлов — Supabase в production, диск в development

## Статус

Принято (реализовано в `src/server/file-storage.ts`).

## Контекст

На Vercel нет постоянного локального диска для пользовательских загрузок. Локально удобно писать в `data/` без облака.

## Решение

- Если заданы **`SUPABASE_URL`** и **`SUPABASE_SERVICE_ROLE_KEY`** → все операции фото и смет через **Supabase Storage** (buckets из env).
- Иначе в **non-production** → файлы в **`data/item-photos`** и **`data/estimates`**.
- В **production** без Supabase → **явная ошибка** при попытке сохранить файл (не молчаливый fallback на диск).

## Последствия

- На Vercel обязательно настроить Storage и переменные окружения.
- Папка `data/` в `.gitignore`; бэкапы файлов — отдельная политика (Supabase / экспорт).

## Нарушать?

Только через новый ADR и миграцию данных.
