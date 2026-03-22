"use client";

import React from "react";

type CalendarPayload = {
  year: number;
  days: Record<string, number>;
  maxCount: number;
  orderCount: number;
};

/** Короткие подписи без точки — помещаются в узкую колонку недели */
const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

/**
 * Для каждой колонки-недели: подпись, если в этой неделе начинается месяц (1-е число).
 * Совпадает с разметкой buildWeekColumns (вс → сб, отступ до 1 янв).
 */
function monthLabelsByWeekColumn(year: number, columnCount: number): string[] {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const leading = jan1.getUTCDay();
  const t0 = Date.UTC(year, 0, 1);
  const labels = Array.from({ length: columnCount }, () => "");

  for (let m = 0; m < 12; m++) {
    const first = new Date(Date.UTC(year, m, 1));
    const dayIndex = Math.floor((first.getTime() - t0) / 86400000);
    const pos = leading + dayIndex;
    const col = Math.floor(pos / 7);
    if (col >= 0 && col < columnCount) {
      labels[col] = MONTHS_SHORT[m] ?? "";
    }
  }
  return labels;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Колонки = недели, внутри столбца дни с вс → сб (как на GitHub). */
function buildWeekColumns(
  year: number,
  days: Record<string, number>,
): Array<Array<null | { key: string; count: number }>> {
  const n = isLeapYear(year) ? 366 : 365;
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const leading = jan1.getUTCDay();
  const flat: Array<null | { key: string; count: number }> = [];
  for (let i = 0; i < leading; i++) flat.push(null);
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(year, 0, 1 + i));
    const key = dt.toISOString().slice(0, 10);
    flat.push({ key, count: days[key] ?? 0 });
  }
  while (flat.length % 7 !== 0) flat.push(null);

  const cols: Array<Array<null | { key: string; count: number }>> = [];
  for (let i = 0; i < flat.length; i += 7) {
    cols.push(flat.slice(i, i + 7));
  }
  return cols;
}

function intensityLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 1;
  const step = Math.ceil((count / max) * 4);
  return Math.min(4, Math.max(1, step));
}

const LEVEL_CLASS: Record<number, string> = {
  0: "bg-zinc-100 dark:bg-zinc-800/50",
  1: "bg-violet-200 dark:bg-violet-900/50",
  2: "bg-violet-400 dark:bg-violet-700/70",
  3: "bg-violet-600 dark:bg-violet-600",
  4: "bg-violet-800 dark:bg-violet-500",
};

function fmtDayRu(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Календарь загрузки (выдача по дням) для дашборда Wowstorg на главной. */
export function IssuanceCalendar({ className = "" }: { className?: string }) {
  const [year, setYear] = React.useState(() => new Date().getUTCFullYear());
  const [data, setData] = React.useState<CalendarPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/dashboard/issuance-calendar?year=${year}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Не удалось загрузить календарь");
        return r.json() as Promise<CalendarPayload>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const columns = React.useMemo(() => {
    if (!data) return [];
    return buildWeekColumns(data.year, data.days);
  }, [data]);

  const monthLabels = React.useMemo(() => {
    if (!data || columns.length === 0) return [];
    return monthLabelsByWeekColumn(data.year, columns.length);
  }, [data, columns]);

  const maxCount = data?.maxCount ?? 0;

  const gapCell = "gap-px sm:gap-0.5";
  const labelCol = "w-9 shrink-0 sm:w-10";

  return (
    <div
      className={[
        "w-full rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur-sm sm:p-4",
        className,
      ].join(" ")}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-900">Выдача реквизита по дням</div>
          <div className="mt-1 text-xs text-zinc-600">
            Каждый квадрат — день периода заявки (дата начала…конца). Ярче — больше одновременных заявок.
            {data != null ? (
              <span className="ml-1">
                Учтено заявок в году: <span className="font-semibold text-zinc-800">{data.orderCount}</span>.
              </span>
            ) : null}
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-zinc-600">
          Год
          <select
            value={year}
            onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-900"
          >
            {Array.from({ length: 6 }, (_, i) => new Date().getUTCFullYear() - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-600">Загрузка…</div> : null}
      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      {!loading && !error && data ? (
        <div className="mt-4 w-full">
          <p className="mb-2 text-xs text-zinc-500 sm:hidden">
            На узком экране график шире области — листайте вправо, чтобы смотреть весь год.
          </p>
          <div
            className={[
              "w-full overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]",
              "overscroll-x-contain",
            ].join(" ")}
          >
            <div className="w-full max-sm:min-w-[640px]">
              <div className={`flex w-full flex-col ${gapCell}`}>
                <div className="flex flex-row items-end gap-2 sm:gap-3">
                  <div className={`${labelCol} shrink-0`} aria-hidden />
                  <div className={`flex min-w-0 flex-1 flex-row ${gapCell} overflow-visible`}>
                    {columns.map((_, ci) => {
                      const label = monthLabels[ci] ?? "";
                      return (
                        <div
                          key={`m-${ci}`}
                          className="flex min-h-[1.125rem] min-w-0 flex-1 flex-col justify-end overflow-visible"
                        >
                          {label ? (
                            <span className="block whitespace-nowrap pl-px text-left text-[10px] leading-none font-medium text-zinc-600 sm:text-[11px]">
                              {label}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-row items-stretch gap-2 sm:gap-3">
                  <div
                    className={`flex ${labelCol} flex-col justify-between py-0.5 text-[9px] leading-none text-zinc-400 sm:text-[10px] sm:leading-tight`}
                  >
                    <span>Вс</span>
                    <span>Пн</span>
                    <span>Вт</span>
                    <span>Ср</span>
                    <span>Чт</span>
                    <span>Пт</span>
                    <span>Сб</span>
                  </div>
                  <div className={`flex min-w-0 flex-1 flex-row ${gapCell}`}>
                    {columns.map((col, ci) => (
                      <div key={ci} className={`flex min-w-0 flex-1 flex-col ${gapCell}`}>
                        {col.map((cell, ri) => {
                          if (!cell) {
                            return (
                              <div
                                key={`e-${ci}-${ri}`}
                                className="aspect-square w-full min-h-0"
                                aria-hidden
                              />
                            );
                          }
                          const lvl = intensityLevel(cell.count, maxCount);
                          const title = `${fmtDayRu(cell.key)} — заявок: ${cell.count}`;
                          return (
                            <div
                              key={cell.key}
                              title={title}
                              className={[
                                "aspect-square w-full min-h-0 min-w-0 rounded-[2px] border border-zinc-200/70 sm:rounded-sm",
                                LEVEL_CLASS[lvl],
                              ].join(" ")}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs text-zinc-500">
            <span>Меньше</span>
            <div className={`flex ${gapCell}`}>
              {[0, 1, 2, 3, 4].map((lvl) => (
                <div
                  key={lvl}
                  className={[
                    "h-3 w-3 rounded-[2px] border border-zinc-200/80 sm:h-3.5 sm:w-3.5",
                    LEVEL_CLASS[lvl],
                  ].join(" ")}
                />
              ))}
            </div>
            <span>Больше</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
