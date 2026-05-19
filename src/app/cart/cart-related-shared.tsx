import React from "react";

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

export type MergedSource = {
  sourceItemId: string;
  sourceItemName: string;
  sourcePhoto1Key: string | null;
  sourceQtyInCart: number;
  suggestedQty: number;
};

export type MergedSuggestionRow = CartRelatedSuggestion & {
  sources: MergedSource[];
  totalSuggestedQty: number;
};

export function mergeByTarget(
  groups: CartRelatedSuggestionGroup[],
  kind: CartRelatedSuggestion["kind"],
): MergedSuggestionRow[] {
  const map = new Map<string, MergedSuggestionRow>();

  for (const group of groups) {
    for (const suggestion of group.suggestions) {
      if (suggestion.kind !== kind) continue;

      const source: MergedSource = {
        sourceItemId: group.sourceItemId,
        sourceItemName: group.sourceItemName,
        sourcePhoto1Key: group.sourcePhoto1Key,
        sourceQtyInCart: group.sourceQtyInCart,
        suggestedQty: suggestion.suggestedQty,
      };

      const prev = map.get(suggestion.relatedItemId);
      if (!prev) {
        map.set(suggestion.relatedItemId, {
          ...suggestion,
          sources: [source],
          totalSuggestedQty: suggestion.suggestedQty,
        });
        continue;
      }

      prev.sources.push(source);
      prev.totalSuggestedQty += suggestion.suggestedQty;
    }
  }

  return [...map.values()];
}

export function formatSourceNamesRu(names: string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} и ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} и ${unique[unique.length - 1]}`;
}

export function renderRelatedThumb(itemId: string, photo1Key: string | null, size: number, className?: string) {
  return (
    <span className={["cart-thumbWrap cart-related-thumb", className].filter(Boolean).join(" ")} aria-hidden="true">
      {photo1Key ? (
        <img
          src={`/api/inventory/positions/${itemId}/photo?w=${size}`}
          alt=""
          className="cart-thumb"
          loading="lazy"
        />
      ) : (
        <span className="cart-thumbPlaceholder">
          <span>WOW</span>
        </span>
      )}
    </span>
  );
}
