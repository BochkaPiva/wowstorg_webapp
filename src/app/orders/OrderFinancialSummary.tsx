import styles from "./OrderFinancialSummary.module.css";
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
    <div className={[styles.row, total ? styles.total : "", strong ? styles.strong : ""].filter(Boolean).join(" ")}>
      <span className={styles.label}>{label}</span>
      <span className={[styles.value, valueClassName].filter(Boolean).join(" ")}>{value}</span>
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
    <div className={styles.summary}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Финансовый итог</h2>
          <span className={styles.headlineLabel}>Итого по заявке</span>
          <strong className={styles.headlineAmount}>{formatMoneyRub(pricing.grandTotal)} ₽</strong>
        </div>
        {discountLabel ? (
          <div className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
            Скидка {discountLabel}
          </div>
        ) : null}
      </div>

      <div className={[styles.grid, showWarehouse ? styles.withWarehouse : ""].filter(Boolean).join(" ")}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            Клиент
          </div>
          <div className={styles.rows}>
            <SummaryRow label="Сумма до налога" value={`${formatMoneyRub(pricing.grandTotalBeforeTax)} ₽`} />
            <SummaryRow label={`Налог ${taxPercent}%`} value={`${formatMoneyRub(pricing.taxAmount)} ₽`} />
          </div>
        </section>

        {warehouse ? (
          <>
            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                Внутреннее
              </div>
              <div className={styles.rows}>
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

            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                Маржа
              </div>
              <div className={styles.rows}>
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
