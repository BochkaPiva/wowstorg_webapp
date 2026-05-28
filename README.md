# Wowstorg Webapp

**[Русский](#русский)** · **[English](#english)**

Веб-приложение для учёта аренды реквизита: каталог, заявки, склад, проекты и аналитика.  
A web application for event prop rental operations: catalog, orders, warehouse workflow, projects, and analytics.

---

## Русский

### О проекте

**Wowstorg Webapp** — внутренняя операционная система прокатного склада. Она связывает **партнёров** (оформляют заявки из каталога) и **складскую команду** (инвентарь, сметы, сборка, выдача, приёмка, администрирование).

Приложение закрывает полный цикл: от подбора позиций по датам до закрытия заявки и отчётности по выручке и остаткам.

### Основные возможности

| Область | Что умеет система |
|--------|-------------------|
| **Каталог** | Позиции с фото, фильтры, проверка доступности по датам аренды (утро/вечер на краях периода) |
| **Заявки** | Корзина → заявка, статусы, сметы (экспорт), согласование, доп. услуги |
| **Склад** | Очередь заявок, сборка, выдача, приёмка (быстрая и по позициям), инциденты |
| **Инвентарь** | Остатки, ремонт, утери, пакеты, категории, аудит остатков |
| **Проекты** | Карточка мероприятия, несколько смет, привязка заявок, файлы, тайминг, demo-корзина |
| **Админка** | Пользователи, финансовая аналитика, отчёты в Excel |
| **Уведомления** | In-app и опционально внешние каналы (например, мессенджер) |

Роли в системе разделены: партнёр видит свой контур (каталог, свои заявки), склад — полный операционный и административный контур.

### Стек

| Слой | Технологии |
|------|------------|
| Frontend / API | **Next.js 16** (App Router), **React 19**, **TypeScript** |
| Стили | **Tailwind CSS 4** |
| БД | **PostgreSQL**, **Prisma 6** |
| Валидация | **Zod** |
| Отчёты | **ExcelJS**, **xlsx** |
| Тесты | **Vitest** |

Типичное развёртывание: **Vercel** (приложение) + **Supabase** (Postgres и object storage для файлов). Локально файлы могут храниться в каталоге `data/` без облака.

### Быстрый старт

**Требования:** Node.js 20+, npm, доступная PostgreSQL.

```bash
git clone <repository-url>
cd WebApp_WowStorg
npm install
```

1. Скопируйте `.env.example` → `.env` и заполните как минимум `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`.
2. Для загрузки фото и смет в production понадобятся переменные Supabase Storage (см. `.env.example`).
3. Примените миграции и при необходимости сид:

```bash
npm run prisma:migrate   # локальная разработка
# или
npm run db:deploy        # production / CI

npm run db:seed          # опционально, тестовые данные
```

4. Запуск dev-сервера:

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

### Полезные команды

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Dev-сервер |
| `npm run build` | Production-сборка |
| `npm run start` | Запуск после сборки |
| `npm test` | Unit-тесты (Vitest) |
| `npm run test:watch` | Тесты в watch-режиме |
| `npm run lint` | ESLint |
| `npm run prisma:studio` | Просмотр БД |
| `npm run brain:inventory` | Обновить реестры API/env в `brain/reference/` |

### Структура репозитория

```
src/app/          # Страницы и API (App Router)
src/server/       # Серверная логика
src/lib/          # Общие утилиты
prisma/           # Схема и миграции
brain/            # Архитектурный контекст для разработки
docs/             # Планы и детальные ТЗ
tests/            # Unit-тесты
```

Для разработчиков и AI-агентов: **[`AGENTS.md`](./AGENTS.md)** — точка входа; каталог **[`brain/`](./brain/README.md)** — обзор системы, паттерны и ADR.

Подробнее о деплое: [`docs/DEPLOY_VERCEL_SUPABASE.md`](./docs/DEPLOY_VERCEL_SUPABASE.md).

### Тесты

Покрыты расчёты периода аренды, цены заявок, итоги проектных смет, складские остатки и смежная бизнес-логика:

```bash
npm test
```

### Конфиденциальность

Репозиторий **приватный**. Не коммитьте `.env`, ключи API и production-данные. Шаблон переменных — только в `.env.example`.

---

## English

### About

**Wowstorg Webapp** is an internal operations platform for an event prop rental warehouse. It connects **partner users** (browse the catalog and place orders) with the **warehouse team** (inventory, estimates, fulfillment, returns, and administration).

The app supports the full lifecycle—from date-based availability checks to closed orders and financial reporting.

### Key capabilities

| Area | What the system does |
|------|----------------------|
| **Catalog** | Items with photos, filters, date-based availability (morning/evening rental edges) |
| **Orders** | Cart → order, status workflow, estimates (export), approval, optional services |
| **Warehouse** | Order queue, picking, issue, returns (quick and per line), incidents |
| **Inventory** | Stock levels, repair, losses, bundles, categories, scheduled stock audits |
| **Projects** | Event workspace, multiple estimate documents, linked orders, files, timing, draft cart |
| **Admin** | Users, financial analytics, Excel reports |
| **Notifications** | In-app and optional external channels (e.g. messaging bots) |

Access is role-based: partners see their catalog and orders; the warehouse role has full operational and admin tools.

### Tech stack

| Layer | Technologies |
|-------|----------------|
| Frontend / API | **Next.js 16** (App Router), **React 19**, **TypeScript** |
| Styling | **Tailwind CSS 4** |
| Database | **PostgreSQL**, **Prisma 6** |
| Validation | **Zod** |
| Reports | **ExcelJS**, **xlsx** |
| Tests | **Vitest** |

Typical hosting: **Vercel** (app) + **Supabase** (Postgres and object storage for uploads). Locally, files can live under `data/` without cloud storage.

### Quick start

**Requirements:** Node.js 20+, npm, PostgreSQL.

```bash
git clone <repository-url>
cd WebApp_WowStorg
npm install
```

1. Copy `.env.example` → `.env` and set at least `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`.
2. For photo and estimate uploads in production, configure Supabase Storage variables (see `.env.example`).
3. Run migrations and optional seed:

```bash
npm run prisma:migrate   # local development
# or
npm run db:deploy        # production / CI

npm run db:seed          # optional test data
```

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run after build |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint |
| `npm run prisma:studio` | Database UI |
| `npm run brain:inventory` | Regenerate API/env registries in `brain/reference/` |

### Repository layout

```
src/app/          # Pages and API routes (App Router)
src/server/       # Server-side logic
src/lib/          # Shared utilities
prisma/           # Schema and migrations
brain/            # Architecture notes for contributors
docs/             # Plans and detailed specs
tests/            # Unit tests
```

For contributors and AI agents: **[`AGENTS.md`](./AGENTS.md)** is the entry point; **[`brain/`](./brain/README.md)** holds system overview, patterns, and ADRs.

Deployment details: [`docs/DEPLOY_VERCEL_SUPABASE.md`](./docs/DEPLOY_VERCEL_SUPABASE.md).

### Tests

Business logic covered includes rental periods, order pricing, project estimate totals, stock calculations, and related rules:

```bash
npm test
```

### Security note

This is a **private** repository. Do not commit `.env` files, API keys, or production data. Use `.env.example` as the template only.
