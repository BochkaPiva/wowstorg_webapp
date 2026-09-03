import { formatMoneyRub, formatPercent } from "@/lib/money";

type OrderPricingSummary = {
  grandTotalBeforeTax: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
};

type WarehouseProfitSummary = {
  internalCostTotal: number;
  clientTaxAmount: number;
  cashInternalCostTax: number;
  internalCostWithCashTax: number;
  profitEstimate: number;
  profitabilityPct: number;
};

function SummaryRow({
  label,
  value,
  strong = false,
  total = false,
  valueClassName = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  total?: boolean;
  valueClassName?: string;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-3",
        total ? "border-t pt-2 text-base" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={total ? "font-extrabold text-inherit" : strong ? "font-semibold" : "text-zinc-600"}>
        {label}
      </span>
      <span
        className={[
          "tabular-nums",
          total ? "font-black" : strong ? "font-extrabold" : "font-bold",
          valueClassName,
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

export function OrderFinancialSummary({
  pricing,
  warehouse,
  discountLabel,
}: {
  pricing: OrderPricingSummary;
  warehouse?: WarehouseProfitSummary | null;
  discountLabel?: string | null;
}) {
  const taxPercent = Math.round(pricing.taxRate * 100);
  const showWarehouse = Boolean(warehouse);
  const profit = warehouse?.profitEstimate ?? 0;
  const profitTone = profit >= 0 ? "text-emerald-950" : "text-rose-700";
  const warehouseExpenseTotal = warehouse
    ? warehouse.internalCostWithCashTax + warehouse.clientTaxAmount
    : 0;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-black text-zinc-950">Финансовый итог</div>
          <div className="mt-0.5 text-xs text-zinc-500">Клиентский расчёт, внутренние расходы и результат</div>
        </div>
        {discountLabel ? (
          <div className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
            Скидка {discountLabel}
          </div>
        ) : null}
      </div>

      <div
        className={[
          "grid gap-px bg-zinc-200",
          showWarehouse ? "xl:grid-cols-[1.05fr_0.95fr_1fr]" : "md:grid-cols-1",
        ].join(" ")}
      >
        <section className="bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-black text-zinc-950">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
            Клиент
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <SummaryRow label="Сумма до налога" value={`${formatMoneyRub(pricing.grandTotalBeforeTax)} ₽`} />
            <SummaryRow label={`Налог ${taxPercent}%`} value={`${formatMoneyRub(pricing.taxAmount)} ₽`} />
            <SummaryRow
              label="Итого по заявке"
              value={`${formatMoneyRub(pricing.grandTotal)} ₽`}
              total
            />
          </div>
        </section>

        {warehouse ? (
          <>
            <section className="bg-white p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm font-black text-zinc-950">
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                Внутреннее
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <SummaryRow
                  label="Себестоимость доп. услуг и скрытых трат"
                  value={`${formatMoneyRub(warehouse.internalCostTotal)} ₽`}
                />
                {warehouse.cashInternalCostTax > 0 ? (
                  <SummaryRow
                    label="Налог на наличку 3,5%"
                    value={`${formatMoneyRub(warehouse.cashInternalCostTax)} ₽`}
                  />
                ) : null}
                {warehouse.clientTaxAmount > 0 ? (
                  <SummaryRow
                    label={`Расходный налог ${taxPercent}%`}
                    value={`${formatMoneyRub(warehouse.clientTaxAmount)} ₽`}
                  />
                ) : null}
                <SummaryRow
                  label="Расходы всего"
                  value={`${formatMoneyRub(warehouseExpenseTotal)} ₽`}
                  strong
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Без себестоимости аренды реквизита.
              </p>
            </section>

            <section className="bg-white p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm font-black text-zinc-950">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Маржа
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <SummaryRow label="Оценка прибыли" value={`${formatMoneyRub(profit)} ₽`} strong valueClassName={profitTone} />
                <SummaryRow label="Рентабельность" value={formatPercent(warehouse.profitabilityPct, 2)} strong valueClassName="text-emerald-950" />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                После налогов и внутренних расходов.
              </p>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
