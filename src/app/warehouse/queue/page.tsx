"use client";

import React from "react";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";
import type { OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";

type QueueOrder = {
  id: string;
  parentOrderId?: string | null;
  status: string;
  source: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  customer: { id: string; name: string };
  greenwichUser: { id: string; displayName: string; ratingScore?: number } | null;
  warehouseInternalNote?: string | null;
  totalAmount?: number;
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
    case "SUBMITTED":
      return "Новая";
    case "ESTIMATE_SENT":
      return "Смета отправлена";
    case "CHANGES_REQUESTED":
      return "Запрошены изменения";
    case "APPROVED_BY_GREENWICH":
      return "Согласовано Grinvich";
    case "PICKING":
      return "Сборка";
    case "ISSUED":
      return "Выдано";
    case "RETURN_DECLARED":
      return "Возврат заявлен";
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

export default function WarehouseQueuePage() {
  const { state } = useAuth();
  const role = state.status === "authenticated" ? state.user.role : null;
  const forbidden =
    state.status === "authenticated" && role !== "WOWSTORG";

  const [orders, setOrders] = React.useState<QueueOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingNoteOrderId, setEditingNoteOrderId] = React.useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = React.useState("");
  const [noteSaveBusy, setNoteSaveBusy] = React.useState(false);

  const loadOrders = React.useCallback(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    fetch("/api/warehouse/queue", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { orders?: QueueOrder[] } | null) => setOrders(data?.orders ?? []))
      .catch(() => setOrders([]));
  }, [state.status, role]);

  React.useEffect(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/warehouse/queue", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { orders?: QueueOrder[] } | null) => {
        if (!cancelled) setOrders(data?.orders ?? []);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.status, role]);

  async function saveInternalNote(orderId: string) {
    setNoteSaveBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/internal-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editingNoteValue.trim() || null }),
      });
      if (res.ok) {
        setEditingNoteOrderId(null);
        loadOrders();
      }
    } finally {
      setNoteSaveBusy(false);
    }
  }

  const grouped = React.useMemo(() => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    const childrenByParent = new Map<string, QueueOrder[]>();
    for (const o of orders) {
      if (!o.parentOrderId) continue;
      const arr = childrenByParent.get(o.parentOrderId) ?? [];
      arr.push(o);
      childrenByParent.set(o.parentOrderId, arr);
    }
    const roots = orders.filter((o) => !o.parentOrderId || !byId.has(o.parentOrderId));
    return roots.map((root) => ({
      root,
      children: childrenByParent.get(root.id) ?? [],
    }));
  }, [orders]);

  function renderQueueCard(o: QueueOrder, kind: "root" | "child") {
    return (
      <div
        key={o.id}
        className={[
          "rounded-2xl border overflow-hidden shadow-sm transition",
          o.status === "CANCELLED"
            ? "border-[#5b0b17]/25 bg-[#5b0b17]/[0.03] hover:border-[#5b0b17]/40"
            : o.parentOrderId
              ? "border-amber-300 bg-amber-50/30 hover:border-amber-400"
              : "border-zinc-200 bg-white hover:border-violet-200",
          kind === "child" ? "ml-8" : "",
        ].join(" ")}
      >
        <div className={["px-4 py-5", statusHeaderClass(o.status)].join(" ")}>
          <OrderStatusStepper status={o.status as OrderStatus} />
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-zinc-900">
              {o.customer.name}
              {o.greenwichUser
                ? ` · ${o.greenwichUser.displayName}${
                    o.greenwichUser.ratingScore != null
                      ? ` · рейтинг ${o.greenwichUser.ratingScore}`
                      : ""
                  }`
                : ""}
            </div>
          </div>
          {o.parentOrderId ? (
            <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Доп. заявка к №{o.parentOrderId.slice(0, 8)}
            </div>
          ) : (
            <div className="mt-1 inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">
              Основная заявка
            </div>
          )}
          <div className="mt-2 text-sm text-zinc-600">
            Готовность: <span className="font-semibold">{fmtDateRu(o.readyByDate)}</span>{" "}
            · Период: <span className="font-semibold">{fmtDateRu(o.startDate)}</span> —{" "}
            <span className="font-semibold">{fmtDateRu(o.endDate)}</span>
            {o.totalAmount != null ? (
              <span className="ml-2 rounded-md bg-violet-100 px-1.5 py-0.5 font-bold text-violet-800">
                · {o.totalAmount.toLocaleString("ru-RU")} ₽
              </span>
            ) : null}
          </div>
          {o.warehouseInternalNote ? (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold text-amber-800">Внутр. комментарий:</span>{" "}
              <span className="whitespace-pre-wrap">{o.warehouseInternalNote}</span>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {o.status === "ISSUED" && o.greenwichUser && !o.parentOrderId ? (
              <Link
                href={`/catalog?quickParentId=${o.id}`}
                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
              >
                Быстрая доп.-выдача
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setEditingNoteOrderId(o.id);
                setEditingNoteValue(o.warehouseInternalNote ?? "");
              }}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Комментарий
            </button>
            <Link
              href={`/orders/${o.id}?from=warehouse-queue`}
              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
            >
              Открыть заявку
            </Link>
          </div>
          {editingNoteOrderId === o.id ? (
            <div className="mt-3 pt-3 border-t border-zinc-200">
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Внутренний комментарий (только для склада)
              </label>
              <textarea
                value={editingNoteValue}
                onChange={(e) => setEditingNoteValue(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Заметка для сотрудников склада…"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={noteSaveBusy}
                  onClick={() => saveInternalNote(o.id)}
                  className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {noteSaveBusy ? "…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  disabled={noteSaveBusy}
                  onClick={() => {
                    setEditingNoteOrderId(null);
                    setEditingNoteValue("");
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <AppShell title="Очередь склада">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-600">
              Показаны только актуальные заявки (не завершённые и не отменённые).
            </div>
            <Link
              href="/warehouse/archive"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-violet-50"
            >
              Архив заявок →
            </Link>
          </div>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-zinc-600">Пока нет заявок в очереди.</div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ root, children }) => (
                <div key={root.id} className="rounded-3xl border border-zinc-200/80 bg-white/40 p-2">
                  {renderQueueCard(root, "root")}
                  {children.length > 0 ? (
                    <div className="mt-2 space-y-2 border-l-2 border-amber-300/70 pl-2">
                      {children.map((c) => renderQueueCard(c, "child"))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

