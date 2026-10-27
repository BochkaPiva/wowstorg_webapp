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

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{formatMoneyRub(amount)} ₽</dd>
    </div>
  );
}

export function OrderFinancialSummary({ pricing, warehouse, discountLabel }: {
  pricing: OrderPricingSummary;
  warehouse?: WarehouseProfitSummary | null;
  discountLabel?: string | null;
}) {
  const taxPercent = Math.round(pricing.taxRate * 100);
  const expenses = warehouse ? warehouse.internalCostWithCashTax + warehouse.clientTaxAmount : 0;

  return (
    <section className={styles.summary} aria-labelledby="order-financial-title">
      <header className={styles.header}>
        <h2 id="order-financial-title">Расчёт заявки</h2>
        {discountLabel ? <span className={styles.discount}>Скидка {discountLabel}</span> : null}
      </header>

      <div className={styles.clientTotal}>
        <span>Итого клиенту</span>
        <strong>{formatMoneyRub(pricing.grandTotal)} ₽</strong>
      </div>
      <dl className={styles.rows}>
        <AmountRow label="До налога" amount={pricing.grandTotalBeforeTax} />
        <AmountRow label={`Налог ${taxPercent}%`} amount={pricing.taxAmount} />
      </dl>

      {warehouse ? (
        <>
          <div className={styles.divider} />
          <div className={styles.groupHeading}>
            <h3>Расходы</h3>
            <strong>{formatMoneyRub(expenses)} ₽</strong>
          </div>
          <dl className={styles.rows}>
            <AmountRow label="Доп. услуги и скрытые траты" amount={warehouse.internalCostTotal} />
            {warehouse.cashInternalCostTax > 0 ? <AmountRow label="Налог на наличные 3,5%" amount={warehouse.cashInternalCostTax} /> : null}
            {warehouse.clientTaxAmount > 0 ? <AmountRow label={`Расходный налог ${taxPercent}%`} amount={warehouse.clientTaxAmount} /> : null}
          </dl>
          <p className={styles.note}>Без себестоимости аренды реквизита.</p>

          <div className={styles.profit}>
            <div>
              <span>Оценка прибыли</span>
              <strong className={warehouse.profitEstimate < 0 ? styles.negative : undefined}>{formatMoneyRub(warehouse.profitEstimate)} ₽</strong>
            </div>
            <div className={styles.margin}>
              <span>Рентабельность</span>
              <strong>{formatPercent(warehouse.profitabilityPct, 2)}</strong>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
