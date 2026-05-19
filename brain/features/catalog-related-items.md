# Связанные позиции каталога (related items)

## Цель

Подсказывать в **корзине** сопутствующий реквизит (виндер → плитки и т.д.) на основе **ручных связей**, заданных складом. Не заменяет **Kit** (наборы).

## Границы (out of scope v1)

- Модалка каталога, toast после «+».
- Авто-связи из истории заказов.
- Блокировка оформления без REQUIRED.
- Скидки комплектом.

## Затронуто (MVP)

- **Prisma:** `ItemRelationKind`, `ItemRelatedItem`.
- **API:** `GET /api/catalog/related`, `GET|PUT /api/inventory/positions/[id]/related`.
- **UI:** блок в `/cart`; секция на `/inventory/positions/[id]`.

## Фазы

| Фаза | Содержание |
|------|------------|
| **1 MVP** | схема, API, админка, корзина, dismiss |
| **1.1** | чеклист перед оформлением, подсказка на `/orders/[id]`, kit-дособирание |
| **2** | qtyPerSourceUnit, копирование связей, аналитика |

## Инварианты

- Не менять резерв, pricing, статусы заявок.
- `relatedItem` delete → **Restrict**; `sourceItem` delete → **Cascade** связей.
- Greenwich: не показывать `internalOnly` related.
- Project demo cart: рекомендации **выключены**.

## Приёмка (MVP)

- [ ] Связи CRUD в админке позиции
- [ ] Рекомендации в корзине с датами и остатками
- [ ] Dedupe / dismiss / скрытие после добавления
- [ ] `npm run build`

## Ссылки

- Полный план: [`docs/CATALOG_RELATED_ITEMS_PLAN.md`](../../docs/CATALOG_RELATED_ITEMS_PLAN.md)
- Kit: `src/app/inventory/packages/`
- Корзина: `src/app/cart/page.tsx`
