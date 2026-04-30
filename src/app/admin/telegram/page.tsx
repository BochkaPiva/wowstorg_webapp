"use client";

import * as React from "react";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type TelegramStatus = {
  telegram: {
    hasBotToken: boolean;
    warehouseChatId: string | null;
    warehouseTopicId: string | null;
    sendTimeoutMs?: number;
    proxyEnabled?: boolean;
    proxyLabel?: string | null;
  };
  greenwich: {
    activeUsers: number;
    withTelegramChatId: number;
    users: Array<{
      id: string;
      displayName: string;
      login: string;
      telegramChatId: string | null;
      hasTelegramChatId: boolean;
    }>;
  };
};

export default function AdminTelegramPage() {
  const { state } = useAuth();
  const forbidden =
    state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [status, setStatus] = React.useState<TelegramStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<string | null>(null);
  const [dmChatId, setDmChatId] = React.useState("");
  const [greenwichUserId, setGreenwichUserId] = React.useState("");

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/telegram", { cache: "no-store" });
      const text = await res.text();
      let data: (TelegramStatus & { error?: { message?: string } }) | { error?: { message?: string } } =
        {} as TelegramStatus;
      if (text) {
        try {
          data = JSON.parse(text) as TelegramStatus & { error?: { message?: string } };
        } catch {
          setError("Некорректный ответ сервера");
          setStatus(null);
          return;
        }
      }
      if (!res.ok) {
        setError(
          ("error" in data && data.error?.message) || `Ошибка ${res.status}`,
        );
        setStatus(null);
        return;
      }
      if ("telegram" in data && data.telegram) {
        setStatus(data as TelegramStatus);
      } else {
        setError("Некорректный ответ сервера");
        setStatus(null);
      }
    } catch {
      setError("Сеть или сервер недоступны");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!forbidden) void load();
  }, [forbidden, load]);

  async function postTest(
    kind: "warehouse" | "dm" | "greenwich-broadcast" | "greenwich-user",
    options?: { chatId?: string; userId?: string },
  ) {
    setBusy(kind);
    setLastResult(null);
    setError(null);
    try {
      const body =
        kind === "dm"
          ? { kind: "dm" as const, chatId: options?.chatId ?? "" }
          : kind === "greenwich-user"
            ? { kind: "greenwich-user" as const, userId: options?.userId ?? "" }
          : kind === "greenwich-broadcast"
            ? { kind: "greenwich-broadcast" as const }
          : { kind: "warehouse" as const };
      const res = await fetch("/api/admin/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      setLastResult(text.length > 2000 ? text.slice(0, 2000) + "…" : text);
      if (!res.ok) {
        try {
          const j = JSON.parse(text) as { error?: { message?: string } };
          setError(j?.error?.message ?? `HTTP ${res.status}`);
        } catch {
          setError(`HTTP ${res.status}`);
        }
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Telegram">
      <div className="mb-4">
        <Link href="/admin" className="text-sm text-violet-700 hover:underline">
          ← Админка
        </Link>
      </div>

      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Раздел доступен только пользователю со ролью склад (WOWSTORG).
        </div>
      ) : (
        <div className="max-w-xl space-y-4">
          <p className="text-sm text-zinc-600">
            Проверка токена, чата склада и тестовая отправка. Если **Connect timeout** до{" "}
            <code className="rounded bg-zinc-100 px-1">api.telegram.org</code>, в{" "}
            <code className="rounded bg-zinc-100 px-1">.env</code> задайте{" "}
            <code className="rounded bg-zinc-100 px-1">TELEGRAM_HTTPS_PROXY=http://127.0.0.1:ПОРТ</code>{" "}
            (локальный прокси VPN) и перезапустите сервер. Ниже в статусе видно, включён ли прокси.
          </p>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
              >
                Обновить статус
              </button>
            </div>

            {loading && <p className="mt-3 text-sm text-zinc-500">Загрузка…</p>}

            {status && !loading && (
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Токен бота</dt>
                  <dd className="font-mono">{status.telegram.hasBotToken ? "да" : "нет"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Чат склада</dt>
                  <dd className="break-all font-mono">
                    {status.telegram.warehouseChatId ?? "—"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Топик</dt>
                  <dd className="font-mono">{status.telegram.warehouseTopicId ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Таймаут API</dt>
                  <dd className="font-mono">
                    {status.telegram.sendTimeoutMs != null
                      ? `${status.telegram.sendTimeoutMs} мс`
                      : "—"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Прокси к Telegram</dt>
                  <dd className="break-all font-mono text-xs">
                    {status.telegram.proxyEnabled
                      ? (status.telegram.proxyLabel ?? "да")
                      : "нет (прямое подключение)"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Greenwich</dt>
                  <dd>
                    активных: {status.greenwich.activeUsers}, с Telegram ID:{" "}
                    {status.greenwich.withTelegramChatId}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800">Тест в группу склада</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Нужны <code className="rounded bg-zinc-100 px-0.5">TELEGRAM_BOT_TOKEN</code> и{" "}
              <code className="rounded bg-zinc-100 px-0.5">TELEGRAM_NOTIFICATION_CHAT_ID</code> в{" "}
              <code className="rounded bg-zinc-100 px-0.5">.env</code>, бот добавлен в группу.
            </p>
            <button
              type="button"
              onClick={() => void postTest("warehouse")}
              disabled={Boolean(busy)}
              className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy === "warehouse" ? "Отправка…" : "Отправить тест в чат склада"}
            </button>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-emerald-950">Индивидуальный тест Grinvich</h2>
            <p className="mt-1 text-xs text-emerald-800">
              Выберите сотрудника по ФИО. Тест уйдет только в Telegram ID, который привязан к этому пользователю на сайте.
            </p>
            <select
              value={greenwichUserId}
              onChange={(e) => setGreenwichUserId(e.target.value)}
              className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Выберите сотрудника Grinvich</option>
              {(status?.greenwich.users ?? []).map((user) => (
                <option
                  key={user.id}
                  value={user.id}
                  disabled={!user.hasTelegramChatId}
                >
                  {user.displayName} · @{user.login}
                  {user.telegramChatId ? ` · ${user.telegramChatId}` : " · Telegram ID не заполнен"}
                </option>
              ))}
            </select>
            {greenwichUserId ? (
              <div className="mt-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs text-zinc-600">
                {(() => {
                  const user = status?.greenwich.users.find((u) => u.id === greenwichUserId);
                  if (!user) return "Сотрудник не найден в текущем списке.";
                  return (
                    <>
                      Получатель: <span className="font-semibold text-zinc-900">{user.displayName}</span>
                      {" · "}
                      Telegram ID:{" "}
                      <span className="font-mono text-zinc-900">
                        {user.telegramChatId ?? "не заполнен"}
                      </span>
                    </>
                  );
                })()}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void postTest("greenwich-user", { userId: greenwichUserId })}
              disabled={Boolean(busy) || !greenwichUserId}
              className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === "greenwich-user" ? "Отправка…" : "Отправить выбранному сотруднику"}
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800">Тест в личку (DM)</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Укажите numeric chat_id пользователя (из @userinfobot). Пользователь должен написать боту /start.
            </p>
            <input
              value={dmChatId}
              onChange={(e) => setDmChatId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
              placeholder="например -1001234567890 или 123456789"
            />
            <button
              type="button"
              onClick={() => void postTest("dm", { chatId: dmChatId.trim() })}
              disabled={Boolean(busy) || !dmChatId.trim()}
              className="mt-3 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
            >
              {busy === "dm" ? "Отправка…" : "Отправить тест в ЛС"}
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800">Тест всем Grinvich</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Массовая проверка всех активных сотрудников с Telegram ID. Каждому придёт персональное сообщение с его ФИО,
              логином и Telegram ID, чтобы было видно, кому именно оно доставлено.
            </p>
            <button
              type="button"
              onClick={() => void postTest("greenwich-broadcast")}
              disabled={Boolean(busy)}
              className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            >
              {busy === "greenwich-broadcast" ? "Отправка…" : "Отправить тест всем Grinvich"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {lastResult && (
            <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-zinc-700">Ответ API</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-zinc-600">
                {lastResult}
              </pre>
            </details>
          )}

          <p className="text-xs text-zinc-500">
            Подробнее: <code className="rounded bg-zinc-100 px-1">docs/telegram-notifications.md</code>
          </p>
        </div>
      )}
    </AppShell>
  );
}
