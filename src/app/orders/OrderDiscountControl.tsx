"use client";

import React from "react";

export type OrderDiscountType = "NONE" | "PERCENT" | "AMOUNT";
export type OrderDiscountValue = number | "";

type DiscountState = {
  type: OrderDiscountType;
  percent: OrderDiscountValue;
  amount: OrderDiscountValue;
};

const OPTIONS: Array<{ value: OrderDiscountType; label: string }> = [
  { value: "NONE", label: "Без скидки" },
  { value: "PERCENT", label: "В процентах" },
  { value: "AMOUNT", label: "Точная сумма" },
];

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getOrderDiscountError({
  type,
  percent,
  amount,
  rentalSubtotal,
}: DiscountState & { rentalSubtotal: number }): string | null {
  if (type === "NONE") return null;
  if (type === "PERCENT") {
    const value = Number(percent);
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      return "Укажите процент от 0 до 100";
    }
    return null;
  }

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "Укажите сумму больше нуля";
  if (value > rentalSubtotal) return "Скидка не может быть больше стоимости аренды";
  return null;
}

function calculateDiscount(state: DiscountState, rentalSubtotal: number) {
  const requested =
    state.type === "PERCENT"
      ? rentalSubtotal * (Number(state.percent || 0) / 100)
      : state.type === "AMOUNT"
        ? Number(state.amount || 0)
        : 0;
  return Math.min(rentalSubtotal, Math.max(0, Number.isFinite(requested) ? requested : 0));
}

export function OrderDiscountControl({
  type,
  percent,
  amount,
  rentalSubtotal,
  onTypeChange,
  onPercentChange,
  onAmountChange,
  title = "Скидка на реквизит",
  description = "Применяется только к аренде реквизита. Дополнительные услуги считаются полностью.",
  disabled = false,
}: DiscountState & {
  rentalSubtotal: number;
  onTypeChange: (value: OrderDiscountType) => void;
  onPercentChange: (value: OrderDiscountValue) => void;
  onAmountChange: (value: OrderDiscountValue) => void;
  title?: string;
  description?: string;
  disabled?: boolean;
}) {
  const state = { type, percent, amount };
  const discount = calculateDiscount(state, rentalSubtotal);
  const afterDiscount = Math.max(0, rentalSubtotal - discount);
  const error = getOrderDiscountError({ ...state, rentalSubtotal });
  const inputValue = type === "PERCENT" ? percent : amount;
  const inputLabel = type === "PERCENT" ? "Размер скидки" : "Сумма скидки";
  const suffix = type === "PERCENT" ? "%" : "₽";

  return (
    <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white shadow-[0_12px_34px_rgba(24,24,27,0.045)]">
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-yellow-400 text-zinc-950" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 5.5V11l8.7 8.7a1 1 0 0 0 1.4 0l5.6-5.6a1 1 0 0 0 0-1.4L11 4H5.5A1.5 1.5 0 0 0 4 5.5Z" />
              <circle cx="8" cy="8" r="1.25" />
            </svg>
          </span>
          <div>
            <h3 className="text-sm font-bold text-zinc-950">{title}</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">{description}</p>
          </div>
        </div>
        {discount > 0 ? (
          <div className="shrink-0 text-left sm:text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Экономия</div>
            <div className="mt-0.5 text-lg font-black tabular-nums text-violet-700">− {money(discount)}</div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)] lg:items-start">
        <div>
          <div className="grid gap-1 rounded-xl bg-zinc-100 p-1 sm:grid-cols-3" role="radiogroup" aria-label={title}>
            {OPTIONS.map((option) => {
              const active = option.value === type;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => onTypeChange(option.value)}
                  className={[
                    "min-h-10 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    active
                      ? "bg-zinc-950 text-white shadow-sm"
                      : "text-zinc-600 hover:bg-white hover:text-zinc-950",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {type !== "NONE" ? (
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">{inputLabel}</span>
              <span className="relative mt-2 block max-w-sm">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={type === "PERCENT" ? 100 : rentalSubtotal}
                  step={type === "PERCENT" ? 0.5 : 1}
                  value={inputValue}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.value === "" ? "" : Number(event.target.value);
                    if (type === "PERCENT") onPercentChange(next);
                    else onAmountChange(next);
                  }}
                  className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 pr-12 text-lg font-bold tabular-nums text-zinc-950 outline-none transition-colors duration-150 placeholder:text-zinc-300 focus:border-violet-700 focus:ring-2 focus:ring-violet-100 disabled:bg-zinc-100"
                  placeholder={type === "PERCENT" ? "10" : "5 000"}
                  aria-invalid={Boolean(error)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-sm font-bold text-zinc-500">
                  {suffix}
                </span>
              </span>
              <span className={["mt-2 block text-xs", error ? "text-rose-700" : "text-zinc-500"].join(" ")}>
                {error ?? (type === "PERCENT" ? "Процент от стоимости аренды" : `Не больше ${money(rentalSubtotal)}`)}
              </span>
            </label>
          ) : (
            <p className="mt-4 text-sm leading-6 text-zinc-500">
              Выберите способ скидки — итог заявки пересчитается сразу.
            </p>
          )}
        </div>

        <div className="border-t border-zinc-200 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="flex items-center justify-between gap-4 text-sm text-zinc-500">
            <span>Аренда до скидки</span>
            <span className="font-semibold tabular-nums text-zinc-800">{money(rentalSubtotal)}</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-4 border-t border-zinc-200 pt-3">
            <span className="text-sm font-semibold text-zinc-700">После скидки</span>
            <span className="text-2xl font-black tabular-nums text-zinc-950">{money(afterDiscount)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
