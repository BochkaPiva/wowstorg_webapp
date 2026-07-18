"use client";

import { Stepper, type Step } from "@/components/modern-ui/stepper";

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

type OrderSource = "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
type TurnOwner = "WAREHOUSE" | "GREENWICH" | "NONE";

const STATUS_LABEL: Record<OrderStatus, string> = {
  SUBMITTED: "Новая",
  ESTIMATE_SENT: "Смета",
  CHANGES_REQUESTED: "Правки",
  APPROVED_BY_GREENWICH: "Согласована",
  PICKING: "Сборка",
  ISSUED: "Выдана",
  RETURN_DECLARED: "Приёмка",
  CLOSED: "Закрыта",
  CANCELLED: "Отменена",
};

export const orderStatusLabelRu: Record<OrderStatus, string> = STATUS_LABEL;

const STATUS_DETAIL: Record<OrderStatus, string> = {
  SUBMITTED: "Заявка ожидает обработки складом.",
  ESTIMATE_SENT: "Смета отправлена, ожидается решение Greenwich.",
  CHANGES_REQUESTED: "Greenwich запросил изменения в заявке.",
  APPROVED_BY_GREENWICH: "Смета согласована, можно начинать сборку.",
  PICKING: "Склад комплектует заявку к выдаче.",
  ISSUED: "Реквизит выдан и находится у клиента.",
  RETURN_DECLARED: "Возврат заявлен, требуется приёмка.",
  CLOSED: "Заявка принята и полностью закрыта.",
  CANCELLED: "Заявка отменена и перенесена в архив.",
};

const FLOW: OrderStatus[] = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
  "CLOSED",
];

const STEPS: Step[] = FLOW.map((status, index) => ({
  id: index + 1,
  title: STATUS_LABEL[status],
  subtitle: STATUS_DETAIL[status],
}));

function turnOwner(status: OrderStatus, source?: OrderSource): TurnOwner {
  if (status === "CLOSED" || status === "CANCELLED") return "NONE";
  if (source === "WOWSTORG_EXTERNAL") return "WAREHOUSE";
  if (status === "ESTIMATE_SENT" || status === "ISSUED") return "GREENWICH";
  return "WAREHOUSE";
}

export function OrderStatusStepper({
  status,
  source,
  compactWindow = 7,
  className,
}: {
  status: OrderStatus;
  source?: OrderSource;
  compactWindow?: number;
  className?: string;
}) {
  const owner = turnOwner(status, source);
  const activeStep = status === "CANCELLED" ? 1 : FLOW.indexOf(status) + 1;
  const tone = owner === "GREENWICH" ? "amber" : owner === "WAREHOUSE" ? "violet" : "slate";

  return (
    <div className={["order-progress", className ?? ""].join(" ")} data-status={status}>
      <div className="order-progress__summary">
        <div className="order-progress__current">
          <span className="order-progress__dot" aria-hidden="true" />
          <div>
            <strong>{STATUS_LABEL[status]}</strong>
            {owner !== "NONE" ? (
              <span>Сейчас действует: {owner === "WAREHOUSE" ? "Wowstorg" : "Greenwich"}</span>
            ) : null}
          </div>
        </div>

        <details className="order-progress__help">
          <summary aria-label="Что означает статус">?</summary>
          <div>{STATUS_DETAIL[status]}</div>
        </details>
      </div>

      {status !== "CANCELLED" ? (
        <Stepper
          steps={STEPS}
          activeStep={activeStep}
          tone={tone}
          windowSize={compactWindow}
          className="order-progress__stepper"
        />
      ) : null}
    </div>
  );
}
