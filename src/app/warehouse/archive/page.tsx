"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";
import type { OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";

type ArchiveOrder = {
  id: string;
  parentOrderId?: string | null;
  status: string;
  source: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string };
  greenwichUser: { id: string; displayName: string; ratingScore?: number } | null;
};

const SORT_OPTIONS = [
  { value: "updated_desc", label: "Обновление: новые сверху" },
  { value: "updated_asc", label: "Обновление: старые сверху" },
  { value: "readyBy_desc", label: "Готовность: позже → раньше" },
  { value: "readyBy_asc", label: "Готовность: раньше → позже" },
  { value: "startDate_desc", label: "Начало периода ↓" },
  { value: "startDate_asc", label: "Начало периода ↑" },
  { value: "created_desc", label: "Создание: новые сверху" },
  { value: "created_asc", label: "Создание: старые сверху" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "CLOSED", label: "Завершена" },
  { value: "CANCELLED", label: "Отменена" },
] as const;

const SOURCE_OPTIONS = [
  { value: "all", label: "Все источники" },
  { value: "GREENWICH_INTERNAL", label: "От Grinvich" },
  { value: "WOWSTORG_EXTERNAL", label: "Склад (внешние)" },
] as const;

const DEFAULT_SORT = "updated_desc";

function fmtDateRu(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

function statusHeaderClass(status: string): string {
  return status === "CANCELLED"
    ? "bg-[#5b0b17]/10 text-[#5b0b17]"
    : status === "CLOSED"
      ? "bg-violet-50 text-violet-900"
      : "bg-white";
}

function buildArchiveQuery(args: {
  sort: string;
  q: string;
  source: string;
  status: string;
}): string {
  const params = new URLSearchParams();
  if (args.sort && args.sort !== DEFAULT_SORT) params.set("sort", args.sort);
  const q = args.q.trim();
  if (q) params.set("q", q);
  if (args.source !== "all") params.set("source", args.source);
  if (args.status !== "all") params.set("status", args.status);
  return params.toString();
}

function WarehouseArchiveContent() {
  const { state } = useAuth();
  const role = state.status === "authenticated" ? state.user.role : null;
  const forbidden = state.status === "authenticated" && role !== "WOWSTORG";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [orders, setOrders] = React.useState<ArchiveOrder[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [sort, setSort] = React.useState(() => searchParams.get("sort") || DEFAULT_SORT);
  const [qInput, setQInput] = React.useState(() => searchParams.get("q") ?? "");
  const [qDebounced, setQDebounced] = React.useState(() => searchParams.get("q") ?? "");
  const [source, setSource] = React.useState(() => searchParams.get("source") || "all");
  const [status, setStatus] = React.useState(() => searchParams.get("status") || "all");

  React.useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(qInput), 320);
    return () => window.clearTimeout(t);
  }, [qInput]);

  React.useEffect(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    let cancelled = false;
    const qs = buildArchiveQuery({ sort, q: qDebounced, source, status });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setLoading(true);
    fetch(`/api/warehouse/archive${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { orders?: ArchiveOrder[] } | null) => {
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
  }, [state.status, role, sort, qDebounced, source, status, pathname, router]);

  const grouped = React.useMemo(() => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    const childrenByParent = new Map<string, ArchiveOrder[]>();
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

  function renderArchiveCard(o: ArchiveOrder, kind: "root" | "child") {
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
            Готовность: <span className="font-semibold">{fmtDateRu(o.readyByDate)}</span> · Период:{" "}
            <span className="font-semibold">{fmtDateRu(o.startDate)}</span> —{" "}
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
    );
  }

  return (
    <AppShell title="Архив заявок">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-600">
              Завершённые и отменённые заявки (до 500 с учётом фильтров).
            </div>
            <Link
              href="/warehouse/queue"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-violet-50"
            >
              ← В очередь
            </Link>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 min-w-[200px] flex-1">
                <span className="text-xs font-semibold text-zinc-500">Поиск</span>
                <input
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Заказчик, Grinvich, ID заявки…"
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm w-full"
                />
              </label>
              <label className="flex flex-col gap-1 min-w-[200px]">
                <span className="text-xs font-semibold text-zinc-500">Сортировка</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 min-w-[160px]">
                <span className="text-xs font-semibold text-zinc-500">Статус</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 min-w-[180px]">
                <span className="text-xs font-semibold text-zinc-500">Источник</span>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white"
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-zinc-600">Нет заявок по текущим фильтрам.</div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ root, children }) => (
                <div key={root.id} className="rounded-3xl border border-zinc-200/80 bg-white/40 p-2">
                  {renderArchiveCard(root, "root")}
                  {children.length > 0 ? (
                    <div className="mt-2 space-y-2 border-l-2 border-amber-300/70 pl-2">
                      {children.map((c) => renderArchiveCard(c, "child"))}
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

export default function WarehouseArchivePage() {
  return (
    <React.Suspense
      fallback={
        <AppShell title="Архив заявок">
          <div className="text-sm text-zinc-600">Загрузка…</div>
        </AppShell>
      }
    >
      <WarehouseArchiveContent />
    </React.Suspense>
  );
}
