# План: связанные позиции каталога и рекомендации в корзине

Документ описывает полный функционал «с этим часто берут / обычно нужно вместе», админку связей, интеграцию с корзиной и последующие фазы. Цель — **не ломать** существующие заявки, наборы (`Kit`), резерв и каталог.

**Краткая карточка для агента:** [`brain/features/catalog-related-items.md`](../brain/features/catalog-related-items.md)

---

## 1. Цель и продуктовая ценность

### 1.1. Проблема

Часть реквизита **логически связана**, но не оформлена как жёсткий набор:

- виндер → плитки для утяжеления;
- craft-игра → craft-стол;
- и т.д.

Greenwich забывает докупить сопутствующее → срывы на площадке, лишние звонки на склад, правки заявки в последний момент.

### 1.2. Решение

1. **Склад** задаёт направленные связи «позиция A → позиция B» в админке инвентаря.
2. **Корзина** (основной UI v1) показывает рекомендации на основе содержимого корзины, с учётом **дат аренды и остатков**.
3. Позже — мягкий чеклист перед оформлением, подсказки складу на карточке заявки, дособирание до `Kit`.

### 1.3. Что не заменяем

| Механизм | Назначение |
|----------|------------|
| **`Kit`** (`/inventory/packages`, вкладка «Наборы») | готовый комплект, фиксированный состав, «добавить набор» |
| **`Collection`** | группировка в инвентаре, не поведение корзины |
| **Резерв / `getReservedQtyByItemId`** | не меняем семантику; рекомендации **читают** те же API остатков |

Связи — **мягкие подсказки**. Наборы — **жёсткий пакет**.

---

## 2. Границы (scope по фазам)

### 2.1. MVP (фаза 1) — обязательный минимум

- Prisma: таблица связей + enum kind.
- API склада: CRUD связей на позиции.
- API каталога: `GET` рекомендаций для списка `itemIds` + даты + rental parts.
- UI: блок в **`/cart`** (не в модалке каталога).
- Админка: секция на **`/inventory/positions/[id]`**.
- Фильтры: не показывать Greenwich `internalOnly`, неактивные, уже в корзине.
- Dismiss «Не нужно» в сессии корзины (localStorage по `cartScope`).

### 2.2. Фаза 1.1

- Мягкий **чеклист перед оформлением** (только `REQUIRED`, без блокировки).
- **Подсказка складу** на `/orders/[id]` (read-only, те же правила).
- **Kit-дособирание** в корзине: «не хватает до набора X».

### 2.3. Фаза 2 (опционально)

- `qtyPerSourceUnit` (масштаб от qty source в корзине).
- Копирование связей «как у позиции X».
- Статистика показов/добавлений.
- Toast после «+» в каталоге — **не планируем**, пока корзины достаточно.

### 2.4. Out of scope (явно не делаем)

- Автоматическое построение связей из истории заказов.
- Жёсткий запрет оформления без `REQUIRED`.
- Скидки «комплектом» / изменение ценообразования.
- Related в модалке каталога (отложено продуктово).
- In-app / Telegram при пропуске related.

---

## 3. Роли и сценарии

| Роль | Админка связей | Видит рекомендации |
|------|----------------|-------------------|
| **WOWSTORG** | да (`/inventory/positions/[id]`) | да — обычная корзина, quick supplement, ручная заявка |
| **GREENWICH** | нет | да — `/cart`, checkout |

### 3.1. Контексты корзины (`cartScope`)

| Контекст | Рекомендации MVP |
|----------|------------------|
| Обычная корзина Greenwich | **да** |
| Quick supplement (`quick:{parentOrderId}`) | **да** (даты с parent) |
| Проектная корзина (materialize) | **да** |
| **Project demo** (`isProjectDemoCart`) | **нет** — демо-режим без давления на остатки; не смешивать с боевой логикой |

### 3.2. `internalOnly`

