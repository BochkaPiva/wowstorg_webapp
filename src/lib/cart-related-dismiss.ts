const STORAGE_PREFIX = "cartRelatedDismissed:";

/** Должен совпадать с областью корзины: без scope — ключ `cart`, иначе scope как есть. */
export function cartRelatedDismissScope(scope?: string): string {
  return scope?.trim() || "cart";
}

function storageKey(scope?: string): string {
  return `${STORAGE_PREFIX}${cartRelatedDismissScope(scope)}`;
}

function readDismissedRaw(scope?: string): string | null {
  if (typeof window === "undefined") return null;
  const key = storageKey(scope);
  const raw = localStorage.getItem(key);
  if (raw) return raw;

  // Миграция со старого ключа `default` (до выравнивания с cart scope).
  if (cartRelatedDismissScope(scope) === "cart") {
    const legacy = localStorage.getItem(`${STORAGE_PREFIX}default`);
    if (legacy) {
      localStorage.setItem(key, legacy);
      localStorage.removeItem(`${STORAGE_PREFIX}default`);
      return legacy;
    }
  }

  return null;
}

export function loadDismissedRelatedIds(scope?: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = readDismissedRaw(scope);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string" && v.length > 0));
  } catch {
    return new Set();
  }
}

export function dismissRelatedSuggestion(scope: string | undefined, relatedItemId: string): Set<string> {
  const next = loadDismissedRelatedIds(scope);
  next.add(relatedItemId);
  if (typeof window !== "undefined") {
    localStorage.setItem(storageKey(scope), JSON.stringify([...next]));
  }
  return next;
}

export function clearDismissedRelated(scope?: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(scope));
  if (cartRelatedDismissScope(scope) === "cart") {
    localStorage.removeItem(`${STORAGE_PREFIX}default`);
  }
}
