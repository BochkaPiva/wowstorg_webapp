"use client";

import Link from "next/link";
import React from "react";

type InAppNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  payloadJson: unknown;
  isRead: boolean;
  createdAt: string;
};

type NotificationPayload = {
  kind?: string;
  code?: string;
  level?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  orderId?: string;
  projectId?: string;
  href?: string;
};

type PushState = "loading" | "unsupported" | "not_configured" | "blocked" | "disabled" | "enabled" | "error";

function achievementImageSrc(code: string, level: "NONE" | "BRONZE" | "SILVER" | "GOLD"): string {
  const key =
    code === "PERFECT_ORDERS"
      ? "perfect_orders"
      : code === "TOWER_SCORE"
        ? "tower_score"
        : code === "ORDER_VOLUME"
          ? "order_volume"
          : code === "BIGGEST_CHECK"
            ? "biggest_check"
            : code === "CLOSED_ORDERS"
              ? "closed_orders"
              : "no_cancel_streak";
  const levelKey = level === "NONE" || level === "BRONZE" ? "bronze" : level === "SILVER" ? "silver" : "gold";
  return `/achievements/${key}_${levelKey}.png`;
}

function payloadOf(row: InAppNotificationRow): NotificationPayload {
  return (row.payloadJson ?? {}) as NotificationPayload;
}

function hrefFor(row: InAppNotificationRow): string | null {
  const payload = payloadOf(row);
  if (typeof payload.href === "string" && payload.href.length > 0) return payload.href;
  if (payload.orderId) return `/orders/${payload.orderId}?from=notification`;
  if (payload.projectId) return `/projects/${payload.projectId}`;
  return null;
}

function isAchievement(row: InAppNotificationRow): boolean {
  const payload = payloadOf(row);
  return row.type === "ACHIEVEMENT_UNLOCK" || payload.kind === "ACHIEVEMENT_UNLOCK" || row.title.startsWith("Новая ачивка");
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output.buffer as ArrayBuffer;
}

export function InAppNotifications({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = React.useState<InAppNotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [activeToast, setActiveToast] = React.useState<InAppNotificationRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pushState, setPushState] = React.useState<PushState>("loading");
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushPublicKey, setPushPublicKey] = React.useState<string | null>(null);
  const seenToastRef = React.useRef<Set<string>>(new Set());
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    if (!enabled) return;
    const res = await fetch("/api/me/notifications?limit=30", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { rows?: InAppNotificationRow[]; unreadCount?: number };
    const nextRows = json.rows ?? [];
    setRows(nextRows);
    setUnreadCount(json.unreadCount ?? 0);

    const newestUnread = [...nextRows].reverse().find((row) => !row.isRead && !seenToastRef.current.has(row.id));
    if (newestUnread) {
      seenToastRef.current.add(newestUnread.id);
      setActiveToast((current) => current ?? newestUnread);
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    const onWake = () => void load();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [enabled, load]);

  React.useEffect(() => {
    if (!activeToast) return;
    const timer = window.setTimeout(() => setActiveToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [activeToast]);

  React.useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setPanelOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [panelOpen]);

  const loadPushState = React.useCallback(async () => {
    if (!enabled) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("blocked");
      return;
    }

    const res = await fetch("/api/me/push-subscriptions", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setPushState("error");
      return;
    }
    const json = (await res.json()) as { enabled?: boolean; publicKey?: string | null };
    if (!json.enabled || !json.publicKey) {
      setPushState("not_configured");
      setPushPublicKey(null);
      return;
    }
    setPushPublicKey(json.publicKey);
    const registration = await navigator.serviceWorker.getRegistration("/browser-push-sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/me/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      }).catch(() => null);
    }
    setPushState(subscription ? "enabled" : "disabled");
  }, [enabled]);

  React.useEffect(() => {
    void loadPushState();
  }, [loadPushState]);

  const markRead = React.useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    await fetch("/api/me/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => null);
    setRows((current) => current.map((row) => (ids.includes(row.id) ? { ...row, isRead: true } : row)));
    setUnreadCount((count) => Math.max(0, count - ids.length));
  }, []);

  const markAllRead = React.useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setRows((current) => current.map((row) => ({ ...row, isRead: true })));
      setUnreadCount(0);
    } finally {
      setBusy(false);
    }
  }, []);

  const clearAll = React.useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/me/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });
      setRows([]);
      setUnreadCount(0);
      setPanelOpen(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const enableBrowserPush = React.useCallback(async () => {
    if (!pushPublicKey || pushBusy) return;
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setPushState("blocked");
        return;
      }
      if (permission !== "granted") {
        setPushState("disabled");
        return;
      }

      const registration = await navigator.serviceWorker.register("/browser-push-sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(pushPublicKey),
        }));

      const res = await fetch("/api/me/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) {
        setPushState("error");
        return;
      }
      setPushState("enabled");
    } catch (error) {
      console.error("[browser-push] subscribe failed", error);
      setPushState("error");
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, pushPublicKey]);

  const disableBrowserPush = React.useCallback(async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/browser-push-sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      await subscription?.unsubscribe().catch(() => null);
      if (endpoint) {
        await fetch("/api/me/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => null);
      }
      setPushState("disabled");
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy]);

  if (!enabled) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setPanelOpen((v) => !v);
          void load();
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50"
        aria-label="Открыть уведомления"
        title="Уведомления"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {panelOpen ? (
        <div className="absolute right-0 top-11 z-50 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-2xl">
          <div className="border-b border-zinc-100 bg-gradient-to-r from-violet-50 to-amber-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-zinc-950">Уведомления</div>
                <div className="text-xs text-zinc-600">Непрочитанных: {unreadCount}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={busy || unreadCount === 0}
                  className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                >
                  Прочитать все
                </button>
                <button
                  type="button"
                  onClick={() => void clearAll()}
                  disabled={busy || rows.length === 0}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Очистить
                </button>
              </div>
            </div>
            <BrowserPushControl
              state={pushState}
              busy={pushBusy}
              onEnable={enableBrowserPush}
              onDisable={disableBrowserPush}
            />
          </div>
          <div className="max-h-[430px] overflow-y-auto p-2">
            {rows.length === 0 ? (
              <div className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">Пока нет уведомлений.</div>
            ) : (
              rows.map((row) => <NotificationListItem key={row.id} row={row} onRead={markRead} onClose={() => setPanelOpen(false)} />)
            )}
          </div>
        </div>
      ) : null}

      {activeToast ? <NotificationToast row={activeToast} onClose={() => setActiveToast(null)} /> : null}
    </div>
  );
}

