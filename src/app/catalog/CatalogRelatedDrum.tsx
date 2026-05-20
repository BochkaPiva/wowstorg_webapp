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

const AUTO_INTERVAL_MS = 5000;
const PAUSE_AFTER_ROWS_CHANGE_MS = 6500;
const SLIDE_MS = 460;
const WHEEL_LOCK_MS = SLIDE_MS + 120;

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
  const isCenter = offset === 0;
  const sourceLabel =
    row.sources.length === 1
      ? `Для «${row.sources[0]!.sourceItemName}»`
      : `Для ${formatSourceNamesRu(row.sources.map((source) => source.sourceItemName))}`;

  return (
    <article
      className={[
        "catalog-related-drum-card",
        isCenter ? "catalog-related-drum-card--center" : "",
        offset === -1 ? "catalog-related-drum-card--side" : "",
        offset === 1 ? "catalog-related-drum-card--side" : "",
        offset === -2 || offset === 2 ? "catalog-related-drum-card--far" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="catalog-related-drum-card-main"
        disabled={!canAdd}
        tabIndex={Math.abs(offset) <= 1 ? 0 : -1}
        onClick={onAdd}
      >
        {renderRelatedThumb(row.relatedItemId, row.photo1Key, 44, "catalog-related-drum-thumb")}
        <span className="catalog-related-drum-copy">
          <span className="catalog-related-drum-headline">
            <span className="catalog-related-drum-name">{row.name}</span>
            <span
              className={[
                "catalog-related-drum-badge",
                row.kind === "REQUIRED" ? "catalog-related-drum-badge--required" : "catalog-related-drum-badge--recommended",
              ].join(" ")}
            >
              {row.kind === "REQUIRED" ? "Нужно" : "Совет"}
            </span>
          </span>
          <span className="catalog-related-drum-source">{sourceLabel}</span>
          <span className="catalog-related-drum-note">{row.note ?? "\u00a0"}</span>
          {canAdd ? (
            <span className="catalog-related-drum-pricing">
              <span className="catalog-related-drum-price">{price.toFixed(0)} ₽/сут</span>
              <span className="catalog-related-drum-meta">
                Доступно {maxAvail}
                {row.totalSuggestedQty > 1 ? ` · рекомендуем ${row.totalSuggestedQty} шт.` : ""}
              </span>
            </span>
          ) : (
            <span className="catalog-related-drum-meta">
              <span className="cart-related-unavailable">Нет на выбранные даты</span>
            </span>
          )}
        </span>
        <span className="catalog-related-drum-add">{canAdd ? `+ ${qty}` : "—"}</span>
      </button>
      <div className="catalog-related-drum-dismiss-slot">
        {isCenter ? (
          <button type="button" className="catalog-related-drum-dismiss" onClick={onDismiss}>
            Не нужно
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function CatalogRelatedDrum({ rows, cartScope, displayMultiplier = 1, onAdd, onDismiss }: Props) {
  const count = rows.length;
  const rowIdsKey = rows.map((row) => row.relatedItemId).join("|");
  const loopEnabled = count > 1;
  const autoScrollEnabled = count >= 3;

  const [logicalIndex, setLogicalIndex] = React.useState(0);
  const [slideShift, setSlideShift] = React.useState(0);
  const [transitionEnabled, setTransitionEnabled] = React.useState(true);

  const logicalIndexRef = React.useRef(0);
  const animatingRef = React.useRef(false);
  const pendingDirectionRef = React.useRef<0 | 1 | -1>(0);
  const countRef = React.useRef(count);
  const pauseUntilRef = React.useRef(0);
  const pausedRef = React.useRef(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    pauseUntilRef.current = Date.now() + PAUSE_AFTER_ROWS_CHANGE_MS;
    countRef.current = count;
    if (count === 0) return;
    const clamped = Math.min(logicalIndexRef.current, count - 1);
    logicalIndexRef.current = clamped;
    setLogicalIndex(clamped);
    setSlideShift(0);
    setTransitionEnabled(false);
    requestAnimationFrame(() => setTransitionEnabled(true));
  }, [rowIdsKey, count]);

  const finishSlide = React.useCallback((direction: 1 | -1) => {
    const nextLogical = mod(logicalIndexRef.current + direction, countRef.current);
    logicalIndexRef.current = nextLogical;
    pendingDirectionRef.current = 0;
    setLogicalIndex(nextLogical);
    setSlideShift(0);
    setTransitionEnabled(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionEnabled(true);
        animatingRef.current = false;
      });
    });
  }, []);

  const beginSlide = React.useCallback(
    (direction: 1 | -1) => {
      if (!loopEnabled || animatingRef.current || countRef.current <= 1) return false;

      animatingRef.current = true;
      pendingDirectionRef.current = direction;
      setTransitionEnabled(true);
      setSlideShift(direction);
      return true;
    },
    [loopEnabled],
  );

  const slotRows = React.useMemo(() => {
    if (count === 0) return [];
    if (count === 1) {
      return [{ offset: 0 as const, row: rows[0]! }];
    }
    const offsets = count >= 3 ? ([-2, -1, 0, 1, 2] as const) : ([-1, 0, 1] as const);
    return offsets.map((offset) => ({
      offset,
      row: rows[mod(logicalIndex + offset, count)]!,
    }));
  }, [count, logicalIndex, rows]);

  const step = React.useCallback(
    (direction: 1 | -1) => beginSlide(direction),
    [beginSlide],
  );

  const pauseTemporarily = React.useCallback((ms = AUTO_INTERVAL_MS) => {
    pauseUntilRef.current = Date.now() + ms;
    pausedRef.current = true;
    window.setTimeout(() => {
      pausedRef.current = false;
    }, ms);
  }, []);

  React.useEffect(() => {
    if (!autoScrollEnabled) return;

    const id = window.setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      if (pausedRef.current || animatingRef.current) return;
      step(1);
    }, AUTO_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [autoScrollEnabled, step]);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || !loopEnabled) return;

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== track || event.propertyName !== "transform") return;
      const direction = pendingDirectionRef.current;
      if (!direction || !animatingRef.current) return;
      finishSlide(direction);
    };

    track.addEventListener("transitionend", onTransitionEnd);
    return () => track.removeEventListener("transitionend", onTransitionEnd);
  }, [finishSlide, loopEnabled]);

  React.useEffect(() => {
    if (slideShift === 0) return;
    const id = window.setTimeout(() => {
      const direction = pendingDirectionRef.current;
      if (direction && animatingRef.current) {
        finishSlide(direction);
      }
    }, SLIDE_MS + 100);
    return () => window.clearTimeout(id);
  }, [finishSlide, slideShift]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !loopEnabled) return;

    let wheelAccum = 0;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (animatingRef.current) return;

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      wheelAccum += delta;
      if (Math.abs(wheelAccum) < 36) return;

      const direction: 1 | -1 = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      if (step(direction)) {
        pauseTemporarily(WHEEL_LOCK_MS);
      }
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

    pauseTemporarily(PAUSE_AFTER_ROWS_CHANGE_MS);
    onAdd(row.relatedItemId, qty, row.pricePerDay, maxAvail);
    onDismiss(dismissRelatedSuggestion(cartScope, row.relatedItemId));
  }

  function handleDismiss(row: MergedSuggestionRow, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    pauseTemporarily(PAUSE_AFTER_ROWS_CHANGE_MS);
    onDismiss(dismissRelatedSuggestion(cartScope, row.relatedItemId));
  }

  const baseTrackShift = count === 1 ? 0 : count >= 3 ? 2 : 1;
  const trackShift = baseTrackShift + slideShift;

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
    >
      <h2 className="catalog-related-drum-title">Рекомендуем добавить</h2>

      <div className="catalog-related-drum-shell">
        <div className="catalog-related-drum-backdrop" aria-hidden="true" />
        <div className="catalog-related-drum-edge catalog-related-drum-edge--left" aria-hidden="true" />
        <div className="catalog-related-drum-edge catalog-related-drum-edge--right" aria-hidden="true" />
        <div
          className={[
            "catalog-related-drum-viewport",
            count === 1 ? "catalog-related-drum-viewport--single" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          ref={viewportRef}
          tabIndex={0}
          style={{ ["--drum-shift" as string]: trackShift }}
          onKeyDown={(event) => {
            if (!loopEnabled || animatingRef.current) return;
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
              count === 1 ? "catalog-related-drum-track--single" : "",
            ].join(" ")}
          >
            {slotRows.map(({ row, offset }) => (
              <li
                key={`slot-${offset}`}
                className={[
                  "catalog-related-drum-item",
                  offset === 0 ? "catalog-related-drum-item--center" : "",
                  offset === -1 || offset === 1 ? "catalog-related-drum-item--side" : "",
                  offset === -2 || offset === 2 ? "catalog-related-drum-item--far" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <DrumCard
                  row={row}
                  offset={offset}
                  displayMultiplier={displayMultiplier}
                  onAdd={() => handleAdd(row)}
                  onDismiss={(event) => handleDismiss(row, event)}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
