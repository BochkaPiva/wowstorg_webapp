"use client";

import React from "react";

import {
  clearDismissedRelated,
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

export type CartRelatedSuggestionGroup = {
  sourceItemId: string;
  sourceItemName: string;
  sourcePhoto1Key: string | null;
  sourceQtyInCart: number;
  suggestions: CartRelatedSuggestion[];
};

type Props = {
  cartScope?: string;
  itemIds: string[];
  qtys: number[];
  startDate: string | null;
  endDate: string | null;
  rentalStartPartOfDay: "MORNING" | "EVENING";
  rentalEndPartOfDay: "MORNING" | "EVENING";
  excludeOrderId?: string | null;
  disabled?: boolean;
  displayMultiplier?: number;
  variant?: "cart" | "catalog";
  onAdd: (itemId: string, qty: number, pricePerDay: number, maxAvail: number) => void;
};

const FLAT_LIMIT = 8;

function filterGroupsByKind(
  groups: CartRelatedSuggestionGroup[],
  kind: CartRelatedSuggestion["kind"],
  dismissed: Set<string>,
): CartRelatedSuggestionGroup[] {
  return groups
    .map((group) => ({
      ...group,
      suggestions: group.suggestions.filter((s) => s.kind === kind && !dismissed.has(s.relatedItemId)),
    }))
    .filter((group) => group.suggestions.length > 0);
}

function countSuggestions(groups: CartRelatedSuggestionGroup[]): number {
  return groups.reduce((sum, group) => sum + group.suggestions.length, 0);
}

function limitGroups(
  groups: CartRelatedSuggestionGroup[],
  limit: number,
): { groups: CartRelatedSuggestionGroup[]; hiddenCount: number } {
  let remaining = limit;
  const limited: CartRelatedSuggestionGroup[] = [];
  let hiddenCount = 0;

  for (const group of groups) {
    if (remaining <= 0) {
      hiddenCount += group.suggestions.length;
      continue;
    }
    if (group.suggestions.length <= remaining) {
      limited.push(group);
      remaining -= group.suggestions.length;
      continue;
    }
    limited.push({ ...group, suggestions: group.suggestions.slice(0, remaining) });
    hiddenCount += group.suggestions.length - remaining;
    remaining = 0;
  }

  return { groups: limited, hiddenCount };
}

function renderThumb(itemId: string, photo1Key: string | null, size: number, className?: string) {
  return (
    <div className={["cart-thumbWrap cart-related-thumb", className].filter(Boolean).join(" ")} aria-hidden="true">
      {photo1Key ? (
        <img
          src={`/api/inventory/positions/${itemId}/photo?w=${size}`}
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
  );
}

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
  variant = "cart",
  onAdd,
}: Props) {
  const [groups, setGroups] = React.useState<CartRelatedSuggestionGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => loadDismissedRelatedIds(cartScope));

  React.useEffect(() => {
    setDismissed(loadDismissedRelatedIds(cartScope));
  }, [cartScope]);

  const prevItemCountRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const count = itemIds.length;
    if (prevItemCountRef.current === null) {
      prevItemCountRef.current = count;
      return;
    }
    if (prevItemCountRef.current === 0 && count > 0) {
      clearDismissedRelated(cartScope);
      setDismissed(new Set());
    }
    prevItemCountRef.current = count;
  }, [itemIds.length, cartScope]);

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

  const groupsRef = React.useRef(groups);
  groupsRef.current = groups;

  React.useEffect(() => {
    if (disabled || itemIds.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      if (groupsRef.current.length === 0) setLoading(true);
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
        const data = (await res.json().catch(() => null)) as { groups?: CartRelatedSuggestionGroup[] } | null;
        if (!cancelled) setGroups(data?.groups ?? []);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [disabled, requestKey, startDate, endDate, rentalStartPartOfDay, rentalEndPartOfDay, excludeOrderId]);

  const visibleGroups = React.useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          suggestions: group.suggestions.filter((s) => !dismissed.has(s.relatedItemId)),
        }))
        .filter((group) => group.suggestions.length > 0),
    [groups, dismissed],
  );

  const visibleCount = countSuggestions(visibleGroups);
  const { groups: shownGroups, hiddenCount } = expanded
    ? { groups: visibleGroups, hiddenCount: 0 }
    : limitGroups(visibleGroups, FLAT_LIMIT);

  const shownRequired = filterGroupsByKind(shownGroups, "REQUIRED", dismissed);
  const shownRecommended = filterGroupsByKind(shownGroups, "RECOMMENDED", dismissed);

  if (disabled || itemIds.length === 0) return null;
  if (visibleCount === 0) return null;

  const isCatalog = variant === "catalog";
  const thumbSize = isCatalog ? 40 : 56;
  const sourceThumbSize = isCatalog ? 36 : 48;

  function renderTarget(s: CartRelatedSuggestion, groupKey: string) {
    const maxAvail = s.availability.availableForDates ?? s.availability.availableNow;
    const qty = Math.min(s.suggestedQty, maxAvail > 0 ? maxAvail : s.suggestedQty);
    const canAdd = maxAvail > 0;
    const price = s.pricePerDay * displayMultiplier;

    return (
      <li key={`${groupKey}-${s.relatedItemId}`} className="cart-related-target">
        <div className="cart-related-target-main">
          {renderThumb(s.relatedItemId, s.photo1Key, thumbSize, "cart-related-target-thumb")}
          <div className="cart-related-text">
            <div className="cart-related-name">{s.name}</div>
            {s.note ? <div className="cart-related-note">{s.note}</div> : null}
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
            onClick={() => onAdd(s.relatedItemId, qty, s.pricePerDay, maxAvail)}
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

  function renderGroupRow(group: CartRelatedSuggestionGroup, kind: CartRelatedSuggestion["kind"]) {
    const suggestions = group.suggestions.filter((s) => s.kind === kind);
    if (suggestions.length === 0) return null;

    return (
      <li key={`${kind}-${group.sourceItemId}`} className="cart-related-group">
        <div className="cart-related-group-source">
          {renderThumb(group.sourceItemId, group.sourcePhoto1Key, sourceThumbSize, "cart-related-source-thumb")}
          <div className="cart-related-group-sourceText">
            <div className="cart-related-group-sourceName">{group.sourceItemName}</div>
            {group.sourceQtyInCart > 1 ? (
              <div className="cart-related-group-sourceQty">× {group.sourceQtyInCart} в корзине</div>
            ) : null}
          </div>
        </div>
        <div className="cart-related-group-connector" aria-hidden="true">
          →
        </div>
        <ul className="cart-related-group-targets">{suggestions.map((s) => renderTarget(s, group.sourceItemId))}</ul>
      </li>
    );
  }

  function renderSection(title: string, sectionGroups: CartRelatedSuggestionGroup[], kind: CartRelatedSuggestion["kind"]) {
    const rows = sectionGroups
      .map((group) => renderGroupRow(group, kind))
      .filter((row): row is React.ReactElement => Boolean(row));
    if (rows.length === 0) return null;

    return (
      <div className="cart-related-section">
        <h2 className="cart-related-title">{title}</h2>
        <ul className="cart-related-list">{rows}</ul>
      </div>
    );
  }

  return (
    <section
      className={["cart-related", isCatalog ? "cart-related--catalog" : ""].filter(Boolean).join(" ")}
      aria-label="Рекомендации к корзине"
    >
      {renderSection("Обычно нужно вместе", shownRequired, "REQUIRED")}
      {renderSection("Может пригодиться", shownRecommended, "RECOMMENDED")}
      {!expanded && hiddenCount > 0 ? (
        <button type="button" className="cart-related-more" onClick={() => setExpanded(true)}>
          Ещё {hiddenCount}…
        </button>
      ) : null}
    </section>
  );
}
