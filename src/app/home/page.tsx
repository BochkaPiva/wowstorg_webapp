"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";
import type { OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";
import { formatRentalPeriodRangeRu, type RentalPartOfDay } from "@/lib/rental-days";

import { BackgroundStackGame } from "./BackgroundStackGame";
import { IssuanceCalendar } from "./IssuanceCalendar";
import { RelaxZone } from "./RelaxZone";
import { WowstorgIdleText } from "./WowstorgIdleText";

const DASH_SECTION_SHELL =
  "rounded-2xl border border-zinc-200 bg-zinc-100/70 p-3 sm:p-4";
const DASH_CARD = "rounded-xl border border-zinc-200 bg-white p-4";
const DASH_SUBCARD = "overflow-hidden rounded-xl border border-zinc-200 bg-white";
const BTN_PRIMARY =
  "inline-flex items-center rounded-lg border border-zinc-950 bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:border-yellow-400 hover:bg-yellow-400 hover:text-zinc-950";
const BTN_WARM =
  "inline-flex items-center rounded-lg border border-yellow-400 bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-yellow-300";
const BADGE_PRIMARY = "rounded-full border border-yellow-300 bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-zinc-900";
const BADGE_NEUTRAL = "rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700";
const LINK_SUBTLE = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:border-zinc-950 hover:bg-zinc-950 hover:text-white";
const BTN_ICON_ROUND =
  "group inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:border-yellow-400 hover:bg-yellow-400 hover:text-zinc-950";

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
      className={`mt-auto ml-auto ${BTN_ICON_ROUND}`}
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
  variant = "default",
}: {
  href: string;
  title: string;
  description: string;
  variant?: "default" | "highlight";
}) {
  return (
    <Link
      href={href}
      className={[
        "group rounded-xl border p-4 transition hover:-translate-y-px",
        variant === "highlight"
          ? "border-yellow-400 bg-yellow-400 text-zinc-950"
          : "border-zinc-200 bg-white",
      ].join(" ")}
    >
      <div className="text-base font-semibold tracking-tight">{title}</div>
      <div className={["mt-1 text-sm", variant === "highlight" ? "text-zinc-800" : "text-zinc-600"].join(" ")}>
        {description}
      </div>
      <div
        className={[
          "mt-3 inline-flex items-center gap-2 text-sm font-medium",
          variant === "highlight" ? "text-zinc-950" : "text-violet-700",
        ].join(" ")}
      >
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
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
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

function periodLineHomeDash(o: {
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay | null;
  rentalEndPartOfDay?: RentalPartOfDay | null;
}): string {
  return formatRentalPeriodRangeRu({
    startDateIso: o.startDate.slice(0, 10),
    endDateIso: o.endDate.slice(0, 10),
    startDateFormatted: fmtDateRu(o.startDate),
    endDateFormatted: fmtDateRu(o.endDate),
    rentalStartPartOfDay: o.rentalStartPartOfDay ?? undefined,
    rentalEndPartOfDay: o.rentalEndPartOfDay ?? undefined,
  });
}

type GreenwichDashboardOrder = {
  id: string;
  status: OrderStatus;
  parentOrderId?: string | null;
  customerName: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay | null;
  rentalEndPartOfDay?: RentalPartOfDay | null;
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
    <div className={DASH_CARD}>
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
            <div className={DASH_SUBCARD}>
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
                  <span className="font-semibold">{periodLineHomeDash(data.nearest)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/orders/${data.nearest.id}?from=dashboard`}
                    className={BTN_PRIMARY}
                  >
                    Открыть ближайшую
                  </Link>
                  {data.nearest.status === "ISSUED" && !data.nearest.parentOrderId ? (
                    <Link
                      href={`/catalog?quickParentId=${data.nearest.id}`}
                      className={BTN_WARM}
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
type InventoryAuditStatus = {
  id: string;
  severity: "OK" | "WARNING" | "CRITICAL" | "FAILED";
  kind: "AUTO" | "MANUAL";
  startedAt: string;
  finishedAt: string | null;
  summaryJson: null | { totalItems?: number; okCount?: number; warningCount?: number; criticalCount?: number };
  errorText: string | null;
};

function auditTone(status: InventoryAuditStatus["severity"]) {
  if (status === "OK") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "WARNING") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "CRITICAL") return "border-red-200 bg-red-50 text-red-900";
  return "border-zinc-300 bg-zinc-100 text-zinc-800";
}

function auditDotTone(status: InventoryAuditStatus["severity"]) {
  if (status === "OK") return "bg-emerald-500 shadow-emerald-300/80";
  if (status === "WARNING") return "bg-amber-500 shadow-amber-300/80";
  if (status === "CRITICAL") return "bg-red-500 shadow-red-300/80";
  return "bg-zinc-500 shadow-zinc-300/80";
}

function useInventoryAuditStatus() {
  const [row, setRow] = React.useState<InventoryAuditStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/admin/inventory-audit/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { status?: InventoryAuditStatus }) => {
        if (!cancelled) setRow(j.status ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { row, loading, error };
}

function InventoryAuditBadge() {
  const { row, loading, error } = useInventoryAuditStatus();

  if (loading) {
    return (
      <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500">
        Аудит: загрузка…
      </div>
    );
  }

  if (error) {
    return (
      <Link
        href="/admin/inventory-audit"
        className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        Аудит: ошибка
      </Link>
    );
  }

  if (!row) {
    return (
      <Link
        href="/admin/inventory-audit"
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />
        Аудит не запускался
      </Link>
    );
  }

  const label =
    row.severity === "OK"
      ? "Все в норме"
      : row.severity === "WARNING"
        ? "Есть предупреждения"
        : row.severity === "CRITICAL"
          ? "Есть расхождения"
          : "Проверка с ошибкой";

  return (
    <Link
      href="/admin/inventory-audit"
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition hover:brightness-[0.98]",
        auditTone(row.severity),
      ].join(" ")}
      title={`Последняя проверка ${fmtDateRu(row.startedAt)}`}
    >
      <span className={["block h-2.5 w-2.5 rounded-full shadow-sm", auditDotTone(row.severity)].join(" ")} />
      <span>{label}</span>
      <span className="hidden text-[11px] font-medium opacity-80 sm:inline">
        {fmtDateRu(row.startedAt)} · {row.kind === "AUTO" ? "AUTO" : "MANUAL"}
      </span>
    </Link>
  );
}

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
    rentalStartPartOfDay?: RentalPartOfDay | null;
    rentalEndPartOfDay?: RentalPartOfDay | null;
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
    rentalStartPartOfDay?: RentalPartOfDay | null;
    rentalEndPartOfDay?: RentalPartOfDay | null;
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
  projectAttention: Array<{
    projectId: string;
    title: string;
    status: string;
    severity: "warning" | "critical";
    reasons: string[];
    primaryReason: string;
    daysSinceActivity: number;
  }>;
};

type OperationsEvent = {
  id: string;
  kind:
    | "task_due"
    | "task_overdue"
    | "order_ready"
    | "order_start"
    | "order_end"
    | "project_event"
    | "project_signal";
  title: string;
  subtitle?: string;
  date: string;
  urgency: "normal" | "soon" | "today" | "overdue" | "critical";
  href: string;
  isAssignedToMe?: boolean;
};

type OperationsSignal = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  reason: string;
  href: string;
  projectId?: string;
  orderId?: string;
  entityKind: "task" | "project" | "order";
  canSnooze: boolean;
};

type OperationsDashboardData = {
  today: OperationsEvent[];
  upcomingDays: Array<{ date: string; label: string; events: OperationsEvent[] }>;
  signals: OperationsSignal[];
  summary: {
    todayCount: number;
    overdueCount: number;
    signalCount: number;
    nearestOrderTitle: string | null;
  };
};

function operationKindLabel(kind: OperationsEvent["kind"]): string {
  if (kind === "task_overdue") return "Просрочено";
  if (kind === "task_due") return "Задача";
  if (kind === "order_ready") return "Готовность";
  if (kind === "order_start") return "Выдача";
  if (kind === "order_end") return "Возврат";
  if (kind === "project_event") return "Проект";
  return "Сигнал";
}

function operationPillClass(urgency: OperationsEvent["urgency"]) {
  if (urgency === "critical" || urgency === "overdue") return "border-rose-200/80 bg-rose-50/85 text-rose-800 shadow-rose-950/5";
  if (urgency === "today") return "border-violet-200/80 bg-violet-50/85 text-violet-800 shadow-violet-950/5";
  if (urgency === "soon") return "border-amber-200/90 bg-amber-50/85 text-amber-900 shadow-amber-950/5";
  return "border-zinc-200/80 bg-white/75 text-zinc-700 shadow-zinc-950/5";
}

function signalClass(severity: OperationsSignal["severity"]) {
  if (severity === "critical") return "border-rose-200/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.96),rgba(255,255,255,0.82))] text-rose-950 shadow-rose-950/5";
  if (severity === "warning") return "border-amber-200/90 bg-[linear-gradient(135deg,rgba(255,251,235,0.96),rgba(255,255,255,0.82))] text-amber-950 shadow-amber-950/5";
  return "border-sky-200/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(255,255,255,0.82))] text-sky-950 shadow-sky-950/5";
}

function signalEntityLabel(kind: OperationsSignal["entityKind"]) {
  if (kind === "order") return "Заявка";
  if (kind === "project") return "Проект";
  return "Задача";
}

function OperationEventCard({ event, compact = false }: { event: OperationsEvent; compact?: boolean }) {
  const isPersonalTask = event.isAssignedToMe === true && (event.kind === "task_due" || event.kind === "task_overdue");
  return (
    <Link
      href={event.href}
      className={[
        "block rounded-[1.15rem] border px-3.5 py-3 shadow-[0_9px_24px_rgba(15,23,42,0.06)] ring-1 ring-white/55 backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(76,29,149,0.10)]",
        isPersonalTask
          ? "border-amber-300/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.84))] ring-amber-100"
          : event.urgency === "critical" || event.urgency === "overdue"
            ? "border-rose-200/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.94),rgba(255,255,255,0.84))]"
            : "border-white/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.90),rgba(248,247,255,0.72))]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-1.5">
            {isPersonalTask ? (
              <span className="mt-0.5 shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-900">
                Моя
              </span>
            ) : null}
            <div className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-zinc-950">{event.title}</div>
          </div>
          {event.subtitle ? <div className="mt-0.5 truncate text-xs text-zinc-500">{event.subtitle}</div> : null}
        </div>
        <span className={["shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur-md", operationPillClass(event.urgency)].join(" ")}>
          {operationKindLabel(event.kind)}
        </span>
      </div>
      {!compact ? <div className="mt-2 text-xs font-medium text-zinc-500">{fmtDateRu(event.date)}</div> : null}
    </Link>
  );
}

function OperationsDashboardBlock({ isWowstorg }: { isWowstorg: boolean }) {
  const [data, setData] = React.useState<OperationsDashboardData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [snoozingSignalId, setSnoozingSignalId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isWowstorg) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/dashboard/wowstorg/operations", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Не удалось загрузить план");
        return r.json() as Promise<OperationsDashboardData>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isWowstorg]);

  const snoozeSignal = React.useCallback(async (signal: OperationsSignal) => {
    if (!signal.canSnooze) return;
    setSnoozingSignalId(signal.id);
    try {
      const endpoint = signal.orderId
        ? "/api/dashboard/wowstorg/order-attention"
        : signal.projectId
          ? "/api/dashboard/wowstorg/project-attention"
          : null;
      if (!endpoint) return;

      const body = signal.orderId
        ? { orderId: signal.orderId, days: 7 }
        : { projectId: signal.projectId, days: 7 };

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Не удалось отложить сигнал");
      setData((current) =>
        current
          ? {
              ...current,
              signals: current.signals.filter((item) => item.id !== signal.id),
              summary: {
                ...current.summary,
                signalCount: Math.max(0, current.summary.signalCount - 1),
              },
            }
          : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка обновления сигнала");
    } finally {
      setSnoozingSignalId(null);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className={DASH_CARD}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-[1.35rem] border border-violet-200/75 bg-[linear-gradient(135deg,rgba(245,243,255,0.98),rgba(255,255,255,0.72))] px-4 py-3 shadow-[0_12px_28px_rgba(124,58,237,0.08)] ring-1 ring-white/70 backdrop-blur-md">
            <div className="text-xs font-semibold text-violet-700">Сегодня</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-violet-950">{data?.summary.todayCount ?? 0}</div>
          </div>
          <div className="rounded-[1.35rem] border border-rose-200/75 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,255,255,0.72))] px-4 py-3 shadow-[0_12px_28px_rgba(190,18,60,0.07)] ring-1 ring-white/70 backdrop-blur-md">
            <div className="text-xs font-semibold text-rose-700">Просрочено</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-rose-950">{data?.summary.overdueCount ?? 0}</div>
          </div>
          <div className="rounded-[1.35rem] border border-amber-200/85 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.72))] px-4 py-3 shadow-[0_12px_28px_rgba(180,83,9,0.07)] ring-1 ring-white/70 backdrop-blur-md">
            <div className="text-xs font-semibold text-amber-800">Сигналы</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-amber-950">{data?.summary.signalCount ?? 0}</div>
          </div>
          <div className="rounded-[1.35rem] border border-white/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(248,250,252,0.74))] px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)] ring-1 ring-violet-100/55 backdrop-blur-md">
            <div className="text-xs font-semibold text-zinc-600">Ближайшая заявка</div>
            <div className="mt-1 truncate text-sm font-bold text-zinc-950">{data?.summary.nearestOrderTitle ?? "Нет активных"}</div>
          </div>
        </div>
        {loading ? <div className="mt-3 text-sm text-zinc-600">Загрузка...</div> : null}
        {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className={`${DASH_CARD} xl:col-span-7`}>
          <div className="flex items-center justify-between gap-3 border-b border-violet-100/70 pb-3">
            <div className="text-sm font-black tracking-tight text-zinc-950">Сегодня</div>
            <Link href="/tasks" className={LINK_SUBTLE}>Доска</Link>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {!loading && !error && data?.today.length === 0 ? (
              <div className="rounded-[1.2rem] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.80))] px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm md:col-span-2">
                Сегодня спокойно.
              </div>
            ) : null}
            {(data?.today ?? []).slice(0, 6).map((event) => (
              <OperationEventCard key={event.id} event={event} />
            ))}
          </div>
        </div>

        <div className={`${DASH_CARD} xl:col-span-5`}>
          <div className="flex items-center justify-between gap-3 border-b border-violet-100/70 pb-3">
            <div className="text-sm font-black tracking-tight text-zinc-950">Сигналы</div>
            <div className="flex items-center gap-3">
              <Link href="/orders" className={LINK_SUBTLE}>Заявки</Link>
              <Link href="/projects" className={LINK_SUBTLE}>Проекты</Link>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {!loading && !error && data?.signals.length === 0 ? (
              <div className="rounded-[1.2rem] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.80))] px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm">
                Критичных сигналов нет.
              </div>
            ) : null}
            {(data?.signals ?? []).slice(0, 5).map((signal) => (
              <div key={signal.id} className={["rounded-[1.2rem] border px-3.5 py-3 shadow-[0_9px_24px_rgba(15,23,42,0.06)] ring-1 ring-white/60 backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(76,29,149,0.10)]", signalClass(signal.severity)].join(" ")}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={signal.href} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-current/15 bg-white/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        {signalEntityLabel(signal.entityKind)}
                      </span>
                      <div className="truncate text-sm font-bold">{signal.title}</div>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs opacity-80">{signal.reason}</div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {signal.canSnooze && (signal.projectId || signal.orderId) ? (
                      <button
                        type="button"
                        onClick={() => void snoozeSignal(signal)}
                        disabled={snoozingSignalId === signal.id}
                        className="rounded-full border border-current/20 bg-white/70 px-2 py-0.5 text-[10px] font-bold transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
                        title="Отложить на 7 дней"
                      >
                        {snoozingSignalId === signal.id ? "..." : "7д"}
                      </button>
                    ) : null}
                    <span className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-[10px] font-bold">
                      {signal.severity === "critical" ? "важно" : signal.severity === "warning" ? "сигнал" : "инфо"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={DASH_CARD}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-black tracking-tight text-zinc-950">Ближайшие дни</div>
          <Link href="/tasks" className={LINK_SUBTLE}>Все задачи</Link>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          {(data?.upcomingDays ?? []).map((day) => (
            <div key={day.date} className="min-h-[9rem] rounded-[1.35rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,247,255,0.58))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.80)] ring-1 ring-violet-100/45 backdrop-blur-md">
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <div className="text-sm font-bold text-zinc-950">{day.label}</div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                    {day.events.length}
                  </span>
                  <div className="text-[11px] text-zinc-500">{fmtDateRu(day.date)}</div>
                </div>
              </div>
              <div className="max-h-[30rem] space-y-1.5 overflow-y-auto pr-1">
                {day.events.length === 0 ? (
                  <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-xs font-medium text-zinc-500 shadow-sm">Пусто</div>
                ) : (
                  day.events.map((event) => <OperationEventCard key={event.id} event={event} compact />)
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CollapsibleIssuanceCalendar() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={DASH_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Календарь загрузки</div>
          <div className="mt-1 text-xs text-zinc-500">Годовой heatmap выдачи реквизита</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={LINK_SUBTLE}
          aria-expanded={open}
        >
          {open ? "Свернуть" : "Развернуть"}
        </button>
      </div>
      {open ? <IssuanceCalendar className="mt-3 border-violet-100/90 shadow-[0_6px_24px_rgba(124,58,237,0.08)]" /> : null}
    </div>
  );
}

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
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
      <div className={`${DASH_CARD} md:col-span-8`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-2">
          <div className="text-sm font-semibold text-zinc-900">Заявки</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className={BADGE_PRIMARY}>
              Активных: <span>{data?.activeCount ?? 0}</span>
            </span>
            <span className={BADGE_NEUTRAL}>
              Выполненных: <span>{data?.completedCount ?? 0}</span>
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
                <div className={DASH_SUBCARD}>
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
                      <span className="font-semibold">{periodLineHomeDash(data.nearest)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/orders/${data.nearest.id}?from=dashboard`}
                        className={BTN_PRIMARY}
                      >
                        Открыть ближайшую
                      </Link>
                      {data.nearest.status === "ISSUED" &&
                      !data.nearest.parentOrderId &&
                      data.nearest.greenwichUser ? (
                        <Link
                          href={`/catalog?quickParentId=${data.nearest.id}`}
                          className={BTN_WARM}
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
                                До {fmtDateRu(o.readyByDate)} · {periodLineHomeDash(o)}
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
              <div className="mt-2 space-y-3">
                <div className="text-sm text-zinc-600">Пока нет активных заявок.</div>
                <WowstorgIdleText />
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className={`${DASH_CARD} md:col-span-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-2">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-zinc-900">Реквизит</div>
            <InventoryAuditBadge />
          </div>
          {data?.equipment.endedPositions.length ? (
            <Link
              href="/inventory/warehouse-items"
              className={LINK_SUBTLE}
            >
              Открыть склад
            </Link>
          ) : null}
        </div>

        {loading ? <div className="mt-3 text-sm text-zinc-600">Загрузка…</div> : null}
        {!loading && !error && data ? (
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-2 gap-2 items-stretch">
              <div className="flex min-h-[6.1rem] flex-col rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-amber-900">Ремонт</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-amber-900">{data.equipment.inRepairQty}</div>
                <EquipmentCardArrowLink href="/inventory/repair?condition=NEEDS_REPAIR" label="Открыть базу «Требует ремонта»" />
              </div>
              <div className="flex min-h-[6.1rem] flex-col rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-red-900">Сломано</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-red-900">{data.equipment.brokenQty}</div>
                <EquipmentCardArrowLink href="/inventory/repair?condition=BROKEN" label="Открыть базу «Сломано»" />
              </div>
              <div className="flex min-h-[6.1rem] flex-col rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-zinc-800">Потеряно</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-zinc-900">{data.equipment.lostQty}</div>
                <EquipmentCardArrowLink href="/inventory/losses" label="Открыть базу утерянного" />
              </div>
              <div className="flex min-h-[6.1rem] flex-col rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-violet-900">В наличии позиций</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-violet-900">{data.equipment.positionsInStockCount}</div>
                <EquipmentCardArrowLink href="/inventory/positions" label="Открыть позиции каталога" />
              </div>
              <div className="col-span-2 flex min-h-[6.8rem] flex-col rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
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
    </div>
  );
}

export default function HomeDashboardPage() {
  const { state } = useAuth();
  const [hasActiveOrders, setHasActiveOrders] = React.useState<boolean | null>(null);
  const [disableGreenwichStarsOnMobile, setDisableGreenwichStarsOnMobile] = React.useState(false);

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px), (hover: none) and (pointer: coarse)");
    const apply = () => setDisableGreenwichStarsOnMobile(media.matches);
    apply();
    const onChange = () => apply();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  const showBackgroundGame = isGreenwich && hasActiveOrders === false;
  const showGlobalStars = isGreenwich && !disableGreenwichStarsOnMobile;

  return (
    <AppShell title="Главная">
      <div className="relative space-y-6">
        {showGlobalStars ? <RelaxZone /> : null}
        {showBackgroundGame ? <BackgroundStackGame /> : null}
        <div className="relative z-10 space-y-6">
        {isGreenwich ? (
          <div className={DASH_SECTION_SHELL}>
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
          <div className={DASH_SECTION_SHELL}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Дашборд</div>
              </div>
            </div>
            <div className="space-y-3">
              <OperationsDashboardBlock isWowstorg={isWowstorg} />
              <CollapsibleIssuanceCalendar />
              <WowstorgDashboardBlock isWowstorg={isWowstorg} />
            </div>
          </div>
        ) : null}

        <div className="relative z-[35] grid grid-cols-1 gap-3 md:grid-cols-2" data-home-nav-cards>
          <CardLink
            href="/catalog"
            title="Каталог"
            description="Маркет реквизита: карточки, поиск, корзина, оформление."
            variant="highlight"
          />

          {isWowstorg ? (
            <>
              <CardLink
                href="/projects"
                title="Управление проектами"
                description="Активные и архивные проекты, создание карточек, сметы, файлы и заявки."
              />
              <CardLink
                href="/tasks"
                title="Задачи"
                description="Доска команды: исполнители, дедлайны, подзадачи и проектные поручения."
              />
              <CardLink
                href="/warehouse/queue"
                title="Очередь заявок"
                description="Активные и архивные заявки, согласование, сборка, выдача и приёмка."
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

