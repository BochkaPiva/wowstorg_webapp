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

const WHEEL_LOCK_MS = 420;
const AUTO_INTERVAL_MS = 3400;

function mod(n: number, m: number): number {
  if (m <= 0) return 0;
  return ((n % m) + m) % m;
}

function DrumCard({
  row,
  offset,
  displayMultiplier,
  onAdd,
  onDismiss,
}: {
  row: MergedSuggestionRow;
  offset: number;
  displayMultiplier: number;
  onAdd: () => void;
  onDismiss: (event: React.MouseEvent) => void;
}) {
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
    <>
      <button
        type="button"
        className="catalog-related-drum-card"
        disabled={!canAdd || !isVisible}
        tabIndex={isVisible ? 0 : -1}
        onClick={onAdd}
      >
        <span className="catalog-related-drum-card-glass" aria-hidden="true" />
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
        <button type="button" className="catalog-related-drum-dismiss" onClick={onDismiss}>
          Не нужно
        </button>
      ) : null}
    </>
  );
}

export function CatalogRelatedDrum({ rows, cartScope, displayMultiplier = 1, onAdd, onDismiss }: Props) {
  const count = rows.length;
  const loopEnabled = count > 1;
  const autoScrollEnabled = count >= 3;

  const extendedRows = React.useMemo(
    () => (loopEnabled ? [...rows, ...rows, ...rows] : rows),
    [rows, loopEnabled],
  );

  const [trackIndex, setTrackIndex] = React.useState(() => (loopEnabled ? count : 0));
  const [transitionEnabled, setTransitionEnabled] = React.useState(true);

  const wheelLockedRef = React.useRef(false);
  const pausedRef = React.useRef(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    if (!loopEnabled) {
      setTrackIndex(0);
      return;
    }
    setTrackIndex((prev) => {
      const logical = mod(prev - count, count);
      return count + logical;
    });
  }, [count, loopEnabled]);

  const step = React.useCallback(
    (direction: 1 | -1) => {
      if (!loopEnabled) return;
      setTrackIndex((prev) => prev + direction);
    },
    [loopEnabled],
  );

  const pauseTemporarily = React.useCallback((ms = AUTO_INTERVAL_MS) => {
    pausedRef.current = true;
    window.setTimeout(() => {
      pausedRef.current = false;
    }, ms);
  }, []);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || !loopEnabled || count <= 1) return;

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName !== "transform") return;

      if (trackIndex >= count * 2) {
        setTransitionEnabled(false);
        setTrackIndex((prev) => prev - count);
        return;
      }

      if (trackIndex < count) {
        setTransitionEnabled(false);
        setTrackIndex((prev) => prev + count);
      }
    };

    track.addEventListener("transitionend", onTransitionEnd);
    return () => track.removeEventListener("transitionend", onTransitionEnd);
  }, [trackIndex, count, loopEnabled]);

  React.useEffect(() => {
    if (transitionEnabled) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setTransitionEnabled(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [transitionEnabled]);

  React.useEffect(() => {
    if (!autoScrollEnabled) return;

    const id = window.setInterval(() => {
      if (pausedRef.current || wheelLockedRef.current) return;
      step(1);
    }, AUTO_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [autoScrollEnabled, step]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !loopEnabled) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (wheelLockedRef.current) return;

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 6) return;

      wheelLockedRef.current = true;
      pauseTemporarily(WHEEL_LOCK_MS + 200);
      window.setTimeout(() => {
        wheelLockedRef.current = false;
      }, WHEEL_LOCK_MS);

      step(delta > 0 ? 1 : -1);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [loopEnabled, pauseTemporarily, step]);

  if (count === 0) return null;

  function handleAdd(row: MergedSuggestionRow) {
    const availability = row.availability ?? { availableNow: 0 };
    const maxAvail = availability.availableForDates ?? availability.availableNow ?? 0;
    const qty = Math.min(row.totalSuggestedQty, maxAvail > 0 ? maxAvail : row.totalSuggestedQty);
    if (maxAvail <= 0) return;

    pauseTemporarily();
    onAdd(row.relatedItemId, qty, row.pricePerDay, maxAvail);
    onDismiss(dismissRelatedSuggestion(cartScope, row.relatedItemId));
  }

  function handleDismiss(row: MergedSuggestionRow, event: React.MouseEvent) {
    event.stopPropagation();
    pauseTemporarily();
    onDismiss(dismissRelatedSuggestion(cartScope, row.relatedItemId));
  }

  return (
    <section
      className="catalog-related-drum"
      aria-label="Рекомендуем добавить"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
      onFocusCapture={() => {
        pausedRef.current = true;
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          pausedRef.current = false;
        }
      }}
    >
      <h2 className="catalog-related-drum-title">Рекомендуем добавить</h2>

      <div className="catalog-related-drum-shell">
        <div className="catalog-related-drum-backdrop" aria-hidden="true" />
        <div
          className="catalog-related-drum-viewport"
          ref={viewportRef}
          tabIndex={0}
          style={{ ["--drum-index" as string]: trackIndex }}
          onKeyDown={(event) => {
            if (!loopEnabled) return;
            if (event.key === "ArrowRight") {
              event.preventDefault();
              pauseTemporarily();
              step(1);
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              pauseTemporarily();
              step(-1);
            }
          }}
        >
          <ul
            ref={trackRef}
            className={[
              "catalog-related-drum-track",
              transitionEnabled ? "catalog-related-drum-track--animated" : "catalog-related-drum-track--instant",
            ].join(" ")}
          >
            {extendedRows.map((row, index) => {
              const offset = index - trackIndex;
              const isVisible = Math.abs(offset) <= 1;

              return (
                <li
                  key={`${row.relatedItemId}-${index}`}
                  className={[
                    "catalog-related-drum-item",
                    offset === 0 ? "catalog-related-drum-item--center" : "",
                    offset === -1 ? "catalog-related-drum-item--left" : "",
                    offset === 1 ? "catalog-related-drum-item--right" : "",
                    !isVisible ? "catalog-related-drum-item--far" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden={!isVisible}
                >
                  <DrumCard
                    row={row}
                    offset={offset}
                    displayMultiplier={displayMultiplier}
                    onAdd={() => handleAdd(row)}
                    onDismiss={(event) => handleDismiss(row, event)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {loopEnabled ? (
        <p className="catalog-related-drum-hint">
          {autoScrollEnabled
            ? "Листайте колёсиком или дождитесь автопрокрутки"
            : "Листайте колёсиком мыши"}
        </p>
      ) : null}
    </section>
  );
}
