import type { OrderStatus } from "@prisma/client";

export type OrderStageSignal = {
  stage: "approval" | "picking" | "issue" | "return" | "checkin";
  severity: "warning" | "critical";
  title: string;
  reason: string;
  overdue: boolean;
};

type OrderStageInput = {
  status: OrderStatus;
  readyByDate: string;
  startDate: string;
  endDate: string;
  updatedAt: Date;
};

function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00.000Z`);
  const to = Date.parse(`${toYmd}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

function overdueLabel(days: number): string {
  if (days === 1) return "на 1 день";
  return `на ${days} дн.`;
}

export function getOrderStageSignal(
  order: OrderStageInput,
  context: { todayYmd: string; now: Date },
): OrderStageSignal | null {
  const readyDelta = daysBetween(context.todayYmd, order.readyByDate);
  const startDelta = daysBetween(context.todayYmd, order.startDate);
  const endDelta = daysBetween(context.todayYmd, order.endDate);

  if (order.status === "ESTIMATE_SENT" && readyDelta <= 2) {
    return {
      stage: "approval",
      severity: readyDelta <= 0 ? "critical" : "warning",
      title: "Смета ждёт согласования",
      reason: readyDelta <= 0
        ? "Дата готовности уже наступила — свяжитесь с Grinvich и уточните решение."
        : `До готовности ${readyDelta === 1 ? "1 день" : "2 дня"} — проверьте, что Grinvich увидел смету.`,
      overdue: readyDelta <= 0,
    };
  }

  if (order.status === "APPROVED_BY_GREENWICH" && readyDelta <= 0) {
    const overdueDays = Math.abs(Math.min(0, readyDelta));
    return {
      stage: "picking",
      severity: "critical",
      title: "Пора начать сборку",
      reason: readyDelta === 0
        ? "Готовность уже сегодня, но сборка ещё не отмечена."
        : `Готовность просрочена ${overdueLabel(overdueDays)}, но сборка ещё не отмечена.`,
      overdue: true,
    };
  }

  if (order.status === "PICKING" && startDelta <= 0) {
    const overdueDays = Math.abs(Math.min(0, startDelta));
    return {
      stage: "issue",
      severity: "critical",
      title: "Проверьте выдачу",
      reason: startDelta === 0
        ? "Аренда начинается сегодня. Если реквизит передан, отметьте выдачу."
        : `Начало аренды просрочено ${overdueLabel(overdueDays)}. Если реквизит передан, отметьте выдачу.`,
      overdue: true,
    };
  }

  if (order.status === "ISSUED" && endDelta < 0) {
    return {
      stage: "return",
      severity: "critical",
      title: "Ожидается возврат",
      reason: `Период аренды завершился ${overdueLabel(Math.abs(endDelta))} — проверьте возврат с Grinvich.`,
      overdue: true,
    };
  }

  if (order.status === "RETURN_DECLARED") {
    const waitingHours = Math.max(0, Math.floor((context.now.getTime() - order.updatedAt.getTime()) / 3_600_000));
    if (waitingHours >= 4) {
      return {
        stage: "checkin",
        severity: waitingHours >= 12 ? "critical" : "warning",
        title: "Завершите приёмку",
        reason: waitingHours >= 24
          ? `Возврат ждёт складской проверки ${Math.floor(waitingHours / 24)} дн.`
          : `Возврат ждёт складской проверки ${waitingHours} ч.`,
        overdue: waitingHours >= 12,
      };
    }
  }

  return null;
}