- Greenwich в каталоге **не видит** `internalOnly` позиции → related с `internalOnly: true` **не попадают** в рекомендации для Greenwich.
- Склад **может** связать каталожную позицию с `internalOnly` (расходник) — рекомендации показываются **только в корзине склада** (WOWSTORG).

---

## 4. Модель данных (Prisma)

### 4.1. Enum

```prisma
enum ItemRelationKind {
  REQUIRED     // «обычно нужно вместе» — заметнее в UI, участвует в чеклисте (фаза 1.1)
  RECOMMENDED  // «может пригодиться»
}
```

### 4.2. Таблица `ItemRelatedItem`

Направленная связь **source → related** (не симметричная автоматически).

| Поле | Тип | Смысл |
|------|-----|--------|
| `id` | cuid | PK |
| `sourceItemId` | FK → `Item` | «если в корзине это…» |
| `relatedItemId` | FK → `Item` | «…предложить это» |
| `kind` | `ItemRelationKind` | REQUIRED / RECOMMENDED |
| `sortOrder` | int | порядок в UI (меньше = выше) |
| `defaultSuggestedQty` | int ≥ 1 | сколько предложить добавить (MVP) |
| `qtyPerSourceUnit` | int ≥ 1, default 1 | **фаза 2:** suggested = ceil(sourceQty × qtyPerSourceUnit) − alreadyInCart |
| `note` | string?, max 120 | подпись в UI («для утяжеления») |
| `createdAt` / `updatedAt` | DateTime | аудит |

**Ограничения:**

```prisma
@@unique([sourceItemId, relatedItemId])
@@index([sourceItemId, sortOrder])
@@index([relatedItemId])
```

**On delete:**

- `sourceItemId` → **`onDelete: Cascade`** (удалили позицию — удалили её исходящие связи).
- `relatedItemId` → **`onDelete: Restrict`** (нельзя удалить позицию, пока на неё ссылаются; в UI — «сначала уберите связи»).

**Валидация в API (не в БД):**

- `sourceItemId !== relatedItemId`;
- обе позиции существуют;
- лимит **≤ 20** исходящих связей на source (защита от спама);
- `relatedItem` для Greenwich-API: `isActive`, при role GREENWICH — `internalOnly: false`.

### 4.3. Обратный lookup для Kit (фаза 1.1)

Без новой таблицы: запрос «какие `Kit` содержат все/часть itemIds из корзины» через существующие `KitLine`.

### 4.4. Миграция

- Одна additive-миграция, **без** изменения `Order`, `OrderLine`, `Kit`.
- Откат: drop table — не трогает заявки.

---

## 5. API

### 5.1. Склад — связи позиции

**Базовый паттерн:** расширить существующие роуты позиции (как categories), либо вложенный ресурс — предпочтительно **отдельные route handlers** для чёткого diff и `brain:inventory`.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| GET | `/api/inventory/positions/[id]/related` | WOWSTORG | список исходящих связей + snapshot related item (name, isActive, internalOnly) |
| PUT | `/api/inventory/positions/[id]/related` | WOWSTORG | **полная замена** списка (идempotent, проще UI) |
| — | — | — | Альтернатива POST/PATCH/DELETE по строке — больше race; для MVP достаточно **PUT replace** |

**Body PUT (Zod):**

```json
{
  "relations": [
    {
      "relatedItemId": "clx…",
      "kind": "REQUIRED",
      "sortOrder": 0,
      "defaultSuggestedQty": 4,
      "note": "для утяжеления"
    }
  ]
}
```

**Ответы ошибок:**

- 400 — self-link, duplicate relatedItemId, >20 relations, invalid qty;
- 404 — source or related not found;
- 409 — при delete item с входящими Restrict (сообщение человекочитаемое).

После добавления route → **`npm run brain:inventory`**.

### 5.2. Каталог / корзина — рекомендации

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| GET | `/api/catalog/related` | GREENWICH, WOWSTORG | агрегированные рекомендации |

