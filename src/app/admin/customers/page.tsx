"use client";

import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Customer = { id: string; name: string };

export default function AdminCustomersPage() {
  const { state } = useAuth();
  const forbidden =
    state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function load() {
    const res = await fetch("/api/customers", { cache: "no-store" });
    const data = (await res.json()) as { customers: Customer[] };
    setCustomers(data.customers ?? []);
  }

  React.useEffect(() => {
    if (!forbidden) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbidden]);

  async function create() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => null)) as
        | { customer?: Customer; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось создать заказчика");
        return;
      }
      setName("");
      await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Заказчики">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 p-4">
            <div className="text-sm font-semibold">Добавить заказчика</div>
            <div className="mt-2 flex flex-col gap-2 md:flex-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                placeholder="Название заказчика…"
              />
              <button
                disabled={loading || name.trim().length < 2}
                onClick={create}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {loading ? "Создаём…" : "Создать"}
              </button>
            </div>
            {error ? (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">
              Список ({customers.length})
            </div>
            <div className="grid grid-cols-1 gap-2">
              {customers.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                >
                  {c.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

