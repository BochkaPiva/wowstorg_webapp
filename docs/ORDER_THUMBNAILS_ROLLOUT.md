# Миниатюры в заявках

Документ фиксирует первую безопасную итерацию внедрения миниатюр товаров в основной флоу заявок.

## Что входит в первую итерацию
- `src/app/orders/[id]/page.tsx`:
  - read-only `Состав заявки`
  - edit-table `Состав заявки`
  - блок `Добавить позицию`
  - складская приемка `RETURN_DECLARED`
  - Greenwich modal `Отправить на приёмку`
  - итог приемки после `CLOSED`
- embed-вариант заявки, потому что использует тот же экран

## Что не входит
- `src/app/orders/page.tsx`
- `src/app/warehouse/queue/page.tsx`
- `src/app/warehouse/losses/page.tsx`
- `src/app/warehouse/repair/page.tsx`
- `src/app/inventory/in-rent/page.tsx`
- `src/app/projects/[id]/ProjectEstimatePanel.tsx`

Эти поверхности идут отдельной фазой, потому что у них другой shape данных, отдельные list API или смешанные строки без гарантированного `itemId`.

## Архитектурный подход
- Используем уже существующий `GET /api/inventory/positions/[id]/photo`.
- Для миниатюр используем только preview-режим через `?w=120` или `?w=160`.
- В `GET /api/orders/[id]` добавляется только `item.photo1Key`, чтобы UI понимал, есть ли фото, и не создавал лишние запросы на `404`.
- Для блока `Добавить позицию` переиспользуем `photo1Key`, который уже приходит из `/api/catalog/items`.

## Почему не делаем новый image pipeline
- В проекте уже есть рабочий preview-route с `sharp`.
- Новый storage flow или stored thumbnails увеличили бы область риска и затронули бы инфраструктуру.
- Для первой итерации достаточно маленьких превью и аккуратного gated rendering.

## Риски и митигации

### 1. Слишком много запросов к фото-route
Митигация:
- маленькие `w`
- `loading="lazy"`
- `decoding="async"`
- `<img>` только при наличии `photo1Key`
- без внедрения миниатюр в списки заявок и очередь на первом этапе

### 2. Поломка layout в таблицах и формах приемки
Митигация:
- единый компактный thumbnail slot
- фиксированные размеры
- текст остается главным, миниатюра только как визуальная опора
- без blur и тяжелых декоративных эффектов

### 3. Случайное влияние на бизнес-логику
Митигация:
- не меняем `warehouse-edit`, `greenwich-edit`, `return-declared`, `check-in`
- не меняем payload этих маршрутов
- меняем только один read-only select в `GET /api/orders/[id]` и сам UI

## Технические ориентиры
- read-only and edit order data: `src/app/api/orders/[id]/route.ts`
- screen: `src/app/orders/[id]/page.tsx`
- photo route: `src/app/api/inventory/positions/[id]/photo/route.ts`
- preview strategy reference: `docs/CATALOG_PERFORMANCE.md`

## Рекомендации по ширине превью
- таблицы и строки заявки: `w=120`
- карточки приемки и модалки: `w=160`
- не использовать полноразмерные изображения внутри заявки

## Ручная проверка после внедрения
- Greenwich: открыть свою заявку, проверить состав и модалку отправки на приемку
- Wowstorg: открыть заявку, перейти в редактирование, добавить позицию, пройти складскую приемку
- Проверить позицию без фото: должен быть placeholder, не битая картинка
- Проверить длинную заявку: скролл, отклик и читабельность формы
- Проверить embed-режим заявки из проекта

## Следующая фаза
После стабильной проверки первой итерации можно отдельно расширить миниатюры на:
- `src/app/inventory/in-rent/page.tsx`
- `src/app/warehouse/losses/page.tsx`
- `src/app/warehouse/repair/page.tsx`
- `src/app/projects/[id]/ProjectEstimatePanel.tsx`
