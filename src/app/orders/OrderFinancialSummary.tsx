import { formatMoneyRub, formatPercent } from "@/lib/money";

type OrderPricingSummary = {
  grandTotalBeforeTax: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
};

type WarehouseProfitSummary = {
  internalCostTotal: number;
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
}: {
  label: string;
  value: string;
  strong?: boolean;
  total?: boolean;
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

  return (
    <div className="mt-4 space-y-3">
      {discountLabel ? (
        <div className="inline-flex rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
          Скидка {discountLabel}
        </div>
      ) : null}

      <div
        className={[
          "grid gap-3 rounded-2xl border border-zinc-200 bg-white/85 p-3",
          showWarehouse ? "xl:grid-cols-[1.05fr_0.95fr_1fr]" : "md:grid-cols-1",
        ].join(" ")}
      >
        <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Клиент</div>
          <div className="mt-3 space-y-2 text-sm">
            <SummaryRow label="Сумма до налога" value={`${formatMoneyRub(pricing.grandTotalBeforeTax)} ₽`} />
            <SummaryRow label={`Налог ${taxPercent}%`} value={`${formatMoneyRub(pricing.taxAmount)} ₽`} />
            <SummaryRow
              label="Итого по заявке"
              value={`${formatMoneyRub(pricing.grandTotal)} ₽`}
              total
            />
          </div>
        </div>

        {warehouse ? (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/90 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-700">Внутреннее</div>
              <div className="mt-3 space-y-2 text-sm">
                <SummaryRow
                  label="Себестоимость доп. услуг"
                  value={`${formatMoneyRub(warehouse.internalCostTotal)} ₽`}
                />
                {warehouse.cashInternalCostTax > 0 ? (
                  <SummaryRow
                    label="Налог на наличку 3,5%"
                    value={`${formatMoneyRub(warehouse.cashInternalCostTax)} ₽`}
                  />
                ) : null}
                <SummaryRow
                  label="Расходы всего"
                  value={`${formatMoneyRub(warehouse.internalCostWithCashTax)} ₽`}
                  strong
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Без себестоимости аренды реквизита.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Маржа</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <div className="text-xs font-semibold text-emerald-900">Оценка прибыли</div>
                  <div className={`mt-1 text-xl font-black tabular-nums ${profitTone}`}>
                    {formatMoneyRub(profit)} ₽
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-emerald-900">Рентабельность</div>
                  <div className="mt-1 text-xl font-black tabular-nums text-emerald-950">
                    {formatPercent(warehouse.profitabilityPct, 2)}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
