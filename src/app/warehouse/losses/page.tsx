"use client";

import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type LossRow = {
  id: string;
  qty: number;
  foundQty: number;
  writtenOffQty: number;
  remainingQty: number;
  notes?: string | null;
  createdAt: string;
  item: { id: string; name: string };
  order?: { id: string; customerName: string } | null;
};

export default function WarehouseLossesBasePage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [rows, setRows] = React.useState<LossRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [qtyById, setQtyById] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (state.status !== "authenticated" || state.user.role !== "WOWSTORG") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/warehouse/losses", { cache: "no-store" });
      const data = (await res.json()) as { losses?: LossRow[] };
      setRows(data.losses ?? []);
    } finally {
      setLoading(false);
    }
  }, [state.status, state.user.role]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "found" | "write-off") {
    const raw = (qtyById[id] ?? "").trim();
    const n = raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Укажите количество (целое число больше 0)");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/warehouse/losses/${id}/${action}`, {
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
      <AppShell title="Утерянное">
        <div className="text-sm text-zinc-600">Доступно только для сотрудников склада.</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Утерянный реквизит">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
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
                    <div className="text-sm font-semibold text-zinc-900">{r.item.name}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Остаток: <span className="font-semibold">{r.remainingQty}</span> из {r.qty}
                      {r.order ? (
                        <>
                          {" "}
                          · заявка <span className="font-mono">{r.order.id.slice(0, 8)}</span> · {r.order.customerName}
                        </>
                      ) : null}
                    </div>
                    {r.notes ? (
                      <div className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{r.notes}</div>
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
                      onClick={() => act(r.id, "found")}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {busyId === r.id ? "…" : "Найдено"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => act(r.id, "write-off")}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {busyId === r.id ? "…" : "Списать"}
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

