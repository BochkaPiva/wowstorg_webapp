"use client";

import React from "react";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";
import type { OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";

type ArchiveOrder = {
  id: string;
  status: string;
  source: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string };
  greenwichUser: { id: string; displayName: string } | null;
};

function fmtDateRu(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

function statusRu(s: string) {
  switch (s) {
    case "CLOSED":
      return "Завершена";
    case "CANCELLED":
      return "Отменена";
    default:
      return s;
  }
}

function statusHeaderClass(status: string): string {
  return status === "CANCELLED"
    ? "bg-[#5b0b17]/10 text-[#5b0b17]"
    : status === "CLOSED"
      ? "bg-violet-50 text-violet-900"
      : "bg-white";
}

export default function WarehouseArchivePage() {
  const { state } = useAuth();
  const role = state.status === "authenticated" ? state.user.role : null;
  const forbidden =
    state.status === "authenticated" && role !== "WOWSTORG";

  const [orders, setOrders] = React.useState<ArchiveOrder[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/warehouse/archive", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { orders?: ArchiveOrder[] }) => {
        if (!cancelled) setOrders(data.orders ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.status, role]);

  return (
    <AppShell title="Архив заявок">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-600">
              Здесь завершённые и отменённые заявки.
            </div>
            <Link
              href="/warehouse/queue"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-violet-50"
            >
              ← В очередь
            </Link>
          </div>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-zinc-600">Архив пуст.</div>
          ) : (
            <div className="space-y-2">
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
                    <OrderStatusStepper status={o.status as OrderStatus} />
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-zinc-900">
                        {o.customer.name}
                        {o.greenwichUser ? ` · ${o.greenwichUser.displayName}` : ""}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-zinc-600">
                      Готовность: <span className="font-semibold">{fmtDateRu(o.readyByDate)}</span>{" "}
                      · Период: <span className="font-semibold">{fmtDateRu(o.startDate)}</span> —{" "}
                      <span className="font-semibold">{fmtDateRu(o.endDate)}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Обновлено: {fmtDateRu(o.updatedAt)} · ID: {o.id}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/orders/${o.id}?from=warehouse-archive`}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
                      >
                        Открыть заявку
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

