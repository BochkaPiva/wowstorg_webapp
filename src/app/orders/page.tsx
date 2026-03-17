"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";

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

export default function OrdersPage() {
  const [orders, setOrders] = React.useState<OrderCard[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await fetch("/api/orders/my", { cache: "no-store" });
      const data = (await res.json()) as { orders: OrderCard[] };
      if (!cancelled) {
        setOrders(data.orders ?? []);
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell title="Мои заявки">
      {loading ? (
        <div className="text-sm text-zinc-600">Загрузка…</div>
      ) : orders.length === 0 ? (
        <div className="text-sm text-zinc-600">Пока нет заявок.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {orders.map((o) => (
            <div
              key={o.id}
              className="rounded-2xl border border-zinc-200 p-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">{o.customer.name}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Статус:{" "}
                    <span className="font-medium text-zinc-900">
                      {STATUS_LABEL[o.status]}
                    </span>
                    {" · "}Готово к:{" "}
                    <span className="font-medium">
                      {new Date(o.readyByDate).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/orders/${o.id}`}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                >
                  Подробнее
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

