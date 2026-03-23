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

type ToastPayload = {
  kind?: string;
  code?: string;
  level?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  orderId?: string;
  status?: string;
};

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
  const levelKey =
    level === "NONE" || level === "BRONZE"
      ? "bronze"
      : level === "SILVER"
        ? "silver"
        : "gold";
  return `/achievements/${key}_${levelKey}.png`;
}

export function InAppNotifications({ enabled }: { enabled: boolean }) {
  const [active, setActive] = React.useState<InAppNotificationRow | null>(null);
  const queueRef = React.useRef<InAppNotificationRow[]>([]);
  const seenRef = React.useRef<Set<string>>(new Set());

  const pump = React.useCallback(() => {
    if (active || queueRef.current.length === 0) return;
    const next = queueRef.current.shift() ?? null;
    if (!next) return;
    setActive(next);
    void fetch("/api/me/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [next.id] }),
    }).catch(() => null);
  }, [active]);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/me/notifications?unreadOnly=true&limit=20", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { rows?: InAppNotificationRow[] };
        if (cancelled) return;
        const rows = (json.rows ?? []).slice().reverse();
        for (const row of rows) {
          if (seenRef.current.has(row.id)) continue;
          seenRef.current.add(row.id);
          queueRef.current.push(row);
        }
        pump();
      } catch {
        // Silent fail: notifications are non-blocking UX.
      }
    };

    void poll();
    const onWake = () => {
      void poll();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    const timer = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [enabled, pump]);

  React.useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      setActive(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [active]);

  React.useEffect(() => {
    if (!active) {
      pump();
    }
  }, [active, pump]);

  if (!enabled || !active) return null;

  const payload = (active.payloadJson ?? {}) as ToastPayload;
  const isAchievement = payload.kind === "ACHIEVEMENT_UNLOCK" || active.title.startsWith("Новая ачивка");
  const isOrderStatus = payload.kind === "ORDER_STATUS_CHANGED";

  return (
    <div className="fixed right-4 top-20 z-[80] w-[350px]">
      <div
        className={[
          "rounded-2xl border bg-white/95 p-3 shadow-xl backdrop-blur transition",
          isAchievement
            ? "border-amber-200 bg-gradient-to-br from-amber-50/95 via-white to-violet-50/95"
            : "border-violet-200",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          {isAchievement ? (
            <img
              src={achievementImageSrc(payload.code ?? "NO_CANCEL_STREAK", payload.level ?? "BRONZE")}
              alt=""
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-2xl">
              🔔
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
              {isAchievement ? "Достижение получено" : "Обновление"}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-zinc-900">{active.title}</div>
            <div className="mt-1 text-xs text-zinc-600">{active.body}</div>
            {isOrderStatus && payload.orderId ? (
              <div className="mt-2">
                <Link
                  href={`/orders/${payload.orderId}?from=notification`}
                  className="inline-flex rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                >
                  Открыть заявку
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

