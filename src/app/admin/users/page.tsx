"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type UserRow = {
  id: string;
  login: string;
  displayName: string;
  role: string;
  telegramChatId: string | null;
  isActive: boolean;
  mustSetPassword: boolean;
  createdAt: string;
  greenwichRating: null | { score: number; manualLocked: boolean };
};

export default function AdminUsersPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<"create" | UserRow | null>(null);
  const [form, setForm] = React.useState({
    login: "",
    displayName: "",
    role: "GREENWICH" as "GREENWICH" | "WOWSTORG",
    telegramChatId: "",
    isActive: true,
  });
  const [editForm, setEditForm] = React.useState({
    displayName: "",
    role: "GREENWICH" as "GREENWICH" | "WOWSTORG",
    telegramChatId: "",
    isActive: true,
    password: "",
    greenwichRatingScore: 100,
    greenwichRatingManualLocked: false,
    greenwichRatingOriginalScore: 100,
  });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const text = await res.text();
      let data: { users?: UserRow[]; error?: { message?: string } } = {};
      if (text) {
        try {
          data = JSON.parse(text) as { users?: UserRow[]; error?: { message?: string } };
        } catch {
          setError("Не удалось загрузить список пользователей");
          setUsers([]);
          return;
        }
      }
      if (!res.ok) {
        setError(data?.error?.message ?? `Ошибка ${res.status}`);
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
    } catch (e) {
      setError("Ошибка сети или сервера");
      setUsers([]);
    }
  }, []);

  React.useEffect(() => {
    if (!forbidden) void load();
  }, [forbidden, load]);

  React.useEffect(() => {
    setLoading(false);
  }, [users]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: form.login.trim(),
          displayName: form.displayName.trim(),
          role: form.role,
          telegramChatId: form.telegramChatId.trim() || undefined,
          isActive: form.isActive,
        }),
      });
      const text = await res.text();
      let data: { user?: UserRow; error?: { message?: string } } = {};
      try {
        data = (text ? JSON.parse(text) : {}) as { user?: UserRow; error?: { message?: string } };
      } catch {
        setError("Неверный ответ сервера");
        return;
      }
      if (!res.ok) {
        setError(data?.error?.message ?? "Ошибка создания");
        return;
      }
      setModal(null);
      setForm({ login: "", displayName: "", role: "GREENWICH", telegramChatId: "", isActive: true });
      await load();
    } catch (e) {
      setError("Ошибка сети или сервера");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(u: UserRow) {
    setModal(u);
    const ratingScore = u.greenwichRating?.score ?? 100;
    const ratingManualLocked = u.greenwichRating?.manualLocked ?? false;
    setEditForm({
      displayName: u.displayName,
      role: u.role as "GREENWICH" | "WOWSTORG",
      telegramChatId: u.telegramChatId ?? "",
      isActive: u.isActive,
      password: "",
      greenwichRatingScore: ratingScore,
      greenwichRatingManualLocked: ratingManualLocked,
      greenwichRatingOriginalScore: ratingScore,
    });
    setError(null);
  }

  async function updateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!modal || modal === "create" || !("id" in modal)) return;
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        displayName: editForm.displayName.trim(),
        role: editForm.role,
        telegramChatId: editForm.telegramChatId.trim() || null,
        isActive: editForm.isActive,
      };
      if (editForm.password) body.password = editForm.password;

      if (
        editForm.role === "GREENWICH" &&
        (editForm.greenwichRatingManualLocked ||
          editForm.greenwichRatingScore !== editForm.greenwichRatingOriginalScore)
      ) {
        body.greenwichRatingScore = editForm.greenwichRatingScore;
      }

      const res = await fetch(`/api/admin/users/${modal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: { user?: UserRow; error?: { message?: string } } = {};
      try {
        data = (text ? JSON.parse(text) : {}) as { user?: UserRow; error?: { message?: string } };
      } catch {
        setError("Неверный ответ сервера");
        return;
      }
      if (!res.ok) {
        setError(data?.error?.message ?? "Ошибка сохранения");
        return;
      }
      setModal(null);
      await load();
    } catch (e) {
      setError("Ошибка сети или сервера");
    } finally {
      setSaving(false);
    }
  }

  async function setGreenwichRatingAuto() {
    if (!modal || modal === "create" || !("id" in modal)) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${modal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ greenwichRatingAuto: true }),
      });
      const text = await res.text();
      let data: { error?: { message?: string } } = {};
      try {
        data = text ? (JSON.parse(text) as { error?: { message?: string } }) : {};
      } catch {
        // ignore
      }
      if (!res.ok) {
        setError(data?.error?.message ?? `Ошибка ${res.status}`);
        return;
      }
      setModal(null);
      await load();
    } catch {
      setError("Ошибка сети или сервера");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Админка · Пользователи">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              ← Админка
            </Link>
            <button
              type="button"
              onClick={() => {
                setModal("create");
                setForm({ login: "", displayName: "", role: "GREENWICH", telegramChatId: "", isActive: true });
                setError(null);
              }}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Добавить пользователя
            </button>
          </div>

          {error && !modal && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-sm text-zinc-500">Загрузка…</p>
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="text-left p-3 font-semibold text-zinc-700">ФИО</th>
                    <th className="text-left p-3 font-semibold text-zinc-700">Логин</th>
                    <th className="text-left p-3 font-semibold text-zinc-700">Роль</th>
                    <th className="text-left p-3 font-semibold text-zinc-700">Рейтинг</th>
                    <th className="text-left p-3 font-semibold text-zinc-700">Telegram ID</th>
                    <th className="text-left p-3 font-semibold text-zinc-700">Статус</th>
                    <th className="w-24 p-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={`border-b border-zinc-100 ${!u.isActive ? "bg-zinc-50 opacity-75" : ""}`}>
                      <td className="p-3 font-medium text-zinc-900">{u.displayName}</td>
                      <td className="p-3 text-zinc-600">{u.login}</td>
                      <td className="p-3">
                        <span className={u.role === "WOWSTORG" ? "text-violet-600" : "text-zinc-600"}>
                          {u.role === "WOWSTORG" ? "Склад" : "Grinvich"}
                        </span>
                      </td>
                      <td className="p-3">
                        {u.role === "GREENWICH" ? (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-900">{u.greenwichRating?.score ?? 100}</span>
                            {u.greenwichRating?.manualLocked ? (
                              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                                ручной
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-zinc-500 font-mono text-xs">{u.telegramChatId ?? "—"}</td>
                      <td className="p-3">
                        {!u.isActive ? (
                          <span className="text-amber-600">Заблокирован</span>
                        ) : u.mustSetPassword ? (
                          <span className="text-violet-700">Не активирован</span>
                        ) : (
                          <span className="text-green-600">Активирован</span>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
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

          {modal === "create" &&
            typeof document !== "undefined" &&
            createPortal(
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
                <h2 className="text-lg font-semibold text-zinc-900">Новый пользователь</h2>
                <form onSubmit={createUser} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">ФИО</label>
                    <input
                      required
                      value={form.displayName}
                      onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Иванов Иван Иванович"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Логин</label>
                    <input
                      required
                      value={form.login}
                      onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                      placeholder="ivanov"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Роль</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "GREENWICH" | "WOWSTORG" }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    >
                      <option value="GREENWICH">Grinvich</option>
                      <option value="WOWSTORG">Склад (WOWSTORG)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Telegram Chat ID</label>
                    <input
                      value={form.telegramChatId}
                      onChange={(e) => setForm((f) => ({ ...f, telegramChatId: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                      placeholder="опционально"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                        className="rounded border-zinc-300"
                      />
                      <span className="text-sm">Аккаунт активен (не заблокирован)</span>
                    </label>
                    <div className="mt-1 text-xs text-zinc-500">
                      Пользователь задаст пароль сам через "Первая авторизация".
                    </div>
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
                      {saving ? "Создаём…" : "Создать"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal(null)}
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

          {modal &&
            typeof modal === "object" &&
            typeof document !== "undefined" &&
            createPortal(
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
                <h2 className="text-lg font-semibold text-zinc-900">Редактировать: {modal.login}</h2>
                <form onSubmit={updateUser} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">ФИО</label>
                    <input
                      required
                      value={editForm.displayName}
                      onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Роль</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as "GREENWICH" | "WOWSTORG" }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    >
                      <option value="GREENWICH">Grinvich</option>
                      <option value="WOWSTORG">Склад (WOWSTORG)</option>
                    </select>
                  </div>

                  {editForm.role === "GREENWICH" ? (
                    <div>
                      <label className="block text-xs font-medium text-zinc-500">
                        Рейтинг Greenwich (0..100)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={editForm.greenwichRatingScore}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setEditForm((f) => ({
                            ...f,
                            greenwichRatingScore: Number.isFinite(v) ? v : f.greenwichRatingScore,
                            greenwichRatingManualLocked: true,
                          }));
                        }}
                        className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      />
                      <div className="mt-1 text-xs text-zinc-500">
                        {editForm.greenwichRatingManualLocked ? "Ручной режим" : "Авто-пересчёт"}
                      </div>

                      {editForm.greenwichRatingManualLocked ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => void setGreenwichRatingAuto()}
                            disabled={saving}
                            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                          >
                            Вернуть авто-пересчёт
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Telegram Chat ID</label>
                    <input
                      value={editForm.telegramChatId}
                      onChange={(e) => setEditForm((f) => ({ ...f, telegramChatId: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.isActive}
                        onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                        className="rounded border-zinc-300"
                      />
                      <span className="text-sm">Активен (может входить)</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500">Новый пароль (оставьте пустым, чтобы не менять)</label>
                    <input
                      type="password"
                      minLength={6}
                      value={editForm.password}
                      onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="не менее 6 символов"
                    />
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
                      onClick={() => setModal(null)}
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
