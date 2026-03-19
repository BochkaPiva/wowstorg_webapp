"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";
import type { OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";

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
  const [expanded, setExpanded] = React.useState(false);
  const [riding, setRiding] = React.useState(false);

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

  const s = score ?? 100;
  const pct = Math.max(0, Math.min(100, s));
  const phrase = dinoPhrase(s);

  function rideDino() {
    setRiding(true);
    window.setTimeout(() => setRiding(false), 1600);
  }

  return (
    <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Дашборд Greenwich</div>
          <div className="mt-1 text-xs text-zinc-600">
            Рейтинг зависит от дедлайнов возврата и состояния реквизита при приёмке
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50 transition"
          aria-expanded={expanded}
          title="Показать кратко, как начисляется рейтинг"
        >
          {expanded ? "Скрыть" : "Как считается"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-white p-3">
            <style jsx global>{`
              @keyframes dinoRide {
                0% {
                  transform: translateX(0px) translateY(0px) rotate(-8deg);
                }
                35% {
                  transform: translateX(70px) translateY(-6px) rotate(8deg);
                }
                70% {
                  transform: translateX(130px) translateY(-1px) rotate(-6deg);
                }
                100% {
                  transform: translateX(160px) translateY(0px) rotate(-8deg);
                }
              }
            `}</style>

            <div className="absolute left-3 top-3 right-3 h-10 rounded-xl bg-[linear-gradient(135deg,rgba(124,58,237,0.16),rgba(250,204,21,0.10))]" />
            <button
              type="button"
              onClick={rideDino}
              className="relative z-10 mx-auto block h-14 w-14 md:h-16 md:w-16"
              title="Нажми, чтобы динозаврик покатался"
            >
              <div
                className="relative h-full w-full transition-transform"
                style={{ willChange: "transform" }}
              >
                <div style={riding ? ({ animation: "dinoRide 1.6s ease-in-out 1" } as React.CSSProperties) : undefined}>
                  <div className="relative h-full w-full">
                    <Image src="/dino.png" alt="" fill className="object-contain" sizes="64px" />
                  </div>
                </div>
              </div>
            </button>

            <div className="mt-2 text-center text-xs text-zinc-600">
              Подсказка: динозаврик ускоряет, когда всё в порядке
            </div>
          </div>
        </div>

        <div className="md:col-span-7">
          <div className="rounded-2xl border border-violet-100 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-xs font-semibold text-violet-900/70">Текущий рейтинг</div>
              <div className="rounded-full bg-violet-50 border border-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                0–100
              </div>
            </div>
            <div className="mt-2 text-4xl font-extrabold tabular-nums text-violet-800 drop-shadow-sm">
              {s}
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-800">{phrase}</div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-violet-50 border border-violet-100">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-violet-700 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-2 text-xs text-zinc-600 flex items-center justify-between">
              <span>0</span>
              <span className="font-semibold text-violet-800">100</span>
            </div>
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-sm font-semibold text-zinc-900">Кратко</div>
          <div className="mt-2 text-sm text-zinc-700 space-y-1">
            <div>• Дедлайны возврата: <span className="font-semibold text-red-700">−7/день</span> после <span className="font-semibold">endDate + 1</span></div>
            <div>• Состояние реквизита (кроме CONSUMABLE): <span className="font-semibold text-red-700">−1</span> (сломано) и <span className="font-semibold text-red-700">−3</span> (потеряно)</div>
          </div>
        </div>
      ) : null}
    </div>
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
                <div className="mt-3">
                  <Link
                    href={`/orders/${data.nearest.id}?from=dashboard`}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100 inline-flex items-center"
                  >
                    Открыть ближайшую
                  </Link>
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
    customerName: string;
    greenwichUser: null | { displayName: string; ratingScore: number };
    readyByDate: string;
    startDate: string;
    endDate: string;
    totalAmount: number;
  };
  equipment: {
    brokenQty: number;
    lostQty: number;
    inRepairQty: number;
    positionsInStockCount: number;
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
    <div className="space-y-3">
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
                      {data.nearest.greenwichUser ? ` · ${data.nearest.greenwichUser.displayName} · рейтинг ${data.nearest.greenwichUser.ratingScore}` : ""}
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
                  <div className="mt-3">
                    <Link
                      href={`/orders/${data.nearest.id}?from=dashboard`}
                      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100 inline-flex items-center"
                    >
                      Открыть ближайшую
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-600 mt-2">Пока нет активных заявок.</div>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">Реквизит</div>
          <Link
            href="/inventory/warehouse-items"
            className="text-sm font-medium text-violet-800 hover:text-violet-900"
          >
            Открыть склад
          </Link>
        </div>

        {loading ? <div className="mt-3 text-sm text-zinc-600">Загрузка…</div> : null}
        {!loading && !error && data ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                Ремонт: <span className="font-semibold">{data.equipment.inRepairQty}</span>
              </span>
              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-900">
                Сломано: <span className="font-semibold">{data.equipment.brokenQty}</span>
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-800">
                Потеряно: <span className="font-semibold">{data.equipment.lostQty}</span>
              </span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-900">
                В наличии позиций: <span className="font-semibold">{data.equipment.positionsInStockCount}</span>
              </span>
            </div>

            {data.equipment.endedPositions.length > 0 ? (
              <div className="mt-1">
                <div className="text-xs font-semibold text-red-800 mb-2">Закончившиеся позиции</div>
                <div className="space-y-2">
                  {data.equipment.endedPositions.slice(0, 8).map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 flex items-center justify-between gap-2"
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
                {data.equipment.endedPositions.length > 8 ? (
                  <div className="text-xs text-zinc-600 mt-2">
                    Ещё {data.equipment.endedPositions.length - 8}…
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function HomeDashboardPage() {
  const { state } = useAuth();

  const isWowstorg =
    state.status === "authenticated" && state.user.role === "WOWSTORG";
  const isGreenwich =
    state.status === "authenticated" && state.user.role === "GREENWICH";

  return (
    <AppShell title="Главная">
      <div className="space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.10),rgba(250,204,21,0.10))] p-4">
          <div className="text-sm font-semibold text-zinc-900">
            Быстрые разделы
          </div>
          <div className="mt-1 text-sm text-zinc-600">
            Здесь позже добавим дашборды: активные заявки, ближайшие даты, топ
            позиций.
          </div>
        </div>

        {isGreenwich ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-8">
              <GreenwichDashboardBlock isGreenwich={isGreenwich} />
            </div>
            <div className="md:col-span-4">
              <GreenwichRatingCard />
            </div>
          </div>
        ) : null}

        {isWowstorg ? <WowstorgDashboardBlock isWowstorg={isWowstorg} /> : null}

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
    </AppShell>
  );
}

