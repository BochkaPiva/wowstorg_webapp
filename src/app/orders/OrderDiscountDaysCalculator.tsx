"use client";

import React from "react";
import { rentalDaysDiscount } from "@/lib/rental-days-discount";

const money = (value: number) => new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: "RUB", maximumFractionDigits: 2,
}).format(value);

export function OrderDiscountDaysCalculator({
  rentalSubtotal, rentalDays, onApply, disabled = false,
}: {
  rentalSubtotal: number;
  rentalDays: number;
  onApply: (amount: number) => void;
  disabled?: boolean;
}) {
  const [days, setDays] = React.useState<number | "">("");
  const inputId = React.useId();
  const helpId = `${inputId}-help`;
  const result = rentalDaysDiscount({ rentalSubtotal, rentalDays, excludedDays: Number(days) });

  return (
    <details className="mt-3 border-t border-zinc-200 pt-3">
      <summary className="cursor-pointer rounded text-sm font-semibold text-violet-700 focus-visible:outline-2 focus-visible:outline-violet-700">
        Рассчитать скидку в днях
      </summary>
      <div className="mt-3 space-y-3">
        <label htmlFor={inputId} className="block text-xs font-semibold text-zinc-700">Не оплачиваются, дней</label>
        <input
          id={inputId} type="number" inputMode="numeric" min={1} max={rentalDays} step={1}
          value={days} disabled={disabled} aria-describedby={helpId}
          aria-invalid={days !== "" && !result.ok}
          onChange={(event) => setDays(event.target.value === "" ? "" : Number(event.target.value))}
          className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base font-bold tabular-nums text-zinc-950 focus-visible:outline-2 focus-visible:outline-violet-700 disabled:opacity-50"
          placeholder={`От 1 до ${Math.max(1, rentalDays)}`}
        />
        <p id={helpId} className={`text-xs leading-5 ${days !== "" && !result.ok ? "text-rose-700" : "text-zinc-600"}`}>
          {result.ok
            ? `К оплате: ${result.chargedDays} из ${rentalDays} дней. Скидка: ${money(result.amount)}.`
            : days === "" ? `Срок аренды: ${rentalDays} дн. Укажите, сколько не учитывать в оплате.` : result.message}
        </p>
        <button
          type="button" disabled={disabled || !result.ok}
          onClick={() => { if (result.ok) onApply(result.amount); }}
          className="min-h-11 w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-800 focus-visible:outline-2 focus-visible:outline-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {result.ok ? `Установить скидку ${money(result.amount)}` : "Установить скидку"}
        </button>
        <p className="text-xs leading-5 text-zinc-600">
          Сохраняется сумма скидки, а не сокращённый срок. Услуги и резерв не меняются.
          При изменении дат или состава пересчитайте скидку здесь.
        </p>
      </div>
    </details>
  );
}
