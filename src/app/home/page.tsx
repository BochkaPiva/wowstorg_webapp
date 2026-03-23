"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";
import type { OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";

import { BackgroundStackGame } from "./BackgroundStackGame";
import { IssuanceCalendar } from "./IssuanceCalendar";
import { RelaxZone } from "./RelaxZone";

function EquipmentCardArrowLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="group mt-auto inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/80 bg-white/70 text-zinc-600 shadow-sm backdrop-blur-sm transition hover:border-violet-300/80 hover:bg-violet-50 hover:text-violet-800"
    >
      <svg
        className="h-4 w-4 transition group-hover:translate-x-0.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

function CardLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="text-base font-semibold tracking-tight">{title}</div>
      <div className="mt-1 text-sm text-zinc-600">{description}</div>
      <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-violet-700">
        Открыть <span className="transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

function dinoPhrase(score: number) {
  if (score >= 100) return "Идеально! Так держать.";
  if (score >= 95) return "Почти идеально! Так держать.";
  if (score >= 80) return "Хороший результат, ещё чуть-чуть до топа.";
  if (score >= 50) return "Есть куда расти. Возвращай вовремя и в порядке.";
  if (score >= 1) return "Рейтинг упал. Следующие заявки — шанс подняться.";
  return "Начни с аккуратных возвратов — рейтинг пойдёт вверх.";
}

function GreenwichRatingCard() {
  const [score, setScore] = React.useState<number | null>(null);
  const [showInfo, setShowInfo] = React.useState(false);
  const [riding, setRiding] = React.useState(false);
  const infoRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/greenwich/rating", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { score?: number }) => {
        if (!cancelled && typeof data.score === "number") setScore(data.score);
      })
      .catch(() => {
        if (!cancelled) setScore(100);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!showInfo) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!infoRef.current) return;
      const target = e.target as Node | null;
      if (target && !infoRef.current.contains(target)) {
        setShowInfo(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowInfo(false);
    };
    window.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [showInfo]);

  const s = score ?? 100;
  const pct = Math.max(0, Math.min(100, s));
  const phrase = dinoPhrase(s);

  function rideDino() {
    setRiding(true);
    window.setTimeout(() => setRiding(false), 1600);
  }

  const dinoPct = Math.max(3, Math.min(97, pct));

  return (
    <div className="rounded-3xl border border-violet-200 bg-white p-4 shadow-sm">
      <style jsx>{`
        @keyframes dinoBounce {
          0% {
            transform: translateY(0px) rotate(-6deg) scale(1);
          }
          25% {
            transform: translateY(-10px) rotate(10deg) scale(1.08);
          }
          55% {
            transform: translateY(-5px) rotate(-12deg) scale(1.03);
          }
          80% {
            transform: translateY(-8px) rotate(8deg) scale(1.02);
          }
          100% {
            transform: translateY(0px) rotate(-6deg) scale(1);
          }
        }
        .dinoBounce {
          animation: dinoBounce 1.2s ease-in-out 1;
        }
      `}</style>
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Рейтинг</div>
          <div className="mt-1 text-xs text-zinc-500">Зависит от дедлайнов возврата и состояния реквизита</div>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="shrink-0 rounded-lg border border-violet-200/80 bg-white/85 px-2.5 py-1 text-xs font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50"
          aria-expanded={showInfo}
          title="Как считается"
        >
          Как считается
        </button>
        {showInfo ? (
          <div
            ref={infoRef}
            className="absolute right-0 top-9 z-20 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-xl backdrop-blur"
          >
            <div className="text-sm font-semibold text-zinc-900">Как считается</div>
            <div className="mt-1 text-sm text-zinc-700 space-y-1">
              <div>• Возврат вовремя → больше баллов</div>
              <div>• На приёмке нашли поломки/потери → меньше</div>
              <div>• Расходники не штрафуются</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-start gap-4">
        <div className="min-w-[72px] text-4xl font-extrabold tabular-nums text-violet-800 leading-none drop-shadow-sm">
          {s}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-800">{phrase}</div>

          <div className="mt-3 relative">
            <div className="h-3 w-full overflow-hidden rounded-full bg-violet-50 border border-violet-100">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-violet-700 transition-all"
                style={{
                  width: `${pct}%`,
                  boxShadow: riding ? "0 0 18px rgba(124,58,237,0.45)" : undefined,
                }}
              />
            </div>

            <div
              className="absolute top-[-24px]"
              style={{
                left: `${dinoPct}%`,
                transform: "translateX(-50%)",
                pointerEvents: "auto",
              }}
            >
              <button
                type="button"
                onClick={rideDino}
                aria-label="Покатать динозаврика"
                title="Нажми"
                className="h-10 w-10 flex items-center justify-center p-0 bg-transparent border-0"
              >
                <div className={riding ? "dinoBounce" : ""}>
                  <div className="relative h-10 w-10">
                    <Image src="/dino.png" alt="" fill className="object-contain" sizes="40px" />
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="mt-2 text-[11px] text-zinc-500 flex items-center justify-between">
            <span>0</span>
            <span className="font-semibold text-violet-800">100</span>
          </div>
        </div>
      </div>

    </div>
  );
}

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

function GreenwichAchievementsStrip({ isGreenwich }: { isGreenwich: boolean }) {
  const [data, setData] = React.useState<AchievementSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const sortedCards = React.useMemo(() => {
    const cards = data?.cards ?? [];
    return [...cards].sort((a, b) => {
      const aUnlocked = a.level === "NONE" ? 0 : 1;
      const bUnlocked = b.level === "NONE" ? 0 : 1;
      if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
      return a.title.localeCompare(b.title, "ru");
    });
  }, [data?.cards]);

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
    <>
      <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,0.90),rgba(245,243,255,0.84))] p-2 sm:p-3 shadow-[0_8px_22px_rgba(109,40,217,0.08)] backdrop-blur">
        <div className="mb-1.5 sm:mb-2 flex items-center justify-between gap-2 sm:gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Достижения</div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/achievements"
              className="rounded-lg border border-violet-200/80 bg-white/85 px-2.5 py-1 text-xs font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50"
            >
              Подробнее
            </Link>
          </div>
        </div>

        {loading ? <div className="mt-1 text-sm text-zinc-600">Загрузка…</div> : null}
        {error ? (
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="pb-1">
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {sortedCards.map((card) => (
                <div
                  key={card.code}
                  className={[
                    "min-w-0 rounded-xl px-2 py-1.5 sm:px-2.5 sm:py-2 transition",
                    card.level === "NONE"
                      ? "bg-transparent"
                      : "bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(220,252,231,0.92))]",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div
                      className="relative h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 shrink-0 overflow-hidden rounded-xl sm:rounded-2xl"
                      title={card.title}
                    >
                      <Image
                        src={achievementImageSrc(card.code, card.level)}
                        alt={card.title}
                        fill
                        sizes="(max-width: 640px) 40px, (max-width: 1024px) 48px, 56px"
                        className={card.level === "NONE" ? "object-cover grayscale opacity-45" : "object-cover"}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] sm:text-[13px] font-semibold leading-tight text-zinc-900 line-clamp-2 sm:line-clamp-none break-words">
                        {card.title}
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-zinc-500">
                        {card.level === "NONE" ? "Не получено" : levelLabel(card.level)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function fmtDateRu(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

type GreenwichDashboardOrder = {
  id: string;
  status: OrderStatus;
  parentOrderId?: string | null;
  customerName: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
};

type GreenwichDashboardData = {
  activeCount: number;
  completedCount: number;
  nearest: GreenwichDashboardOrder | null;
};

function GreenwichDashboardBlock({ isGreenwich }: { isGreenwich: boolean }) {
  const [data, setData] = React.useState<GreenwichDashboardData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isGreenwich) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/dashboard/greenwich", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: GreenwichDashboardData) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isGreenwich]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">Заявки</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5">
            Активных: <span className="font-semibold text-violet-800">{data?.activeCount ?? 0}</span>
          </span>
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5">
            Выполненных: <span className="font-semibold text-zinc-900">{data?.completedCount ?? 0}</span>
          </span>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-600">Загрузка…</div> : null}
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-4">
          {data?.nearest ? (
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <div className="px-4 py-4 bg-zinc-50">
                <OrderStatusStepper status={data.nearest.status} />
              </div>
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-zinc-900">
                    {data.nearest.customerName}
                  </div>
                  <div className="shrink-0">
                    <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">
                      {data.nearest.totalAmount.toLocaleString("ru-RU")} ₽
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  Готовность: <span className="font-semibold">{fmtDateRu(data.nearest.readyByDate)}</span> · Период:{" "}
                  <span className="font-semibold">{fmtDateRu(data.nearest.startDate)}</span> —{" "}
                  <span className="font-semibold">{fmtDateRu(data.nearest.endDate)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/orders/${data.nearest.id}?from=dashboard`}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100 inline-flex items-center"
                  >
                    Открыть ближайшую
                  </Link>
                  {data.nearest.status === "ISSUED" && !data.nearest.parentOrderId ? (
                    <Link
                      href={`/catalog?quickParentId=${data.nearest.id}`}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 inline-flex items-center"
                    >
                      Быстрая доп.-выдача
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-600 mt-2">Пока нет активных заявок.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

type WowstorgDashboardEndedPosition = { id: string; name: string };
type WowstorgDashboardData = {
  activeCount: number;
  completedCount: number;
  nearest: null | {
    id: string;
    status: OrderStatus;
    parentOrderId?: string | null;
    customerName: string;
    greenwichUser: null | { displayName: string; ratingScore: number };
    readyByDate: string;
    startDate: string;
    endDate: string;
    totalAmount: number;
  };
  activeOrders: Array<{
    id: string;
    status: OrderStatus;
    parentOrderId?: string | null;
    customerName: string;
    greenwichUser: null | { displayName: string; ratingScore: number };
    readyByDate: string;
    startDate: string;
    endDate: string;
    totalAmount: number;
  }>;
  equipment: {
    brokenQty: number;
    lostQty: number;
    inRepairQty: number;
    positionsInStockCount: number;
    rentedPositionsCount: number;
    rentedUnitsTotal: number;
    nearestReleaseDate: string | null;
    endedPositions: WowstorgDashboardEndedPosition[];
  };
};

function WowstorgDashboardBlock({ isWowstorg }: { isWowstorg: boolean }) {
  const [data, setData] = React.useState<WowstorgDashboardData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isWowstorg) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/dashboard/wowstorg", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: WowstorgDashboardData) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isWowstorg]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
      <div className="md:col-span-8 rounded-2xl bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">Заявки</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5">
              Активных: <span className="font-semibold text-violet-800">{data?.activeCount ?? 0}</span>
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5">
              Выполненных: <span className="font-semibold text-zinc-900">{data?.completedCount ?? 0}</span>
            </span>
          </div>
        </div>

        {loading ? <div className="mt-4 text-sm text-zinc-600">Загрузка…</div> : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="mt-4">
            {data?.nearest ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                  <div className="px-4 py-4 bg-zinc-50">
                    <OrderStatusStepper status={data.nearest.status} />
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-zinc-900">
                        {data.nearest.customerName}
                        {data.nearest.greenwichUser
                          ? ` · ${data.nearest.greenwichUser.displayName} · рейтинг ${data.nearest.greenwichUser.ratingScore}`
                          : ""}
                      </div>
                      <div className="shrink-0">
                        <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">
                          {data.nearest.totalAmount.toLocaleString("ru-RU")} ₽
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-zinc-600">
                      Готовность: <span className="font-semibold">{fmtDateRu(data.nearest.readyByDate)}</span> · Период:{" "}
                      <span className="font-semibold">{fmtDateRu(data.nearest.startDate)}</span> —{" "}
                      <span className="font-semibold">{fmtDateRu(data.nearest.endDate)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/orders/${data.nearest.id}?from=dashboard`}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100 inline-flex items-center"
                      >
                        Открыть ближайшую
                      </Link>
                      {data.nearest.status === "ISSUED" &&
                      !data.nearest.parentOrderId &&
                      data.nearest.greenwichUser ? (
                        <Link
                          href={`/catalog?quickParentId=${data.nearest.id}`}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 inline-flex items-center"
                        >
                          Быстрая доп.-выдача
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>

                {data.activeOrders.length > 1 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Остальные активные заявки
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {data.activeOrders
                        .filter((o) => o.id !== data.nearest?.id)
                        .map((o) => (
                          <div
                            key={o.id}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-zinc-900">{o.customerName}</div>
                              <div className="text-xs text-zinc-600">
                                До {fmtDateRu(o.readyByDate)} · {fmtDateRu(o.startDate)} — {fmtDateRu(o.endDate)}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                                {o.totalAmount.toLocaleString("ru-RU")} ₽
                              </span>
                              <Link
                                href={`/orders/${o.id}?from=dashboard`}
                                className="text-xs font-medium text-violet-700 hover:text-violet-900"
                              >
                                Открыть
                              </Link>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-zinc-600 mt-2">Пока нет активных заявок.</div>
            )}
          </div>
        ) : null}
      </div>

      <div className="md:col-span-4 rounded-2xl bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">Реквизит</div>
          {data?.equipment.endedPositions.length ? (
            <Link
              href="/inventory/warehouse-items"
              className="text-sm font-medium text-violet-800 hover:text-violet-900"
            >
              Открыть склад
            </Link>
          ) : null}
        </div>

        {loading ? <div className="mt-3 text-sm text-zinc-600">Загрузка…</div> : null}
        {!loading && !error && data ? (
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-2 gap-2 items-stretch">
              <div className="flex min-h-[7.25rem] flex-col rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-amber-900">Ремонт</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-amber-900">{data.equipment.inRepairQty}</div>
                <EquipmentCardArrowLink href="/inventory/repair?condition=NEEDS_REPAIR" label="Открыть базу «Требует ремонта»" />
              </div>
              <div className="flex min-h-[7.25rem] flex-col rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-red-900">Сломано</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-red-900">{data.equipment.brokenQty}</div>
                <EquipmentCardArrowLink href="/inventory/repair?condition=BROKEN" label="Открыть базу «Сломано»" />
              </div>
              <div className="flex min-h-[7.25rem] flex-col rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-zinc-800">Потеряно</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-zinc-900">{data.equipment.lostQty}</div>
                <EquipmentCardArrowLink href="/inventory/losses" label="Открыть базу утерянного" />
              </div>
              <div className="flex min-h-[7.25rem] flex-col rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-violet-900">В наличии позиций</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-violet-900">{data.equipment.positionsInStockCount}</div>
                <EquipmentCardArrowLink href="/inventory/positions" label="Открыть позиции каталога" />
              </div>
              <div className="col-span-2 flex min-h-[7.25rem] flex-col rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-sky-900">В аренде сейчас</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-sky-900">
                  {data.equipment.rentedUnitsTotal} шт. · {data.equipment.rentedPositionsCount} поз.
                </div>
                <div className="mt-1 text-xs text-sky-800">
                  Ближайшее освобождение:{" "}
                  <span className="font-semibold">
                    {data.equipment.nearestReleaseDate ? fmtDateRu(data.equipment.nearestReleaseDate) : "—"}
                  </span>
                </div>
                <EquipmentCardArrowLink href="/inventory/in-rent" label="Открыть раздел «В аренде»" />
              </div>
            </div>

            {data.equipment.endedPositions.length > 0 ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-semibold text-red-900">Закончившиеся позиции</div>
                  {data.equipment.endedPositions.length > 8 ? (
                    <div className="text-xs text-red-800">+{data.equipment.endedPositions.length - 8}</div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {data.equipment.endedPositions.slice(0, 8).map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-red-200 bg-white/60 px-2.5 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 text-sm font-medium text-red-900 truncate">{p.name}</div>
                      <Link
                        href={`/inventory/warehouse-items/${p.id}`}
                        className="shrink-0 text-sm font-medium text-red-800 hover:text-red-900"
                      >
                        исправить
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-600">
                Пока всё есть в наличии (складские позиции не закончились).
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function HomeDashboardPage() {
  const { state } = useAuth();
  const [hasActiveOrders, setHasActiveOrders] = React.useState<boolean | null>(null);

  const isWowstorg =
    state.status === "authenticated" && state.user.role === "WOWSTORG";
  const isGreenwich =
    state.status === "authenticated" && state.user.role === "GREENWICH";

  React.useEffect(() => {
    if (!isGreenwich && !isWowstorg) {
      setHasActiveOrders(null);
      return;
    }
    let cancelled = false;
    const endpoint = isGreenwich ? "/api/dashboard/greenwich" : "/api/dashboard/wowstorg";
    void fetch(endpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { activeCount?: number }) => {
        if (cancelled) return;
        setHasActiveOrders((data.activeCount ?? 0) > 0);
      })
      .catch(() => {
        if (cancelled) return;
        setHasActiveOrders(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isGreenwich, isWowstorg]);

  const showBackgroundGame = hasActiveOrders === false;

  return (
    <AppShell title="Главная">
      <div className="relative space-y-6">
        <RelaxZone />
        {showBackgroundGame ? <BackgroundStackGame /> : null}
        <div className="relative z-10 space-y-6">
        {isGreenwich ? (
          <div className="rounded-3xl border border-violet-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.12),rgba(250,204,21,0.08))] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Дашборд Grinvich</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Держи темп: возвращай вовремя и в норме на приёмке
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-12">
                <GreenwichAchievementsStrip isGreenwich={isGreenwich} />
              </div>
              <div className="md:col-span-8">
                <GreenwichDashboardBlock isGreenwich={isGreenwich} />
              </div>
              <div className="md:col-span-4">
                <GreenwichRatingCard />
              </div>
            </div>
          </div>
        ) : null}

        {isWowstorg ? (
          <div className="rounded-3xl border border-violet-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.12),rgba(250,204,21,0.08))] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Дашборд</div>
                <div className="mt-1 text-xs text-zinc-600">Статус заявок и реквизита на сегодня</div>
              </div>
            </div>
            <IssuanceCalendar className="mb-3" />
            <WowstorgDashboardBlock isWowstorg={isWowstorg} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <CardLink
            href="/catalog"
            title="Каталог"
            description="Маркет реквизита: карточки, поиск, корзина, оформление."
          />

          {isWowstorg ? (
            <>
              <CardLink
                href="/warehouse/queue"
                title="Очередь заявок"
                description="Согласование, сборка, выдача, приёмка."
              />
              <CardLink
                href="/warehouse/archive"
                title="Архив заявок"
                description="Завершённые и отменённые заявки."
              />
              <CardLink
                href="/inventory/items"
                title="Инвентарь"
                description="CRUD позиций, категории, пакеты, списки ремонта/утерь."
              />
              <CardLink
                href="/admin"
                title="Админка"
                description="Пользователи, заказчики, аналитика."
              />
            </>
          ) : (
            <CardLink
              href="/orders"
              title="Мои заявки"
              description="Статусы, детали, согласование, возврат."
            />
          )}
        </div>
        </div>
      </div>
    </AppShell>
  );
}

