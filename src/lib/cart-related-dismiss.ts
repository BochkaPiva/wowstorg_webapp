const STORAGE_PREFIX = "cartRelatedDismissed:";

function storageKey(cartScope: string): string {
  return `${STORAGE_PREFIX}${cartScope.trim() || "default"}`;
}

export function loadDismissedRelatedIds(cartScope: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(cartScope));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string" && v.length > 0));
  } catch {
    return new Set();
  }
}

export function dismissRelatedSuggestion(cartScope: string, relatedItemId: string): Set<string> {
  const next = loadDismissedRelatedIds(cartScope);
  next.add(relatedItemId);
  if (typeof window !== "undefined") {
    localStorage.setItem(storageKey(cartScope), JSON.stringify([...next]));
  }
  return next;
}

export function clearDismissedRelated(cartScope: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(cartScope));
}
