"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function NewCollectionPage() {
  const { state } = useAuth();
  const user = state.status === "authenticated" ? state.user : null;
  const forbidden = state.status === "authenticated" && user?.role !== "WOWSTORG";

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (slug === "" || slug === slugFromName(name)) setSlug(slugFromName(name) || "");
  }, [name]);

  async function create() {
    setBusy(true);
    setError(null);
    const finalSlug = slug.trim() || slugFromName(name) || "category";
    try {
      const res = await fetch("/api/inventory/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: finalSlug }),
      });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { id?: string; error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось создать категорию");
      if (!data.id) throw new Error("Категория создана, но сервер не вернул id");
      window.location.href = `/inventory/collections/${data.id}`;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Инвентарь · Новая категория">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/inventory/collections"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              ← К категориям
            </Link>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-base font-semibold text-zinc-900">Категория</div>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Название</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Например: Фотозоны"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Slug (для URL, латиница и дефисы)</label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                  placeholder="photozones"
                />
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !name.trim() || !slug.trim()}
                onClick={create}
                className="rounded-lg border border-violet-200 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? "Создаю…" : "Создать"}
              </button>
              <Link
                href="/inventory/collections"
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Отмена
              </Link>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

