# Налог на наличные расходы доп. услуг

## Смысл

Клиентская сумма заявки не меняется. Существующий налог 6% считается от суммы для клиента так же, как раньше.

Новая логика влияет только на внутреннюю себестоимость и маржу WowStorg: если внутренняя себестоимость доп. услуги оплачивается наличными, к расходам добавляется налог на наличку 3.5% от этой наличной себестоимости.

## Где выбирается оплата

У каждой доп. услуги заявки есть способ оплаты внутренней себестоимости:

- `NON_CASH` — безнал, дополнительный налог на наличку не начисляется.
- `CASH` — наличка, начисляется 3.5% от внутренней себестоимости этой услуги.

Поля хранятся на `Order`:

- `deliveryInternalPaymentMethod`
- `montageInternalPaymentMethod`
- `demontageInternalPaymentMethod`

Hidden expenses are stored separately in `OrderHiddenExpense`. They are visible only to Wowstorg, never appear in the client estimate, and use the same `internalPaymentMethod` rule: `CASH` adds 3.5% to internal expenses, `NON_CASH` does not.

Для старых заявок и для выключенных услуг значение по умолчанию — `NON_CASH`, чтобы исторические расчеты не изменились неожиданно.

## Формулы

Клиентская часть:

```text
clientSubtotal = аренда + клиентские цены доп. услуг
clientTax = round(clientSubtotal * 0.06)
clientTotal = clientSubtotal + clientTax
```

Внутренняя часть:

```text
internalServicesCost = сумма внутренних себестоимостей включенных доп. услуг
cashInternalServicesCost = сумма внутренних себестоимостей включенных доп. услуг с CASH
cashInternalTax = round(cashInternalServicesCost * 0.035)
internalServicesCostWithCashTax = internalServicesCost + cashInternalTax
profitEstimate = clientTotal - clientTax - internalServicesCost - cashInternalTax
marginAfterTax = revenueTotal - tax - internalSubtotal - cashInternalTax
```

Если себестоимость равна `0`, налог на наличку тоже равен `0`.

## Проекты

В проектных сметах налог на наличку применяется к строкам, где `paymentMethod` распознан как наличный:

- `CASH`
- `Наличные`
- `Наличка`

Для блоков реквизита, созданных из заявки, способ оплаты доп. услуг берется из новых полей `Order` и превращается в `paymentMethod` строк сметы. Поэтому заявка, привязанная к проекту, считается по той же логике, что и обычная заявка.

Для подрядчиков существующее поле `paymentMethod` уже используется: строки с наличной оплатой уменьшают внутреннюю маржу через налог 3.5%.

## Инварианты

- Налог на наличку не увеличивает сумму для клиента.
- Налог на наличку не применяется ко всей себестоимости, только к наличной части.
- Налог на наличку не влияет на складской резерв, статусы заявки и клиентский экспорт сметы.
- Безналичные внутренние расходы остаются в старой модели.
