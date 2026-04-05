"use client";

export type OrderStatus =
  | "SUBMITTED"
  | "ESTIMATE_SENT"
  | "CHANGES_REQUESTED"
  | "APPROVED_BY_GREENWICH"
  | "PICKING"
  | "ISSUED"
  | "RETURN_DECLARED"
  | "CLOSED"
  | "CANCELLED";

type TurnOwner = "WAREHOUSE" | "GRINVICH" | "NONE";
type OrderSource = "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";

import { Stepper } from "@/components/modern-ui/stepper";

const STATUS_LABEL: Record<OrderStatus, string> = {
  SUBMITTED: "Новая",
  ESTIMATE_SENT: "Смета",
  CHANGES_REQUESTED: "Правки",
  APPROVED_BY_GREENWICH: "Согласовано",
  PICKING: "Сборка",
  ISSUED: "Выдано",
  RETURN_DECLARED: "Приёмка",
  CLOSED: "Закрыто",
  CANCELLED: "Отменено",
};

/** Подписи статуса заявки для списков вне степпера (проекты, отчёты). */
export const orderStatusLabelRu: Record<OrderStatus, string> = STATUS_LABEL;

const STATUS_DETAIL: Record<OrderStatus, string> = {
  SUBMITTED: "Заявка создана, ожидает ответа склада",
  ESTIMATE_SENT: "Смета отправлена, ожидаем решение Grinvich",
  CHANGES_REQUESTED: "Правки запрошены, склад внесёт изменения",
  APPROVED_BY_GREENWICH: "Согласовано, склад готовит к выдаче",
  PICKING: "Идёт сборка заказа",
  ISSUED: "Оборудование выдано клиенту",
  RETURN_DECLARED: "Ожидается возврат и приёмка",
  CLOSED: "Заявка выполнена и закрыта",
  CANCELLED: "Отменено",
};

const STEPS: OrderStatus[] = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
  "CLOSED",
];

function turnOwner(status: OrderStatus, source?: OrderSource): TurnOwner {
  if (source === "WOWSTORG_EXTERNAL") {
    switch (status) {
      case "SUBMITTED":
      case "ESTIMATE_SENT":
      case "CHANGES_REQUESTED":
      case "APPROVED_BY_GREENWICH":
      case "PICKING":
      case "ISSUED":
      case "RETURN_DECLARED":
        return "WAREHOUSE";
      case "CLOSED":
      case "CANCELLED":
      default:
        return "NONE";
    }
  }
  switch (status) {
    case "SUBMITTED":
      return "WAREHOUSE";
    case "ESTIMATE_SENT":
      return "GRINVICH";
    case "CHANGES_REQUESTED":
      return "WAREHOUSE";
    case "APPROVED_BY_GREENWICH":
      return "WAREHOUSE";
    case "PICKING":
      return "WAREHOUSE";
    case "ISSUED":
      return "GRINVICH";
    case "RETURN_DECLARED":
      return "WAREHOUSE";
    case "CLOSED":
    case "CANCELLED":
      return "NONE";
    default:
      return "NONE";
  }
}

function ownerUi(owner: TurnOwner): { label: string; textClass: string; dotClass: string } {
  if (owner === "GRINVICH") {
    return {
      label: "Ход Grinvich",
      textClass: "text-amber-700",
      dotClass: "bg-amber-500",
    };
  }
  if (owner === "WAREHOUSE") {
    return {
      label: "Ход WowStorg",
      textClass: "text-violet-700",
      dotClass: "bg-violet-600",
    };
  }
  return {
    label: "",
    textClass: "",
    dotClass: "",
  };
}

export function OrderStatusStepper({
  status,
  source,
  compactWindow = 5,
  className,
}: {
  status: OrderStatus;
  source?: OrderSource;
  compactWindow?: number;
  className?: string;
}) {
  if (status === "CANCELLED") {
    return (
      <div className={["flex items-center justify-between gap-3", className ?? ""].join(" ")}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-[#5b0b17]/40 bg-[#5b0b17]/10 flex items-center justify-center shrink-0" aria-hidden>
            <span className="text-[#5b0b17] text-sm font-semibold">—</span>
          </div>
          <div>
            <div className="text-sm font-bold text-[#5b0b17]">Отменено</div>
            <div className="text-[11px] text-[#5b0b17]/80">Заявка отменена</div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "CLOSED") {
    return (
      <div className={["flex items-center justify-between gap-3", className ?? ""].join(" ")}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-violet-600/40 bg-violet-600/10 flex items-center justify-center shrink-0" aria-hidden>
            <svg viewBox="0 0 16 16" className="h-4 w-4 text-violet-700" fill="currentColor" aria-hidden="true">
              <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-violet-800">Закрыто</div>
            <div className="text-[11px] text-violet-700/80">Заявка выполнена и закрыта</div>
          </div>
        </div>
      </div>
    );
  }

  const owner = turnOwner(status, source);
  const ownerUiData = ownerUi(owner);
  const tone: "amber" | "violet" | "slate" =
    owner === "GRINVICH" ? "amber" : owner === "WAREHOUSE" ? "violet" : "slate";
  const stepIndex = STEPS.indexOf(status);
  const activeStep = Math.max(1, stepIndex + 1);

  return (
    <div className={["flex flex-col gap-2", className ?? ""].join(" ")}>
      {/* Десктоп: полный степпер */}
      <div className="hidden md:flex flex-col gap-1.5 min-w-0">
        <div className="min-w-0">
          <Stepper
            steps={STEPS.map((s, i) => ({ id: i + 1, title: STATUS_LABEL[s], subtitle: undefined }))}
            activeStep={activeStep}
            tone={tone}
            windowSize={compactWindow}
          />
        </div>
        {owner !== "NONE" ? (
          <div className={["flex items-center justify-end gap-1.5 text-xs font-medium leading-none pr-1", ownerUiData.textClass].join(" ")}>
            <span className={["h-1.5 w-1.5 rounded-full", ownerUiData.dotClass].join(" ")} aria-hidden="true" />
            <span>{ownerUiData.label}</span>
          </div>
        ) : null}
      </div>

      {/* Телефон: компактный вид — только статус и пояснение */}
      <div className="md:hidden flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-zinc-900">{STATUS_LABEL[status]}</span>
          {owner !== "NONE" ? (
            <span className={["inline-flex items-center gap-1.5 text-xs font-medium", ownerUiData.textClass].join(" ")}>
              <span className={["h-1.5 w-1.5 rounded-full shrink-0", ownerUiData.dotClass].join(" ")} aria-hidden="true" />
              {ownerUiData.label}
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-snug text-violet-600/90">{STATUS_DETAIL[status]}</p>
      </div>

      {/* Описание статуса на десктопе (скрыто на телефоне — там оно в блоке выше) */}
      <p className="hidden md:block text-xs leading-snug text-violet-600/90 max-w-xl">
        {STATUS_DETAIL[status]}
      </p>
    </div>
  );
}