function NotificationListItem({
  row,
  onRead,
  onClose,
}: {
  row: InAppNotificationRow;
  onRead: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const href = hrefFor(row);
  const content = (
    <div
      className={[
        "flex gap-3 rounded-xl border px-3 py-2.5 transition",
        row.isRead ? "border-zinc-100 bg-white hover:bg-zinc-50" : "border-violet-100 bg-violet-50/70 hover:bg-violet-50",
      ].join(" ")}
    >
      <NotificationIcon row={row} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate text-sm font-semibold text-zinc-950">{row.title}</div>
          <div className="shrink-0 text-[11px] text-zinc-500">{formatTime(row.createdAt)}</div>
        </div>
        <div className="mt-1 line-clamp-2 text-xs text-zinc-600">{row.body}</div>
      </div>
    </div>
  );

  if (!href) {
    return (
      <button type="button" className="mb-2 block w-full text-left" onClick={() => void onRead([row.id])}>
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className="mb-2 block"
      onClick={() => {
        void onRead([row.id]);
        onClose();
      }}
    >
      {content}
    </Link>
  );
}

function BrowserPushControl({
  state,
  busy,
  onEnable,
  onDisable,
}: {
  state: PushState;
  busy: boolean;
  onEnable: () => Promise<void>;
  onDisable: () => Promise<void>;
}) {
  if (state === "loading") {
    return <div className="mt-3 rounded-xl bg-white/65 px-3 py-2 text-xs text-zinc-500">Проверяем уведомления браузера...</div>;
  }
  if (state === "unsupported") {
    return <div className="mt-3 rounded-xl bg-white/65 px-3 py-2 text-xs text-zinc-500">Этот браузер не поддерживает push-уведомления.</div>;
  }
  if (state === "not_configured") {
    return <div className="mt-3 rounded-xl bg-white/65 px-3 py-2 text-xs text-zinc-500">Push-уведомления будут доступны после добавления VAPID-ключей.</div>;
  }
  if (state === "blocked") {
    return <div className="mt-3 rounded-xl bg-white/65 px-3 py-2 text-xs text-zinc-600">Уведомления заблокированы в настройках браузера.</div>;
  }

  const enabled = state === "enabled";
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-violet-100 bg-white/75 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-zinc-800">Уведомления браузера</div>
        <div className="text-[11px] text-zinc-500">{enabled ? "Включены на этом устройстве" : state === "error" ? "Не удалось обновить подписку" : "Можно получать уведомления вне вкладки"}</div>
      </div>
      <button
        type="button"
        onClick={() => void (enabled ? onDisable() : onEnable())}
        disabled={busy}
        className={[
          "shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50",
          enabled ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50" : "bg-violet-600 text-white hover:bg-violet-700",
        ].join(" ")}
      >
        {busy ? "..." : enabled ? "Выключить" : "Включить"}
      </button>
    </div>
  );
}

function NotificationIcon({ row }: { row: InAppNotificationRow }) {
  const payload = payloadOf(row);
  if (isAchievement(row)) {
    return (
      <img
        src={achievementImageSrc(payload.code ?? "NO_CANCEL_STREAK", payload.level ?? "BRONZE")}
        alt=""
        className="h-11 w-11 shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
      <BellIcon />
    </div>
  );
}

function NotificationToast({ row, onClose }: { row: InAppNotificationRow; onClose: () => void }) {
  const href = hrefFor(row);
  return (
    <div className="fixed right-4 top-20 z-[80] w-[min(92vw,360px)]">
      <div
        className={[
          "rounded-2xl border bg-white/95 p-3 shadow-xl backdrop-blur",
          isAchievement(row) ? "border-amber-200 bg-gradient-to-br from-amber-50/95 via-white to-violet-50/95" : "border-violet-200",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <NotificationIcon row={row} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
              {isAchievement(row) ? "Достижение получено" : "Новое уведомление"}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-zinc-900">{row.title}</div>
            <div className="mt-1 text-xs text-zinc-600">{row.body}</div>
            {href ? (
              <Link
                href={href}
                className="mt-2 inline-flex rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                onClick={onClose}
              >
                Открыть
              </Link>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Закрыть уведомление">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29 10.59 10.6l6.3-6.31z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
