"use client";

import React from "react";

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

function conditionRu(c: IncidentRow["condition"]) {
  return c === "NEEDS_REPAIR" ? "Требует ремонта" : "Сломано";
}

export default function WarehouseRepairBasePage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [tab, setTab] = React.useState<IncidentRow["condition"]>("NEEDS_REPAIR");
  const [rows, setRows] = React.useState<IncidentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [qtyById, setQtyById] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (state.status !== "authenticated" || state.user.role !== "WOWSTORG") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/warehouse/incidents?condition=${tab}`, { cache: "no-store" });
      const data = (await res.json()) as { incidents?: IncidentRow[] };
      setRows(data.incidents ?? []);
    } finally {
      setLoading(false);
    }
  }, [state.status, state.user.role, tab]);

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
        ) : rows.length === 0 ? (
          <div className="text-sm text-zinc-600">Пусто.</div>
        ) : (
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
        )}
      </div>
    </AppShell>
  );
}

