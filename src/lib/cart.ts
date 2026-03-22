export type CartLine = { itemId: string; qty: number; pricePerDay?: number };

function cartStorageKey(scope?: string): string {
  return scope?.trim() ? `cart:${scope.trim()}` : "cart";
}

function isCartLine(x: unknown): x is CartLine {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { itemId?: unknown }).itemId === "string" &&
    typeof (x as { qty?: unknown }).qty === "number"
  );
}

export function loadCart(scope?: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(cartStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[], scope?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(cartStorageKey(scope), JSON.stringify(lines));
}

export function clearCart(scope?: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(cartStorageKey(scope));
}
