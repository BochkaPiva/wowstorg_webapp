import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { getOrSetRuntimeCache } from "@/server/runtime-cache";

function parseYearParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

/** UTC date-only YYYY-MM-DD */
function utcYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d: Date, delta: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
}

/**
 * Дни выдачи реквизита по заявкам: для каждого календарного дня в [startDate, endDate]
 * увеличиваем счётчик (пересечения заявок → выше значение).
 * Исключаем только CANCELLED.
 * Только WOWSTORG (главный дашборд).
 */
export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const year =
    parseYearParam(url.searchParams.get("year")) ?? new Date().getUTCFullYear();

  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 0, 0, 0, 0));

  const data = await getOrSetRuntimeCache(`dash:issuance-calendar:${year}`, 60_000, async () => {
    const orders = await prisma.order.findMany({
      where: {
        status: { not: "CANCELLED" },
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
      },
    });

    const counts = new Map<string, number>();

    for (const o of orders) {
      let s = new Date(o.startDate);
      let e = new Date(o.endDate);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
      if (e < s) continue;

      s = new Date(Math.max(s.getTime(), yearStart.getTime()));
      e = new Date(Math.min(e.getTime(), yearEnd.getTime()));
      if (e < s) continue;

      s.setUTCHours(0, 0, 0, 0);
      e.setUTCHours(0, 0, 0, 0);

      for (let d = s; d.getTime() <= e.getTime(); d = addUtcDays(d, 1)) {
        const key = utcYmd(d);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    let maxCount = 0;
    for (const v of counts.values()) {
      if (v > maxCount) maxCount = v;
    }

    const days: Record<string, number> = {};
    for (const [k, v] of counts.entries()) {
      days[k] = v;
    }

    return {
      year,
      days,
      maxCount,
      orderCount: orders.length,
    };
  });
  return jsonOk(data);
}
