"use client";

import React from "react";

import { dismissRelatedSuggestion } from "@/lib/cart-related-dismiss";

import {
  formatSourceNamesRu,
  mergeByTarget,
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

const WHEEL_LOCK_MS = 360;

function clampIndex(index: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(index, max - 1));
}

export function CatalogRelatedDrum({ rows, cartScope, displayMultiplier = 1, onAdd, onDismiss }: Props) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const wheelLockedRef = React.useRef(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setActiveIndex((prev) => clampIndex(prev, rows.length));
  }, [rows.length]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || rows.length <= 1) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (wheelLockedRef.current) return;
      if (Math.abs(event.deltaY) < 6) return;

      wheelLockedRef.current = true;
      window.setTimeout(() => {
        wheelLockedRef.current = false;
      }, WHEEL_LOCK_MS);

      setActiveIndex((prev) => clampIndex(prev + (event.deltaY > 0 ? 1 : -1), rows.length));
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [rows.length]);

  if (rows.length === 0) return null;

  const safeIndex = clampIndex(activeIndex, rows.length);

  function handleAdd(row: MergedSuggestionRow) {
    const availability = row.availability ?? { availableNow: 0 };
    const maxAvail = availability.availableForDates ?? availability.availableNow ?? 0;
    const qty = Math.min(row.totalSuggestedQty, maxAvail > 0 ? maxAvail : row.totalSuggestedQty);
    if (maxAvail <= 0) return;

    onAdd(row.relatedItemId, qty, row.pricePerDay, maxAvail);
    onDismiss(dismissRelatedSuggestion(cartScope, row.relatedItemId));
  }

  function handleDismiss(row: MergedSuggestionRow, event: React.MouseEvent) {
    event.stopPropagation();
    onDismiss(dismissRelatedSuggestion(cartScope, row.relatedItemId));
  }

  return (
    <section className="catalog-related-drum" aria-label="Рекомендуем добавить">
      <h2 className="catalog-related-drum-title">Рекомендуем добавить</h2>

      <div className="catalog-related-drum-shell">
        <div
          className="catalog-related-drum-viewport"
          ref={viewportRef}
          tabIndex={0}
          style={{ ["--drum-index" as string]: safeIndex }}
          onKeyDown={(event) => {
            if (rows.length <= 1) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((prev) => clampIndex(prev + 1, rows.length));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((prev) => clampIndex(prev - 1, rows.length));
            }
          }}
        >
          <ul className="catalog-related-drum-track">
            {rows.map((row, index) => {
              const offset = index - safeIndex;
              const availability = row.availability ?? { availableNow: 0 };
              const maxAvail = availability.availableForDates ?? availability.availableNow ?? 0;
              const qty = Math.min(row.totalSuggestedQty, maxAvail > 0 ? maxAvail : row.totalSuggestedQty);
              const canAdd = maxAvail > 0;
              const price = row.pricePerDay * displayMultiplier;
              const sourceLabel =
                row.sources.length === 1
                  ? `к «${row.sources[0]!.sourceItemName}»`
                  : `к ${formatSourceNamesRu(row.sources.map((source) => source.sourceItemName))}`;
              const isVisible = Math.abs(offset) <= 1;

              return (
                <li
                  key={row.relatedItemId}
                  className={[
                    "catalog-related-drum-item",
                    offset === 0 ? "catalog-related-drum-item--center" : "",
                    offset === -1 ? "catalog-related-drum-item--above" : "",
                    offset === 1 ? "catalog-related-drum-item--below" : "",
                    !isVisible ? "catalog-related-drum-item--far" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden={!isVisible}
                >
                  <button
                    type="button"
                    className="catalog-related-drum-card"
                    disabled={!canAdd || !isVisible}
                    tabIndex={isVisible ? 0 : -1}
                    onClick={() => handleAdd(row)}
                  >
                    {renderRelatedThumb(row.relatedItemId, row.photo1Key, offset === 0 ? 44 : 36, "catalog-related-drum-thumb")}
                    <span className="catalog-related-drum-copy">
                      <span className="catalog-related-drum-name">{row.name}</span>
                      <span className="catalog-related-drum-source">{sourceLabel}</span>
                      <span className="catalog-related-drum-meta">
                        {canAdd ? (
                          <>
                            доступно {maxAvail} · {price.toFixed(0)} р/сут
                            {row.totalSuggestedQty > 1 ? ` · +${row.totalSuggestedQty}` : ""}
                          </>
                        ) : (
                          <span className="cart-related-unavailable">нет на выбранные даты</span>
                        )}
                      </span>
                    </span>
                    <span className="catalog-related-drum-add">{canAdd ? `+ ${qty}` : "—"}</span>
                  </button>
                  {isVisible ? (
                    <button type="button" className="catalog-related-drum-dismiss" onClick={(event) => handleDismiss(row, event)}>
                      Не нужно
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {rows.length > 1 ? (
        <p className="catalog-related-drum-hint">Крутите колёсико мыши, чтобы посмотреть другие рекомендации</p>
      ) : null}
    </section>
  );
}

export { mergeByTarget };
