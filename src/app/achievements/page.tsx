"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type AchievementLevel = "NONE" | "BRONZE" | "SILVER" | "GOLD";
type AchievementCardData = {
  code: string;
  title: string;
  description: string;
  value: number;
  level: AchievementLevel;
  nextLevel: AchievementLevel | null;
  nextThreshold: number | null;
  progressPercentToNext: number | null;
  thresholds: { bronze: number; silver: number; gold: number };
};

type AchievementSnapshot = {
  cards: AchievementCardData[];
  unreadNotifications: number;
};

function levelBadgeTone(level: AchievementLevel): string {
  if (level === "GOLD") return "border-amber-300 bg-amber-50 text-amber-900";
  if (level === "SILVER") return "border-slate-300 bg-slate-50 text-slate-800";
  if (level === "BRONZE") return "border-orange-300 bg-orange-50 text-orange-900";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function levelLabel(level: AchievementLevel): string {
  if (level === "GOLD") return "Золото";
  if (level === "SILVER") return "Серебро";
  if (level === "BRONZE") return "Бронза";
  return "Нет";
}

function achievementImageSrc(code: string, level: AchievementLevel): string {
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

export default function AchievementsPage() {
  const { state } = useAuth();
  const isGreenwich =
    state.status === "authenticated" && state.user.role === "GREENWICH";

  const [data, setData] = React.useState<AchievementSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isGreenwich) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/greenwich/achievements", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: AchievementSnapshot) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки достижений");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGreenwich]);

  return (
    <AppShell title="Очивки Grinvich">
      <div className="space-y-3">
        {!isGreenwich ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Раздел доступен только сотрудникам Grinvich.
          </div>
        ) : null}

        {isGreenwich ? (
          <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold text-zinc-900">Подробные достижения</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Прогресс считается только по закрытым заявкам и рекорду игры.
                </div>
              </div>
              <Link
                href="/home"
                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-800 hover:bg-violet-100"
              >
                На главную
              </Link>
            </div>

            <div className="mt-3 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 inline-flex">
              Непрочитанных уведомлений: {data?.unreadNotifications ?? 0}
            </div>

            {loading ? <div className="mt-4 text-sm text-zinc-600">Загрузка…</div> : null}
            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {!loading && !error ? (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {(data?.cards ?? []).map((card) => (
                  <div key={card.code} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white">
                          <img
                            src={achievementImageSrc(card.code, card.level)}
                            alt={card.title}
                            className={[
                              "h-full w-full object-cover",
                              card.level === "NONE" ? "grayscale opacity-45" : "",
                            ].join(" ")}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">{card.title}</div>
                          <div className="text-xs text-zinc-600">{card.description}</div>
                        </div>
                      </div>
                      <div
                        className={[
                          "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                          levelBadgeTone(card.level),
                        ].join(" ")}
                      >
                        {levelLabel(card.level)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-700">
                      Значение: <span className="font-semibold">{card.value}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-600">
                      Пороги: бронза {card.thresholds.bronze} · серебро {card.thresholds.silver} · золото{" "}
                      {card.thresholds.gold}
                    </div>
                    {card.nextThreshold != null ? (
                      <>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-600">
                          <span>До следующего уровня: {card.nextThreshold}</span>
                          <span>{card.progressPercentToNext ?? 0}%</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full border border-violet-100 bg-white">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-violet-700 transition-all"
                            style={{ width: `${card.progressPercentToNext ?? 0}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 rounded-full bg-emerald-50 px-2 py-0.5 text-center text-xs font-semibold text-emerald-700">
                        Максимальный уровень достигнут
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
