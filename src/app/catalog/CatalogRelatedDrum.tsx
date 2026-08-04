"use client";

import React from "react";

import { dismissRelatedSuggestion } from "@/lib/cart-related-dismiss";
import {
  formatSourceNamesRu,
  renderRelatedThumb,
  type MergedSuggestionRow,
} from "@/app/cart/cart-related-shared";

type Props = {
  rows: MergedSuggestionRow[];
  cartScope?: string;
  displayMultiplier?: number;
  onAdd: (itemId: string, qty: number, pricePerDay: number, maxAvail: number) => void;
  onDismiss: (next: Set<string>) => void;
};

function sourceLabel(row: MergedSuggestionRow): string {
  if (row.sources.length === 1) return `Подходит к «${row.sources[0]!.sourceItemName}»`;
  return `Подходит к ${formatSourceNamesRu(row.sources.map((source) => source.sourceItemName))}`;
}

export function CatalogRelatedDrum({ rows, cartScope, displayMultiplier = 1, onAdd, onDismiss }: Props) {
  if (rows.length === 0) return null;

  function dismiss(row: MergedSuggestionRow) {
    onDismiss(dismissRelatedSuggestion(cartScope, row.relatedItemId));
  }

  function add(row: MergedSuggestionRow) {
    const availability = row.availability ?? { availableNow: 0 };
    const maxAvail = availability.availableForDates ?? availability.availableNow ?? 0;
    const qty = Math.min(row.totalSuggestedQty, maxAvail > 0 ? maxAvail : row.totalSuggestedQty);
    if (maxAvail <= 0) return;

    onAdd(row.relatedItemId, qty, row.pricePerDay, maxAvail);
    dismiss(row);
  }

  return (
    <section className="catalog-recommendations" aria-labelledby="catalog-recommendations-title">
      <header className="catalog-recommendations__header">
        <div>
          <span className="catalog-recommendations__index" aria-hidden="true">02</span>
          <h2 id="catalog-recommendations-title">Дополнить комплект</h2>
        </div>
        <p>Проверили выбранные позиции и показали только подходящие дополнения.</p>
      </header>

      <div className="catalog-recommendations__rail">
        {rows.map((row) => {
          const availability = row.availability ?? { availableNow: 0 };
          const maxAvail = availability.availableForDates ?? availability.availableNow ?? 0;
          const qty = Math.min(row.totalSuggestedQty, maxAvail > 0 ? maxAvail : row.totalSuggestedQty);
          const canAdd = maxAvail > 0;
          const price = row.pricePerDay * displayMultiplier;

          return (
            <article
              key={row.relatedItemId}
              className={[
                "catalog-recommendation",
                row.kind === "REQUIRED" ? "catalog-recommendation--required" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="catalog-recommendation__media">
                {renderRelatedThumb(row.relatedItemId, row.photo1Key, 160, "catalog-recommendation__thumb")}
                <span className="catalog-recommendation__badge">
                  {row.kind === "REQUIRED" ? "Важно" : "Подойдёт"}
                </span>
              </div>

              <div className="catalog-recommendation__body">
                <div className="catalog-recommendation__topline">
                  <h3>{row.name}</h3>
                  <button
                    type="button"
                    className="catalog-recommendation__dismiss"
                    aria-label={`Не показывать рекомендацию «${row.name}»`}
                    onClick={() => dismiss(row)}
                  >
                    ×
                  </button>
                </div>
                <p className="catalog-recommendation__source">{sourceLabel(row)}</p>
                {row.note ? <p className="catalog-recommendation__note">{row.note}</p> : null}
                <div className="catalog-recommendation__facts">
                  <strong>{Math.round(price).toLocaleString("ru-RU")} ₽/сут</strong>
                  <span>{canAdd ? `Доступно ${maxAvail}` : "Нет на выбранные даты"}</span>
                </div>
              </div>

              <button
                type="button"
                className="catalog-recommendation__add"
                disabled={!canAdd}
                onClick={() => add(row)}
              >
                <span>{canAdd ? `Добавить ${qty}` : "Недоступно"}</span>
                {canAdd ? <span aria-hidden="true">＋</span> : null}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