**Query (Zod):**

| Параметр | Обязательность |
|----------|----------------|
| `itemIds` | comma-separated, min 1, max 100 |
| `startDate`, `endDate` | как в `/api/catalog/items` |
| `rentalStartPartOfDay`, `rentalEndPartOfDay` | optional, defaults MORNING…EVENING |
| `excludeOrderId` | optional (quick supplement) |

**Response:**

```json
{
  "groups": [
    {
      "sourceItemId": "…",
      "sourceItemName": "Виндер №2",
      "sourceQtyInCart": 2,
      "suggestions": [
        {
          "relatedItemId": "…",
          "name": "Плитка утяжеления",
          "kind": "REQUIRED",
          "note": "для утяжеления",
          "suggestedQty": 4,
          "alreadyInCart": 0,
          "pricePerDay": 150,
          "photo1Key": "…",
          "availability": { "availableNow": 20, "availableForDates": 12 }
        }
      ]
    }
  ],
  "flat": [ "… dedupe для компактного UI …" ]
}
```

**Серверный алгоритм (`src/server/catalog/related-items.ts`):**

1. Загрузить cart itemIds + qty map.
2. `findMany ItemRelatedItem where sourceItemId in cartIds`, include related Item (filter active; role-based internalOnly).
3. Исключить `relatedItemId ∈ cartIds`.
4. Dedupe: один related от нескольких source → одна строка в `flat`, в `groups` — несколько source labels.
5. `suggestedQty` MVP: `defaultSuggestedQty` (фаза 2: max по формуле qtyPerSourceUnit × sourceQty − alreadyInCart).
6. Batch availability: переиспользовать паттерн `/api/catalog/items` + `getReservedQtyByItemId` с rental parts.
7. Сортировка: `REQUIRED` first, then `sortOrder`, then name.

**Кэш:** не кэшировать на CDN (`dynamic = force-dynamic`); runtime cache не обязателен (малый объём).

### 5.3. Заявка — подсказка складу (фаза 1.1)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/orders/[id]/related-suggestions` | WOWSTORG, read-only, те же правила по `order.lines` + даты заказа |

Не мутирует заявку. Только UI-блок «возможно забыли».

---

## 6. Админка (UI)

### 6.1. Где

**`/inventory/positions/[id]`** — новая секция под категориями / коллекциями:

**«Связанные позиции (рекомендации в корзине)»**

### 6.2. UX склада

- Таблица текущих связей: related name, kind (badge), qty, note, ↑↓ sort, удалить строку.
- **Добавить:** autocomplete по `/api/catalog/items?query=…&all=true&internalOnly=true|false` (склад видит все активные).
- Переключатель kind: REQUIRED / RECOMMENDED.
- Поля qty (defaultSuggestedQty), note.
- Кнопка **«Сохранить связи»** → PUT replace (одна транзакция).
- Предупреждение, если related **неактивна** или internalOnly (для Greenwich не покажется).
- Лимит 20 — счётчик «7 / 20».

### 6.3. Безопасность правок

- Только `requireRole("WOWSTORG")`.
- PATCH основной позиции **не** смешивать со связями в одном огромном body (меньше риск случайно затереть связи).
- Optimistic UI не обязателен; при ошибке — reload списка.

### 6.4. Удаление позиции

При попытке delete/deactivate item, если есть **входящие** связи (`relatedItemId`):

- API возвращает 409 с текстом «На эту позицию ссылаются связи из: …»;
- в UI списка позиций — ссылка «редактировать связи».

---

## 7. Корзина (UI)

### 7.1. Размещение

На `/cart`, **между списком позиций и блоком дат/оформления** (desktop и mobile).

Секции:

1. **«Обычно нужно вместе»** (`REQUIRED`)
2. **«Может пригодиться»** (`RECOMMENDED`)

Если обе пусты — секция скрыта.

### 7.2. Строка рекомендации

