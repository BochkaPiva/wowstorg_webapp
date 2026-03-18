export type CartLine = { itemId: string; qty: number; pricePerDay?: number };

function isCartLine(x: unknown): x is CartLine {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { itemId?: unknown }).itemId === "string" &&
    typeof (x as { qty?: unknown }).qty === "number"
  );
}

export function loadCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("cart");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("cart", JSON.stringify(lines));
}

export function clearCart() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("cart");
}
