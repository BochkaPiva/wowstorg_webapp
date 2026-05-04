"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import {
  achievementImageSrc,
  levelBadgeTone,
  levelLabel,
  type AchievementLevelUi,
} from "@/lib/achievements-display";

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

type AdminAchievementsResponse = {
  applicable: boolean;
  cards: Array<{
    code: string;
    title: string;
    description: string;
    value: number;
    level: AchievementLevelUi;
    nextLevel: AchievementLevelUi | null;
    nextThreshold: number | null;
    progressPercentToNext: number | null;
    thresholds: { bronze: number; silver: number; gold: number };
  }>;
  unreadNotifications: number;
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
  const [adminAchievements, setAdminAchievements] = React.useState<AdminAchievementsResponse | null>(null);
  const [adminAchievementsLoading, setAdminAchievementsLoading] = React.useState(false);
  const [adminAchievementsError, setAdminAchievementsError] = React.useState<string | null>(null);
  const achievementsAbortRef = React.useRef<AbortController | null>(null);

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

  React.useEffect(() => {
    achievementsAbortRef.current?.abort();
    achievementsAbortRef.current = null;

    if (forbidden || !modal || modal === "create" || !("id" in modal)) {
      setAdminAchievements(null);
      setAdminAchievementsError(null);
      setAdminAchievementsLoading(false);
      return;
    }

    if (editForm.role !== "GREENWICH") {
      setAdminAchievements(null);
      setAdminAchievementsError(null);
      setAdminAchievementsLoading(false);
      return;
    }

    const ac = new AbortController();
    achievementsAbortRef.current = ac;
    setAdminAchievementsLoading(true);
    setAdminAchievementsError(null);
    setAdminAchievements(null);

    void fetch(`/api/admin/users/${modal.id}/achievements`, { cache: "no-store", signal: ac.signal })
      .then(async (res) => {
        const text = await res.text();
        let parsed: unknown = {};
        if (text) {
          try {
            parsed = JSON.parse(text) as unknown;
          } catch {
            throw new Error("Не удалось разобрать ответ сервера");
          }
        }
        if (!res.ok) {
          const msg =
            parsed && typeof parsed === "object" && "error" in parsed
              ? String((parsed as { error?: { message?: string } }).error?.message ?? "")
              : "";
          throw new Error(msg || `Ошибка ${res.status}`);
        }
        return parsed as AdminAchievementsResponse;
      })
      .then((json) => {
        if (ac.signal.aborted) return;
        setAdminAchievements(json);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setAdminAchievements(null);
        setAdminAchievementsError(e instanceof Error ? e.message : "Ошибка загрузки ачивок");
      })
      .finally(() => {
        if (!ac.signal.aborted) setAdminAchievementsLoading(false);
      });

    return () => ac.abort();
  }, [forbidden, modal, editForm.role]);

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
                      Пользователь задаст пароль сам через «Первая авторизация».
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
                <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
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

                  {editForm.role === "GREENWICH" ? (
                    <div className="border-t border-zinc-100 pt-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                        Ачивки Grinvich
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        Данные из базы (актуализируются при закрытии заявки и сохранении рекорда башни). Для точного
                        пересчёта пользователь может открыть «Очивки» у себя.
                      </p>
                      {adminAchievementsLoading ? (
                        <div className="mt-2 text-sm text-zinc-600">Загрузка ачивок…</div>
                      ) : null}
                      {adminAchievementsError ? (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                          {adminAchievementsError}
                        </div>
                      ) : null}
                      {!adminAchievementsLoading && !adminAchievementsError && adminAchievements?.applicable ? (
                        <>
                          <div className="mt-2 rounded-lg border border-violet-100 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-900">
                            Непрочитанных уведомлений в приложении: {adminAchievements.unreadNotifications}
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {adminAchievements.cards.map((card) => (
                              <div
                                key={card.code}
                                className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-2.5 text-left"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white">
                                      <img
                                        src={achievementImageSrc(card.code, card.level)}
                                        alt=""
                                        className={[
                                          "h-full w-full object-cover",
                                          card.level === "NONE" ? "opacity-45 grayscale" : "",
                                        ].join(" ")}
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate text-xs font-semibold text-zinc-900">{card.title}</div>
                                      <div className="line-clamp-2 text-[11px] text-zinc-600">{card.description}</div>
                                    </div>
                                  </div>
                                  <span
                                    className={[
                                      "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                                      levelBadgeTone(card.level),
                                    ].join(" ")}
                                  >
                                    {levelLabel(card.level)}
                                  </span>
                                </div>
                                <div className="mt-1.5 text-[11px] text-zinc-700">
                                  Значение: <span className="font-semibold tabular-nums">{card.value}</span>
                                  <span className="text-zinc-500">
                                    {" "}
                                    · б {card.thresholds.bronze} / с {card.thresholds.silver} / з{" "}
                                    {card.thresholds.gold}
                                  </span>
                                </div>
                                {card.nextThreshold != null ? (
                                  <>
                                    <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-600">
                                      <span>До след. порога: {card.nextThreshold}</span>
                                      <span>{card.progressPercentToNext ?? 0}%</span>
                                    </div>
                                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full border border-violet-100 bg-white">
                                      <div
                                        className="h-full bg-gradient-to-r from-violet-500 to-violet-700"
                                        style={{ width: `${card.progressPercentToNext ?? 0}%` }}
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <div className="mt-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-center text-[10px] font-semibold text-emerald-800">
                                    Максимум
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                      {!adminAchievementsLoading &&
                      !adminAchievementsError &&
                      adminAchievements &&
                      adminAchievements.applicable === false ? (
                        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                          В базе у этого пользователя ещё не роль Grinvich. Если вы только что поменяли роль выше —
                          сохраните пользователя и откройте форму снова.
                        </div>
                      ) : null}
                    </div>
                  ) : null}

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