- мини-фото, название, note;
- остаток на даты (`availableForDates`);
- suggested qty;
- **[+ Добавить]** / **[+ N]** — вызывает существующий `setQty` / add to cart;
- **«Не нужно»** — dismiss (см. §7.4).

Подпись контекста: *«К: Виндер №2 (×2)»* — если dedupe, *«К: Виндер №2, Craft-стол»*.

### 7.3. Лимиты UI

- Показать max **8** в flat-списке + «Ещё N» expand.
- Не показывать при `cart.length === 0` или `isProjectDemoCart`.

### 7.4. Dismiss «Не нужно»

- localStorage key: `cartRelatedDismissed:${cartScope}` → JSON string[] of `"${sourceItemId}:${relatedItemId}"`.
- Очищать при `clearCart` опционально (можно оставить до смены scope).
- Не синхронизировать с сервером (v1).

### 7.5. Загрузка данных

`useEffect` при изменении `cartItemIdsKey`, dates, rental parts:

```
GET /api/catalog/related?itemIds=…&startDate=…&endDate=…&rentalStartPartOfDay=…
```

Параллельно с существующим fetch items — или один related после items (related сам тянет availability).

### 7.6. Чеклист перед оформлением (фаза 1.1)

При клике «Оформить»:

- если есть **не dismissed** REQUIRED с `suggestedQty > alreadyInCart`;
- modal: список + «Добавить всё» / «Оформить без этого»;
- **не блокируем** API `POST /api/orders` — только UX.

---

## 8. Kit-дособирание (фаза 1.1)

В корзине, если ≥2 позиций из активного `Kit`:

```
Похоже на набор «Craft комплект»
Не хватает: Стол craft (×1)  [Добавить]
```

Алгоритм:

- active kits with lines;
- для каждого kit: `missing = kitLines \ cartItems`;
- показать kit с max coverage (наибольший % строк в корзине), если missing non-empty.

Кнопка «Добавить недостающее» — добавляет lines с `defaultQty`, clamp по availability.

---

## 9. Инварианты и защита от поломок

### 9.1. Не трогаем

- Создание/редактирование заявок, резерв, pricing, `OrderLine`, quick supplement flow.
- Существующие Kit API и вкладка наборов.
- Каталог pagination — related отдельный endpoint.

### 9.2. Идempotent админка

PUT replace всего списка связей в транзакции:

```ts
await tx.itemRelatedItem.deleteMany({ where: { sourceItemId } });
await tx.itemRelatedItem.createMany({ data: validated });
```

Нет «полуобновлённого» состояния.

### 9.3. Чтение только активного

Рекомендации never suggest `isActive: false` items, даже если связь в БД осталась.

### 9.4. Циклы

A→B и B→A допустимы как две ручные связи; UI dedupe в корзине не зациклит (related уже в cart отсекается).

### 9.5. Performance

- Индекс `(sourceItemId, sortOrder)`.
- Один запрос связей + один batch items/availability на cart page load.
- Лимит 100 itemIds в query.

### 9.6. Безопасность

- Greenwich не может PUT связи.
- HTML в `note` — escape в Telegram не применимо; в UI — text only, max length.

---

## 10. План внедрения (пошагово)

### Этап 0 — подготовка (0.5 д)

- [ ] Согласовать open questions (§12).
- [ ] ADR не нужен, если не меняем резерв/pricing; достаточно этого документа.

### Этап 1 — схема и сервер (1–1.5 д)

- [ ] Prisma enum + `ItemRelatedItem` + migration.
- [ ] `src/server/catalog/related-items.ts` — чистая логика агрегации + unit-friendly pure functions.
- [ ] `GET /api/catalog/related`.
- [ ] `GET/PUT /api/inventory/positions/[id]/related`.
- [ ] `npm run brain:inventory`, обновить `docs/data-model.md` (краткий абзац).

### Этап 2 — админка (1 д)

