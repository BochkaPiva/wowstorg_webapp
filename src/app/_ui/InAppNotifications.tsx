"use client";

import Link from "next/link";
import Image from "next/image";
import React from "react";

import { mergeNotificationRows, type NotificationCursor } from "@/lib/in-app-notifications";
import { readJsonSafe } from "@/lib/fetchJson";

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

type NotificationsResponse = {
  rows?: InAppNotificationRow[];
  unreadCount?: number;
  cursor?: NotificationCursor;
};

type PushState = "loading" | "unsupported" | "not_configured" | "blocked" | "disabled" | "enabled" | "error";

const ACTIVE_LIMIT = 30;
const HISTORY_LIMIT = 50;
const POLL_INTERVAL_MS = 15_000;

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
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return date.toLocaleString("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function BellIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 4 4L19 6" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.52-1H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.52V3h4v.08A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.52 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></svg>;
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
  const [historyRows, setHistoryRows] = React.useState<InAppNotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [activeToast, setActiveToast] = React.useState<InAppNotificationRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [pushState, setPushState] = React.useState<PushState>("loading");
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushPublicKey, setPushPublicKey] = React.useState<string | null>(null);
  const cursorRef = React.useRef<NotificationCursor | null>(null);
  const initializedRef = React.useRef(false);
  const panelOpenRef = React.useRef(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  const loadActive = React.useCallback(async (withLoading = false) => {
    if (!enabled) return;
    if (withLoading) setLoading(true);
    try {
      const res = await fetch(`/api/me/notifications?view=active&limit=${ACTIVE_LIMIT}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await readJsonSafe<NotificationsResponse>(res);
      if (!json) return;
      setRows(json.rows ?? []);
      setUnreadCount(json.unreadCount ?? 0);
      if (!initializedRef.current && json.cursor) {
        cursorRef.current = json.cursor;
        initializedRef.current = true;
      }
    } finally {
      if (withLoading) setLoading(false);
    }
  }, [enabled]);

  const pollNew = React.useCallback(async () => {
    if (!enabled || document.visibilityState !== "visible") return;
    const cursor = cursorRef.current;
    if (!cursor) {
      await loadActive();
      return;
    }
    const params = new URLSearchParams({ view: "active", limit: String(ACTIVE_LIMIT), after: cursor.createdAt });
    if (cursor.id) params.set("afterId", cursor.id);
    const res = await fetch(`/api/me/notifications?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;
    const json = await readJsonSafe<NotificationsResponse>(res);
    if (!json) return;
    if (json.cursor) cursorRef.current = json.cursor;
    setUnreadCount(json.unreadCount ?? 0);
    const freshRows = (json.rows ?? []).filter((row) => !row.isRead);
    if (freshRows.length === 0) return;
    setRows((current) => mergeNotificationRows(current, freshRows, ACTIVE_LIMIT));
    if (!panelOpenRef.current) setActiveToast((current) => mergeNotificationRows(current, freshRows, ACTIVE_LIMIT));
  }, [enabled, loadActive]);

  React.useEffect(() => {
    if (!enabled) return;
    void loadActive(true);
    const timer = window.setInterval(() => void pollNew(), POLL_INTERVAL_MS);
    const onFocus = () => void pollNew().then(() => loadActive());
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, loadActive, pollNew]);

  React.useEffect(() => {
    if (activeToast.length === 0) return;
    const timer = window.setTimeout(() => setActiveToast([]), 7000);
    return () => window.clearTimeout(timer);
  }, [activeToast]);

  React.useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setPanelOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panelOpen]);

  const loadHistory = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/me/notifications?view=history&limit=${HISTORY_LIMIT}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await readJsonSafe<NotificationsResponse>(res);
      setHistoryRows(json?.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const openHistory = React.useCallback(() => {
    setShowHistory(true);
    setSettingsOpen(false);
    void loadHistory();
  }, [loadHistory]);

  const markRead = React.useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setRows((current) => current.filter((row) => !idSet.has(row.id)));
    setUnreadCount((count) => Math.max(0, count - ids.length));
    await fetch("/api/me/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => null);
  }, []);

  const markAllRead = React.useCallback(async () => {
    if (busy || unreadCount === 0) return;
    setBusy(true);
    const previousRows = rows;
    const previousUnread = unreadCount;
    setRows([]);
    setUnreadCount(0);
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      if (!res.ok) {
        setRows(previousRows);
        setUnreadCount(previousUnread);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, rows, unreadCount]);

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
    const json = await readJsonSafe<{ enabled?: boolean; publicKey?: string | null }>(res);
    if (!json?.enabled || !json.publicKey) {
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
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(pushPublicKey),
      });
      const res = await fetch("/api/me/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      setPushState(res.ok ? "enabled" : "error");
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
  const visibleRows = showHistory ? historyRows : rows;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          const nextOpen = !panelOpen;
          setPanelOpen(nextOpen);
          if (nextOpen) {
            setShowHistory(false);
            setSettingsOpen(false);
            setActiveToast([]);
            void loadActive();
          }
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        aria-label="Открыть уведомления"
        aria-expanded={panelOpen}
        title="Уведомления"
      >
        <BellIcon />
        {unreadCount > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {panelOpen ? (
        <section className="fixed inset-x-3 top-16 z-50 max-h-[calc(100vh-5rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[400px]" aria-label="Центр уведомлений">
          <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {showHistory ? <button type="button" onClick={() => setShowHistory(false)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Вернуться к актуальным уведомлениям">←</button> : null}
                <h2 className="text-sm font-bold text-zinc-950">{showHistory ? "История" : "Актуальное"}</h2>
              </div>
              {!showHistory && unreadCount > 0 ? <p className="mt-0.5 text-xs text-zinc-500">{unreadCount} требуют просмотра</p> : null}
            </div>
            {!showHistory ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => void markAllRead()} disabled={busy || unreadCount === 0} className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-35" title="Отметить всё прочитанным" aria-label="Отметить всё прочитанным"><CheckIcon /></button>
                <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" title="Настройки уведомлений" aria-label="Настройки уведомлений" aria-expanded={settingsOpen}><SettingsIcon /></button>
              </div>
            ) : null}
          </header>

          {settingsOpen && !showHistory ? <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3"><BrowserPushControl state={pushState} busy={pushBusy} onEnable={enableBrowserPush} onDisable={disableBrowserPush} /></div> : null}

          <div className="max-h-[430px] overflow-y-auto overscroll-contain">
            {loading && visibleRows.length === 0 ? <NotificationListSkeleton /> : visibleRows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-zinc-500"><CheckIcon /></div>
                <p className="mt-3 text-sm font-semibold text-zinc-900">{showHistory ? "История пока пуста" : "Всё просмотрено"}</p>
                {!showHistory ? <p className="mt-1 text-xs text-zinc-500">Новые события появятся здесь.</p> : null}
              </div>
            ) : <div className="divide-y divide-zinc-100">{visibleRows.map((row) => <NotificationListItem key={row.id} row={row} active={!showHistory} onRead={markRead} onClose={() => setPanelOpen(false)} />)}</div>}
          </div>

          {!showHistory ? <footer className="border-t border-zinc-200 px-4 py-2.5 text-center"><button type="button" onClick={openHistory} className="text-xs font-semibold text-zinc-600 hover:text-zinc-950">Посмотреть историю</button></footer> : null}
        </section>
      ) : null}

      {activeToast.length > 0 ? <NotificationToast rows={activeToast} onClose={() => setActiveToast([])} onOpenCenter={() => { setActiveToast([]); setShowHistory(false); setPanelOpen(true); }} onRead={markRead} /> : null}
    </div>
  );
}

function NotificationListItem({ row, active, onRead, onClose }: { row: InAppNotificationRow; active: boolean; onRead: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const href = hrefFor(row);
  const content = (
    <div className="flex gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50">
      <NotificationIcon row={row} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3"><div className="line-clamp-1 text-sm font-semibold text-zinc-950">{row.title}</div><div className="shrink-0 text-[11px] text-zinc-500">{formatTime(row.createdAt)}</div></div>
        <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600">{row.body}</div>
      </div>
      {active ? <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-600" aria-label="Непрочитано" /> : null}
    </div>
  );
  if (!href) return <button type="button" className="block w-full" onClick={() => active && void onRead([row.id])}>{content}</button>;
  return <Link href={href} className="block" onClick={() => { if (active) void onRead([row.id]); onClose(); }}>{content}</Link>;
}

function BrowserPushControl({ state, busy, onEnable, onDisable }: { state: PushState; busy: boolean; onEnable: () => Promise<void>; onDisable: () => Promise<void> }) {
  const enabled = state === "enabled";
  const description = state === "loading" ? "Проверяем состояние…" : state === "unsupported" ? "Этот браузер не поддерживает push-уведомления." : state === "not_configured" ? "Push станет доступен после настройки VAPID-ключей." : state === "blocked" ? "Разрешение заблокировано в настройках браузера." : state === "error" ? "Не удалось обновить подписку." : enabled ? "Включены на этом устройстве." : "Можно получать события вне открытой вкладки.";
  const canToggle = !["loading", "unsupported", "not_configured", "blocked"].includes(state);
  return <div className="flex items-center justify-between gap-4"><div className="min-w-0"><div className="text-xs font-semibold text-zinc-900">Уведомления браузера</div><div className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{description}</div></div>{canToggle ? <button type="button" onClick={() => void (enabled ? onDisable() : onEnable())} disabled={busy} className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:border-zinc-500 disabled:opacity-50">{busy ? "…" : enabled ? "Выключить" : "Включить"}</button> : null}</div>;
}

function NotificationIcon({ row }: { row: InAppNotificationRow }) {
  const payload = payloadOf(row);
  if (isAchievement(row)) return <Image src={achievementImageSrc(payload.code ?? "NO_CANCEL_STREAK", payload.level ?? "BRONZE")} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg object-cover" />;
  const tone = row.type === "ORDER_DISCOUNT" ? "bg-amber-100 text-amber-800" : row.type === "PROJECT_UPDATED" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-700";
  return <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}><BellIcon className="h-4 w-4" /></div>;
}

function NotificationListSkeleton() {
  return <div className="divide-y divide-zinc-100" aria-label="Загрузка уведомлений">{[0, 1, 2].map((key) => <div key={key} className="flex gap-3 px-4 py-3"><div className="h-9 w-9 animate-pulse rounded-lg bg-zinc-100" /><div className="flex-1"><div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100" /><div className="mt-2 h-3 w-full animate-pulse rounded bg-zinc-100" /></div></div>)}</div>;
}

function NotificationToast({ rows, onClose, onOpenCenter, onRead }: { rows: InAppNotificationRow[]; onClose: () => void; onOpenCenter: () => void; onRead: (ids: string[]) => Promise<void> }) {
  const row = rows[0];
  const batched = rows.length > 1;
  const href = !batched ? hrefFor(row) : null;
  return (
    <div className="fixed right-4 top-20 z-[60] w-[min(92vw,360px)]" role="status" aria-live="polite">
      <div className="rounded-xl bg-zinc-950 p-3 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white"><BellIcon className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{batched ? `${rows.length} новых событий` : row.title}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-300">{batched ? "Откройте центр, чтобы посмотреть актуальные уведомления." : row.body}</div>
            {href ? <Link href={href} className="mt-2 inline-flex text-xs font-semibold text-amber-300 hover:text-amber-200" onClick={() => { void onRead([row.id]); onClose(); }}>Открыть →</Link> : batched ? <button type="button" className="mt-2 text-xs font-semibold text-amber-300 hover:text-amber-200" onClick={onOpenCenter}>Посмотреть →</button> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Закрыть уведомление">×</button>
        </div>
      </div>
    </div>
  );
}
