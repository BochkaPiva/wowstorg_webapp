# Обзор системы (Wowstorg Webapp)

## Назначение

Веб-приложение для **аренды реквизита**: каталог, заявки, сметы, выдача/приёмка, инвентарь, рейтинг и достижения сотрудников Greenwich, админ-аналитика, аудит остатков, Telegram-уведомления.

## Стек (факт из репозитория)

| Слой | Технология |
|------|------------|
| Фреймворк | **Next.js 16** (App Router), **React 19** |
| Язык | **TypeScript** |
| БД | **PostgreSQL** через **Prisma 6** |
| Стили | **Tailwind CSS 4** |
| Валидация API | **Zod** |
| Пароли | **bcryptjs** |
| Отчёты | **exceljs**, **xlsx** |
| Анимации / игра | **gsap**, **three** |
| HTTP к Telegram | **undici** (через обёртки + опциональный прокси) |

## Развёртывание

- **Vercel** — приложение (serverless / Node runtime для route handlers).
- **Supabase** — Postgres + **Storage** для фото позиций и файлов смет в production.
- Локально без Supabase: файлы в каталоге `data/` (см. `src/server/file-storage.ts`).

## Точки входа в коде

- Страницы и layout: `src/app/`
- API: `src/app/api/**/route.ts`
- Серверная логика (общая): `src/server/`
- Клиентские утилиты: `src/lib/`
- Схема БД и миграции: `prisma/schema.prisma`, `prisma/migrations/`
- Сид данных: `prisma/seed.cjs`

## Связанная документация

- Контракт API (обзор): [`docs/api.md`](../../docs/api.md)
- Модель данных: [`docs/data-model.md`](../../docs/data-model.md)
- Область V1: [`docs/v1-scope.md`](../../docs/v1-scope.md)
- Деплой Vercel + Supabase: [`docs/DEPLOY_VERCEL_SUPABASE.md`](../../docs/DEPLOY_VERCEL_SUPABASE.md)
- Переменные окружения (шаблон): [`.env.example`](../../.env.example)
