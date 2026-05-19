"use client";

import React from "react";

import {
  dismissRelatedSuggestion,
  loadDismissedRelatedIds,
} from "@/lib/cart-related-dismiss";

export type CartRelatedSuggestion = {
  relatedItemId: string;
  name: string;
  kind: "REQUIRED" | "RECOMMENDED";
  note: string | null;
  suggestedQty: number;
  pricePerDay: number;
  photo1Key: string | null;
  availability: { availableNow: number; availableForDates?: number };
  sourceItemNames: string[];
};

type Props = {
  cartScope: string;
  itemIds: string[];
  qtys: number[];
  startDate: string | null;
  endDate: string | null;
  rentalStartPartOfDay: "MORNING" | "EVENING";
  rentalEndPartOfDay: "MORNING" | "EVENING";
  excludeOrderId?: string | null;
  disabled?: boolean;
  displayMultiplier?: number;
  onAdd: (itemId: string, qty: number, pricePerDay: number) => void;
};

const FLAT_LIMIT = 8;

export function CartRelatedSuggestions({
  cartScope,
  itemIds,
  qtys,
  startDate,
  endDate,
  rentalStartPartOfDay,
  rentalEndPartOfDay,
  excludeOrderId,
  disabled,
  displayMultiplier = 1,
  onAdd,
}: Props) {
  const [flat, setFlat] = React.useState<CartRelatedSuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => loadDismissedRelatedIds(cartScope));

  React.useEffect(() => {
    setDismissed(loadDismissedRelatedIds(cartScope));
  }, [cartScope]);

  const requestKey = React.useMemo(
    () =>
      [
        itemIds.join(","),
        qtys.join(","),
        startDate ?? "",
        endDate ?? "",
        rentalStartPartOfDay,
        rentalEndPartOfDay,
        excludeOrderId ?? "",
      ].join("|"),
    [itemIds, qtys, startDate, endDate, rentalStartPartOfDay, rentalEndPartOfDay, excludeOrderId],
  );

  React.useEffect(() => {
    if (disabled || itemIds.length === 0) {
      setFlat([]);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("itemIds", itemIds.join(","));
        params.set("qtys", qtys.join(","));
        if (startDate && endDate) {
          params.set("startDate", startDate);
          params.set("endDate", endDate);
          params.set("rentalStartPartOfDay", rentalStartPartOfDay);
          params.set("rentalEndPartOfDay", rentalEndPartOfDay);
        }
        if (excludeOrderId) params.set("excludeOrderId", excludeOrderId);
        const res = await fetch(`/api/catalog/related?${params.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { flat?: CartRelatedSuggestion[] } | null;
        if (!cancelled) setFlat(data?.flat ?? []);
      } catch {
        if (!cancelled) setFlat([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [disabled, requestKey, itemIds, qtys, startDate, endDate, rentalStartPartOfDay, rentalEndPartOfDay, excludeOrderId]);

  const visible = React.useMemo(
    () => flat.filter((s) => !dismissed.has(s.relatedItemId)),
    [flat, dismissed],
  );

  const shown = expanded ? visible : visible.slice(0, FLAT_LIMIT);
  const hiddenCount = Math.max(0, visible.length - FLAT_LIMIT);
  const shownRequired = shown.filter((s) => s.kind === "REQUIRED");
  const shownRecommended = shown.filter((s) => s.kind === "RECOMMENDED");

  if (disabled || itemIds.length === 0 || loading) return null;
  if (visible.length === 0) return null;

  function renderRow(s: CartRelatedSuggestion) {
    const maxAvail = s.availability.availableForDates ?? s.availability.availableNow;
    const qty = Math.min(s.suggestedQty, maxAvail > 0 ? maxAvail : s.suggestedQty);
    const canAdd = maxAvail > 0;
    const price = s.pricePerDay * displayMultiplier;
    const sourceLabel =
      s.sourceItemNames.length > 0
        ? `К: ${s.sourceItemNames.slice(0, 2).join(", ")}${s.sourceItemNames.length > 2 ? "…" : ""}`
        : null;

    return (
      <li key={s.relatedItemId} className="cart-related-row">
        <div className="cart-related-main">
          <div className="cart-thumbWrap cart-related-thumb" aria-hidden="true">
            {s.photo1Key ? (
              <img
                src={`/api/inventory/positions/${s.relatedItemId}/photo?w=80`}
                alt=""
                className="cart-thumb"
                loading="lazy"
              />
            ) : (
              <div className="cart-thumbPlaceholder">
                <span>WOW</span>
              </div>
            )}
          </div>
          <div className="cart-related-text">
            <div className="cart-related-name">{s.name}</div>
            {s.note ? <div className="cart-related-note">{s.note}</div> : null}
            {sourceLabel ? <div className="cart-related-source">{sourceLabel}</div> : null}
            <div className="cart-related-meta">
              {maxAvail > 0 ? (
                <span>
                  доступно {maxAvail} · {price.toFixed(0)} р/сут
                </span>
              ) : (
                <span className="cart-related-unavailable">нет на выбранные даты</span>
              )}
            </div>
          </div>
        </div>
        <div className="cart-related-actions">
          <button
            type="button"
            className="cart-related-add"
            disabled={!canAdd}
            onClick={() => onAdd(s.relatedItemId, qty, s.pricePerDay)}
          >
            {canAdd ? `+ ${qty}` : "—"}
          </button>
          <button
            type="button"
            className="cart-related-dismiss"
            onClick={() => setDismissed(dismissRelatedSuggestion(cartScope, s.relatedItemId))}
          >
            Не нужно
          </button>
        </div>
      </li>
    );
  }

  return (
    <section className="cart-related" aria-label="Рекомендации к корзине">
      {shownRequired.length > 0 ? (
        <div className="cart-related-section">
          <h2 className="cart-related-title">Обычно нужно вместе</h2>
          <ul className="cart-related-list">{shownRequired.map(renderRow)}</ul>
        </div>
      ) : null}
      {shownRecommended.length > 0 ? (
        <div className="cart-related-section">
          <h2 className="cart-related-title">Может пригодиться</h2>
          <ul className="cart-related-list">{shownRecommended.map(renderRow)}</ul>
        </div>
      ) : null}
      {!expanded && hiddenCount > 0 ? (
        <button type="button" className="cart-related-more" onClick={() => setExpanded(true)}>
          Ещё {hiddenCount}…
        </button>
      ) : null}
    </section>
  );
}
