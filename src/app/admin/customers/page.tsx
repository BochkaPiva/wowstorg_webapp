"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Customer = {
  id: string;
  name: string;
  isActive?: boolean;
  notes?: string | null;
};

export default function AdminCustomersPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createName, setCreateName] = React.useState("");
  const [createNotes, setCreateNotes] = React.useState("");
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editActive, setEditActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/customers?all=true", { cache: "no-store" });
    const data = (await res.json()) as { customers?: Customer[] };
    setCustomers(data.customers ?? []);
  }, []);

  React.useEffect(() => {
    if (!forbidden) void load();
  }, [forbidden, load]);

  React.useEffect(() => {
    setLoading(false);
  }, [customers]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), notes: createNotes.trim() || undefined }),
      });
      const data = (await res.json()) as { customer?: Customer; error?: { message?: string } };
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось создать заказчика");
        return;
      }
      setCreateName("");
      setCreateNotes("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: Customer) {
    setEditing(c);
    setEditName(c.name);
    setEditNotes(c.notes ?? "");
    setEditActive(c.isActive ?? true);
    setError(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          notes: editNotes.trim() || null,
          isActive: editActive,
        }),
      });
      const data = (await res.json()) as { customer?: Customer; error?: { message?: string } };
      if (!res.ok) {
        setError(data?.error?.message ?? "Ошибка сохранения");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Админка · Заказчики">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              ← Админка
            </Link>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-800">Добавить заказчика</div>
            <form onSubmit={create} className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-500">Название</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Название заказчика…"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-500">Заметки</label>
                <input
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="опционально"
                />
              </div>
              <button
                type="submit"
                disabled={saving || createName.trim().length < 2}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? "Создаём…" : "Создать"}
              </button>
            </form>
            {error && !editing && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-zinc-800">Список ({customers.length})</div>
            {loading ? (
              <p className="text-sm text-zinc-500">Загрузка…</p>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                      <th className="text-left p-3 font-semibold text-zinc-700">Название</th>
                      <th className="text-left p-3 font-semibold text-zinc-700">Заметки</th>
                      <th className="text-left p-3 font-semibold text-zinc-700">Статус</th>
                      <th className="w-24 p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        className={`border-b border-zinc-100 ${c.isActive === false ? "bg-zinc-50 opacity-75" : ""}`}
                      >
                        <td className="p-3 font-medium text-zinc-900">{c.name}</td>
                        <td className="p-3 text-zinc-600 max-w-xs truncate" title={c.notes ?? undefined}>
                          {c.notes ?? "—"}
                        </td>
                        <td className="p-3">
                          {c.isActive !== false ? (
                            <span className="text-green-600">Активен</span>
                          ) : (
                            <span className="text-amber-600">Скрыт</span>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            Изменить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {editing &&
            typeof document !== "undefined" &&
            createPortal(
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
                  <h2 className="text-lg font-semibold text-zinc-900">Редактировать заказчика</h2>
                <form onSubmit={saveEdit} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Название</label>
                    <input
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Заметки</label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                      <span className="text-sm">Активен (доступен в выборе при создании заявки)</span>
                    </label>
                  </div>
                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {error}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {saving ? "Сохраняем…" : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              </div>
            </div>,
              document.body
            )}
        </div>
      )}
    </AppShell>
  );
}
