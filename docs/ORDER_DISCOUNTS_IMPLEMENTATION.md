# Скидки на заявки

Документ фиксирует реализацию скидок на заявки и правила, которые должны сохраняться при будущих правках.

## Продуктовые правила
- Фактическая скидка применяется только к аренде реквизита.
- Доп. услуги (`delivery`, `montage`, `demontage`) всегда считаются полностью.
- Для Greenwich ручная скидка считается после внутреннего `payMultiplier`.
- В UI Greenwich не показывается внутренняя скидка/коэффициент; показывается только цена до ручной скидки и после нее.
- Налог 6% добавляется отдельной строкой ко всему чеку после аренды, ручной скидки и доп. услуг.
- Для Greenwich `payMultiplier` по умолчанию равен `0.70`; налог не вшивается в цену реквизита или услуг.
- В одной заявке можно выбрать один тип фактической скидки: процент или сумма.
- Фиксированная скидка не может превышать сумму аренды реквизита до скидки.
- Фактическую скидку задает только склад.
- Greenwich может оставить запрос скидки; это отдельные поля, которые не влияют на финальную сумму, сметы и аналитику.

## Формула
```text
baseLine = pricePerDaySnapshot * qty * days * payMultiplier
rentalBeforeDiscount = sum(baseLine)
discountAmount = percent ? rentalBeforeDiscount * percent / 100 : fixedAmount
rentalAfterDiscount = rentalBeforeDiscount - discountAmount
servicesTotal = delivery + montage + demontage
grandTotalBeforeTax = rentalAfterDiscount + servicesTotal
taxAmount = round(grandTotalBeforeTax * 0.06)
grandTotal = round(grandTotalBeforeTax + taxAmount)
```

`qty` зависит от контекста:
- предварительные суммы заявки, очереди и сметы используют `requestedQty`
- аналитика закрытых заявок использует `issuedQty ?? requestedQty`

## Типы скидки
- `NONE`: скидки нет.
- `PERCENT`: процент от rental subtotal.
- `AMOUNT`: фиксированная сумма в рублях.

## Права
- `WOWSTORG`: может задавать фактическую скидку при создании и редактировании заявки до начала сборки (`SUBMITTED`, `ESTIMATE_SENT`, `CHANGES_REQUESTED`, `APPROVED_BY_GREENWICH`).
- `GREENWICH`: может заполнить только запрос скидки и комментарий к запросу.

## Сметы и snapshots
- Смета показывает аренду до скидки, строку скидки, аренду после скидки, услуги, налог 6% и итог.
- `estimateSentSnapshot` и `greenwichConfirmedSnapshot` фиксируют фактическую скидку.
- `changesRequestedSnapshot` фиксирует запрос скидки Greenwich.

## Аналитика
Скидка уменьшает только `itemsRevenue`. `servicesRevenue` не меняется. Налог показывается отдельной частью общего чека и не распределяется в item-level profitability.

Для item-level profitability скидка распределяется по строкам пропорционально выручке строк до скидки, чтобы сумма по реквизиту совпадала с общей скидированной выручкой.

## Проверка
- Внешняя заявка: процентная скидка, фиксированная скидка, блокировка фиксированной скидки больше аренды.
- Greenwich: запрос скидки не меняет итог; подтвержденная складом скидка меняет итог.
- XLSX: итог совпадает с экраном заявки.
- Очередь и список заявок: `totalAmount` с учетом скидки.
- Admin analytics/profitability: услуги не уменьшены, реквизит уменьшен.
