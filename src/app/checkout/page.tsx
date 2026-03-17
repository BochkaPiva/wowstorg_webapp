"use client";

import { useRouter } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Customer = { id: string; name: string };

type CartLine = { itemId: string; qty: number };

function isCartLine(x: unknown): x is CartLine {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { itemId?: unknown }).itemId === "string" &&
    typeof (x as { qty?: unknown }).qty === "number"
  );
}

function loadCart(): CartLine[] {
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

function clearCart() {
  localStorage.removeItem("cart");
}

function todayDateOnly() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { state } = useAuth();

  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [customerId, setCustomerId] = React.useState("");

  const [readyByDate, setReadyByDate] = React.useState(todayDateOnly());
  const [startDate, setStartDate] = React.useState(todayDateOnly());
  const [endDate, setEndDate] = React.useState(todayDateOnly());

  const [eventName, setEventName] = React.useState("");
  const [comment, setComment] = React.useState("");

  const [deliveryEnabled, setDeliveryEnabled] = React.useState(false);
  const [deliveryComment, setDeliveryComment] = React.useState("");
  const [montageEnabled, setMontageEnabled] = React.useState(false);
  const [montageComment, setMontageComment] = React.useState("");
  const [demontageEnabled, setDemontageEnabled] = React.useState(false);
  const [demontageComment, setDemontageComment] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setCart(loadCart());
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      const res = await fetch("/api/customers", { cache: "no-store" });
      const data = (await res.json()) as { customers: Customer[] };
      if (!cancelled) {
        setCustomers(data.customers ?? []);
        if (!customerId && data.customers?.[0]?.id) setCustomerId(data.customers[0].id);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canCheckout =
    state.status === "authenticated" &&
    state.user.role === "GREENWICH" &&
    cart.length > 0 &&
    Boolean(customerId);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId,
          readyByDate,
          startDate,
          endDate,
          eventName: eventName.trim() || undefined,
          comment: comment.trim() || undefined,
          deliveryEnabled,
          deliveryComment: deliveryEnabled ? deliveryComment.trim() || undefined : undefined,
          montageEnabled,
          montageComment: montageEnabled ? montageComment.trim() || undefined : undefined,
          demontageEnabled,
          demontageComment: demontageEnabled ? demontageComment.trim() || undefined : undefined,
          lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty })),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { orderId?: string; error?: { message?: string } }
        | null;

      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось создать заявку");
        return;
      }

      clearCart();
      setCart([]);
      router.replace(`/orders/${data?.orderId ?? ""}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Оформление заявки">
      {state.status === "authenticated" && state.user.role !== "GREENWICH" ? (
        <div className="text-sm text-zinc-600">
          Оформление заявки из корзины v1 рассчитано на Greenwich. Для склада будет отдельный
          режим (для Greenwich/для внешнего клиента).
        </div>
      ) : cart.length === 0 ? (
        <div className="text-sm text-zinc-600">
          Корзина пуста. Добавьте позиции в каталоге.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-sm font-medium text-zinc-800">Заказчик *</div>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {customers.length === 0 ? (
                <div className="mt-1 text-xs text-zinc-500">
                  Нет заказчиков. Wowstorg должен создать хотя бы одного заказчика.
                </div>
              ) : null}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-zinc-800">Название мероприятия</div>
              <input
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <div className="text-sm font-medium text-zinc-800">
                К какой дате готово *
              </div>
              <input
                type="date"
                value={readyByDate}
                onChange={(e) => setReadyByDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>
            <label className="block">
              <div className="text-sm font-medium text-zinc-800">
                Дата начала *
              </div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>
            <label className="block">
              <div className="text-sm font-medium text-zinc-800">
                Дата окончания *
              </div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>
          </div>

          <label className="block">
            <div className="text-sm font-medium text-zinc-800">Комментарий</div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-1 min-h-24 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>

          <div className="rounded-2xl border border-zinc-200 p-4">
            <div className="mb-2 text-sm font-semibold">Доп. услуги</div>
            <div className="space-y-3">
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={deliveryEnabled}
                    onChange={(e) => setDeliveryEnabled(e.target.checked)}
                  />
                  Доставка
                </label>
                {deliveryEnabled ? (
                  <textarea
                    value={deliveryComment}
                    onChange={(e) => setDeliveryComment(e.target.value)}
                    className="mt-2 min-h-20 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="Комментарий к доставке…"
                  />
                ) : null}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={montageEnabled}
                    onChange={(e) => setMontageEnabled(e.target.checked)}
                  />
                  Монтаж
                </label>
                {montageEnabled ? (
                  <textarea
                    value={montageComment}
                    onChange={(e) => setMontageComment(e.target.value)}
                    className="mt-2 min-h-20 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="Комментарий к монтажу…"
                  />
                ) : null}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={demontageEnabled}
                    onChange={(e) => setDemontageEnabled(e.target.checked)}
                  />
                  Демонтаж
                </label>
                {demontageEnabled ? (
                  <textarea
                    value={demontageComment}
                    onChange={(e) => setDemontageComment(e.target.value)}
                    className="mt-2 min-h-20 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="Комментарий к демонтажу…"
                  />
                ) : null}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <button
            disabled={!canCheckout || loading || customers.length === 0}
            onClick={submit}
            className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Создаём заявку…" : "Создать заявку"}
          </button>
        </div>
      )}
    </AppShell>
  );
}

