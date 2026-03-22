"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type IncidentRow = {
  id: string;
  condition: "NEEDS_REPAIR" | "BROKEN";
  qty: number;
  repairedQty: number;
  utilizedQty: number;
  remainingQty: number;
  comment?: string | null;
  createdAt: string;
  order?: { id: string; customerName: string } | null;
  item?: { id: string; name: string } | null;
};

type RepairItemRow = {
  id: string;
  name: string;
  qty: number;
  condition: "NEEDS_REPAIR" | "BROKEN";
};

function conditionRu(c: "NEEDS_REPAIR" | "BROKEN") {
  return c === "NEEDS_REPAIR" ? "Требует ремонта" : "Сломано";
}

function RepairPageInner() {
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const user = state.status === "authenticated" ? state.user : null;
  const forbidden = state.status === "authenticated" && user?.role !== "WOWSTORG";

  const [tab, setTab] = React.useState<"NEEDS_REPAIR" | "BROKEN">("NEEDS_REPAIR");

  React.useEffect(() => {
    const c = searchParams.get("condition");
    if (c === "NEEDS_REPAIR" || c === "BROKEN") {
      setTab(c);
    }
  }, [searchParams]);
  const [rows, setRows] = React.useState<IncidentRow[]>([]);
  const [itemRows, setItemRows] = React.useState<RepairItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [busyItemId, setBusyItemId] = React.useState<string | null>(null);
  const [qtyById, setQtyById] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (state.status !== "authenticated" || user?.role !== "WOWSTORG") return;
    setLoading(true);
    setError(null);
    try {
      const [incRes, itemsRes] = await Promise.all([
        fetch(`/api/warehouse/incidents?condition=${tab}`, { cache: "no-store" }),
        fetch(`/api/warehouse/repair-items?condition=${tab}`, { cache: "no-store" }),
      ]);
      const incData = (await incRes.json().catch(() => null)) as { incidents?: IncidentRow[] } | null;
      const itemsData = (await itemsRes.json().catch(() => null)) as { items?: RepairItemRow[] } | null;
      setRows(incData?.incidents ?? []);
      setItemRows(itemsData?.items ?? []);
    } catch (e) {
      console.error("warehouse repair load failed", e);
      setRows([]);
      setItemRows([]);
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [state.status, user?.role, tab]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "repair" | "utilize") {
    const raw = (qtyById[id] ?? "").trim();
    const n = raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Укажите количество (целое число больше 0)");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/warehouse/incidents/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: Math.floor(n) }),
      });
      const text = await res.text();
      if (!res.ok) {
        try {
          const j = JSON.parse(text) as { error?: { message?: string } };
          setError(j?.error?.message ?? "Ошибка операции");
        } catch {
          setError("Ошибка операции");
        }
        return;
      }
      setQtyById((p) => ({ ...p, [id]: "" }));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function returnItemToCatalog(itemId: string) {
    setBusyItemId(itemId);
    setError(null);
    try {
      const payload = tab === "NEEDS_REPAIR" ? { inRepair: 0 } : { broken: 0 };
      const res = await fetch(`/api/inventory/positions/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const j = JSON.parse(text) as { error?: { message?: string } };
          setError(j?.error?.message ?? "Ошибка");
        } catch {
          setError("Ошибка операции");
        }
        return;
      }
      await load();
    } finally {
      setBusyItemId(null);
    }
  }

  if (forbidden) {
    return (
      <AppShell title="База ремонта">
        <div className="text-sm text-zinc-600">Доступно только для сотрудников склада.</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Ремонт / сломано">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("NEEDS_REPAIR")}
          className={[
            "rounded-lg px-3 py-2 text-sm font-semibold border",
            tab === "NEEDS_REPAIR"
              ? "border-violet-300 bg-violet-600 text-white"
              : "border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50",
          ].join(" ")}
        >
          Требует ремонта
        </button>
        <button
          type="button"
          onClick={() => setTab("BROKEN")}
          className={[
            "rounded-lg px-3 py-2 text-sm font-semibold border",
            tab === "BROKEN"
              ? "border-violet-300 bg-violet-600 text-white"
              : "border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50",
          ].join(" ")}
        >
          Сломано
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-zinc-600">Загрузка…</div>
        ) : null}

        {!loading && itemRows.length > 0 ? (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-zinc-700 mb-2">По позициям (вне заявок)</h3>
            <p className="text-xs text-zinc-500 mb-2">
              Реквизит, отмеченный как «{conditionRu(tab).toLowerCase()}» в карточке позиции. Вернуть в каталог — обнулить это количество.
            </p>
            <div className="space-y-2">
              {itemRows.map((r) => (
                <div key={r.id} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-900">{r.name}</span>
                  <span className="text-xs text-zinc-600">{r.qty} шт.</span>
                  <button
                    type="button"
                    disabled={busyItemId === r.id}
                    onClick={() => returnItemToCatalog(r.id)}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                  >
                    {busyItemId === r.id ? "…" : "Вернуть в каталог"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!loading ? <h3 className="text-sm font-semibold text-zinc-700 mb-2">По заявкам</h3> : null}
        {!loading && rows.length === 0 && itemRows.length === 0 ? (
          <div className="text-sm text-zinc-600">Пусто.</div>
        ) : !loading && rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">
                      {r.item?.name ?? "Позиция"} · {conditionRu(r.condition)}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Остаток: <span className="font-semibold">{r.remainingQty}</span> из {r.qty}
                      {r.order ? (
                        <>
                          {" "}
                          · заявка <span className="font-mono">{r.order.id.slice(0, 8)}</span> · {r.order.customerName}
                        </>
                      ) : null}
                    </div>
                    {r.comment ? (
                      <div className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{r.comment}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={qtyById[r.id] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v !== "" && !/^\d*$/.test(v)) return;
                        setQtyById((p) => ({ ...p, [r.id]: v }));
                      }}
                      className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Кол-во"
                      inputMode="numeric"
                    />
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => act(r.id, "repair")}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {busyId === r.id ? "…" : "Починить"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => act(r.id, "utilize")}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {busyId === r.id ? "…" : "Утилизировать"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function WarehouseRepairBasePage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Ремонт / сломано">
          <div className="text-sm text-zinc-600">Загрузка…</div>
        </AppShell>
      }
    >
      <RepairPageInner />
    </Suspense>
  );
}
