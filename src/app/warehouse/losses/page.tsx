"use client";

import React from "react";
import Link from "next/link";
import "@/app/inventory/inventory.css";

import { AppShell } from "@/app/_ui/AppShell";
import { ListSkeleton } from "@/app/_ui/Skeleton";
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
  const user = state.status === "authenticated" ? state.user : null;
  const forbidden = state.status === "authenticated" && user?.role !== "WOWSTORG";

  const [query, setQuery] = React.useState("");
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<LossRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [qtyById, setQtyById] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (state.status !== "authenticated" || user?.role !== "WOWSTORG") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/warehouse/losses", { cache: "no-store" });
      if (!res.ok) throw new Error("Не удалось загрузить утерянное");
      const data = (await res.json()) as { losses?: LossRow[] };
      setRows(data.losses ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка сети"); } finally {
      setLoading(false);
    }
  }, [state.status, user?.role]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "found" | "write-off") {
    const raw = (qtyById[id] ?? "").trim();
    const n = raw === "" ? NaN : Number(raw);
    if (!Number.isInteger(n) || n <= 0 || n > (rows.find(r => r.id === id)?.remainingQty ?? 0)) {
      setError("Укажите количество (целое число больше 0)");
      return;
    }
    setConfirmId(null);
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
    <AppShell title="Утерянный реквизит"><div className="inventory-workspace">
      <header className="inventory-heading"><div><Link href="/inventory/items" className="inventory-back">← Инвентарь</Link><h1>Утерянное</h1><p>Найденное возвращается в остаток. Списание уменьшает общее количество.</p></div><button className="inv-button" disabled={loading || !!busyId} onClick={() => void load()}>Обновить</button></header>
      <div className="inventory-filters"><input aria-label="Поиск утерянного" placeholder="Позиция или заказчик" value={query} onChange={e => setQuery(e.target.value)} /></div>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <div className="text-sm text-zinc-600">Пусто.</div>
        ) : (
          <div className="space-y-3">
            {rows.filter(r => [r.item.name, r.order?.customerName].join(" ").toLowerCase().includes(query.trim().toLowerCase())).map((r) => (
              <div key={r.id} className="inventory-record rounded-xl border border-zinc-200 bg-white">
                <div className="inventory-record-main">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900"><Link href={`/inventory/positions/${r.item.id}`}>{r.item.name}</Link></div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Остаток: <span className="font-semibold">{r.remainingQty}</span> из {r.qty}
                      {r.order ? (
                        <>
                          {" "}
                          · <Link className="inventory-source" href={`/orders/${r.order.id}`}>Заявка {r.order.id.slice(0, 8)} · {r.order.customerName}</Link>
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
                      aria-label={`Количество: ${r.item.name}`}
                      placeholder="Кол-во"
                      inputMode="numeric"
                    />
                    <button
                      type="button"
                      disabled={!!busyId}
                      onClick={() => act(r.id, "found")}
                      className="inv-button"
                    >
                      {busyId === r.id ? "…" : "Найдено"}
                    </button>
                    <button
                      type="button"
                      disabled={!!busyId}
                      onClick={() => setConfirmId(r.id)}
                      className="inv-button inv-danger"
                    >
                      {busyId === r.id ? "…" : "Списать"}
                    </button>
                  </div>
                </div>
                {confirmId === r.id && <div className="inventory-confirm"><div><strong>Подтвердите списание</strong><p>Общее количество уменьшится на указанное число. Отменить это действие в интерфейсе нельзя.</p></div><button className="inv-button inv-danger" disabled={!!busyId} onClick={() => void act(r.id, "write-off")}>Списать {qtyById[r.id] || "…"} шт.</button><button className="inv-button" onClick={() => setConfirmId(null)}>Отмена</button></div>}
              </div>
            ))}
          </div>
        )}
      </div></div>
    </AppShell>
  );
}

