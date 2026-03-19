"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";

type OrderCard = {
  id: string;
  status:
    | "SUBMITTED"
    | "ESTIMATE_SENT"
    | "CHANGES_REQUESTED"
    | "APPROVED_BY_GREENWICH"
    | "PICKING"
    | "ISSUED"
    | "RETURN_DECLARED"
    | "CLOSED"
    | "CANCELLED";
  source: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  customer: { id: string; name: string };
  totalAmount?: number;
};

const STATUS_LABEL: Record<OrderCard["status"], string> = {
  SUBMITTED: "Создана",
  ESTIMATE_SENT: "Смета отправлена",
  CHANGES_REQUESTED: "Нужны правки",
  APPROVED_BY_GREENWICH: "Согласована",
  PICKING: "Сборка",
  ISSUED: "Выдана",
  RETURN_DECLARED: "На приёмке",
  CLOSED: "Закрыта",
  CANCELLED: "Отменена",
};

const CANCELLABLE: OrderCard["status"][] = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED"];

function statusHeaderClass(status: OrderCard["status"]): string {
  return status === "CANCELLED"
    ? "bg-[#5b0b17]/10 text-[#5b0b17]"
    : status === "CLOSED"
      ? "bg-violet-50 text-violet-900"
    : "bg-white";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function OrdersPage() {
  const [orders, setOrders] = React.useState<OrderCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);

  const loadOrders = React.useCallback(() => {
    fetch("/api/orders/my", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { orders?: OrderCard[] }) => setOrders(data.orders ?? []));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/orders/my", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { orders?: OrderCard[] }) => {
        if (!cancelled) setOrders(data.orders ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function cancelOrder(orderId: string) {
    if (!confirm("Отменить заявку? Она попадёт в архив.")) return;
    setCancellingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (res.ok) {
        loadOrders();
      } else {
        alert(data?.error?.message ?? "Не удалось отменить заявку");
      }
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <AppShell title="Мои заявки">
      {loading ? (
        <div className="text-sm text-zinc-600">Загрузка…</div>
      ) : orders.length === 0 ? (
        <div className="text-sm text-zinc-600">Пока нет заявок.</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div
              key={o.id}
              className={[
                "rounded-2xl border overflow-hidden shadow-sm transition",
                o.status === "CANCELLED"
                  ? "border-[#5b0b17]/25 bg-[#5b0b17]/[0.03] hover:border-[#5b0b17]/40"
                  : "border-zinc-200 bg-white hover:border-violet-200",
              ].join(" ")}
            >
              <div className={["px-4 py-5", statusHeaderClass(o.status)].join(" ")}>
                <OrderStatusStepper status={o.status} />
              </div>
              <div className="p-4">
                <div className="text-sm font-semibold text-zinc-900">{o.customer.name}</div>
                <div className="mt-2 text-sm text-zinc-600">
                  Готовность к: <span className="font-semibold">{fmtDate(o.readyByDate)}</span>
                  {" · "}
                  Период: <span className="font-semibold">{fmtDate(o.startDate)}</span> —{" "}
                  <span className="font-semibold">{fmtDate(o.endDate)}</span>
                  {o.totalAmount != null ? (
                    <span className="ml-2 inline-flex items-baseline gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-bold text-violet-800">
                      {o.totalAmount.toLocaleString("ru-RU")} ₽
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/orders/${o.id}`}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
                  >
                    Открыть заявку
                  </Link>
                  {CANCELLABLE.includes(o.status) && (
                    <button
                      type="button"
                      disabled={cancellingId === o.id}
                      onClick={() => cancelOrder(o.id)}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {cancellingId === o.id ? "…" : "Отменить заявку"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