- [ ] Секция на `/inventory/positions/[id]`.
- [ ] Autocomplete позиций, validation messages на русском.
- [ ] Тест вручную: create / reorder / delete / save / 409 on delete related target.

### Этап 3 — корзина MVP (1–1.5 д)

- [ ] Компонент `CartRelatedSuggestions.tsx`.
- [ ] Интеграция в `cart/page.tsx`, dismiss localStorage.
- [ ] Стили в духе `cart.css` / catalog cards.
- [ ] Quick supplement + project cart smoke test.

### Этап 4 — приёмка MVP (0.5 д)

- [ ] Чеклист §11.
- [ ] `npm run build`.

### Этап 5 — фаза 1.1 (2–3 д)

- [ ] Pre-checkout modal (REQUIRED).
- [ ] `GET /api/orders/[id]/related-suggestions` + UI на order page (warehouse).
- [ ] Kit completion block в корзине.

### Этап 6 — фаза 2 (backlog)

- [ ] qtyPerSourceUnit в UI админки и формуле.
- [ ] «Копировать связи с позиции…»
- [ ] Метрики (опционально таблица событий).

---

## 11. Чеклист приёмки

### MVP

- [ ] Связь виндер → плитки сохраняется в админке и переживает reload.
- [ ] В корзине с виндером без плиток — плитки в блоке REQUIRED/RECOMMENDED.
- [ ] После добавления плиток — строка исчезает.
- [ ] «Не нужно» скрывает до dismiss clear / смены scope.
- [ ] `internalOnly` related не виден Greenwich.
- [ ] Склад видит related на internalOnly в своей корзине.
- [ ] Demo project cart — блока нет.
- [ ] Quick supplement — блок есть, даты parent, excludeOrderId работает.
- [ ] Удаление source item — связи cascade.
- [ ] Удаление related item с входящими связями — 409.
- [ ] Оформление заявки без related — работает как раньше.
- [ ] Наборы (Kit) — без регрессий.

### 1.1

- [ ] Чеклист REQUIRED перед оформлением.
- [ ] Склад видит suggestions на issued order.
- [ ] Kit «не хватает» добавляет недостающие строки.

---

## 12. Открытые решения (зафиксировать перед кодом)

| # | Вопрос | Рекомендация по умолчанию |
|---|--------|---------------------------|
| 1 | Related для CONSUMABLE как source | **да**, если склад явно настроил |
| 2 | Макс. связей на позицию | **20** |
| 3 | PUT replace vs CRUD по строкам | **PUT replace** для MVP |
| 4 | Показывать related с `availableForDates = 0` | **да**, с disabled «нет на даты» (не скрывать молча) |
| 5 | Одна позиция — связи копировать между похожими | фаза 2 |

---

## 13. Риски

| Риск | Митигация |
|------|-----------|
| Перегруз корзины | лимит 8 + collapse |
| Устаревшие связи на архивные items | filter isActive; админ badge «неактивна» |
| Расхождение related и kit | разные секции UI, разные данные |
| Случайное удаление связей при PATCH item | отдельный endpoint related |
| Дубли API availability | shared helper с catalog items route |

---

## 14. Ссылки на код (текущее состояние)

| Область | Путь |
|---------|------|
| Корзина | `src/app/cart/page.tsx`, `src/lib/cart.ts` |
| Каталог items | `src/app/api/catalog/items/route.ts` |
| Редактирование позиции | `src/app/inventory/positions/[id]/page.tsx` |
| API позиции | `src/app/api/inventory/positions/[id]/route.ts` |
| Kit (packages) | `src/app/inventory/packages/`, `src/app/api/inventory/packages/` |
| Kit в каталоге | `src/app/api/catalog/kits/route.ts` |
| Резерв | `src/server/orders/reserve.ts` |

---

## 15. История документа

| Дата | Изменение |
|------|-----------|
| 2026-05-19 | Первая версия: MVP корзина + админка + фазы 1.1/2 |
