import type { ProjectBall, ProjectStatus } from "@prisma/client";

/** Статусы, при которых проект можно убрать в архив (завершён или отменён). */
export const PROJECT_TERMINAL_STATUSES = ["COMPLETED", "CANCELLED"] as const satisfies readonly ProjectStatus[];

export function isProjectTerminalStatus(status: ProjectStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  LEAD: "Лид / первичный запрос",
  BRIEFING: "Сбор брифа / уточнение задачи",
  INTERNAL_PREP: "Внутренняя подготовка",
  PROPOSAL_SENT: "КП / смета отправлена",
  PROPOSAL_REVISION: "Правки КП / переговоры",
  CONTRACT_PREP: "Подготовка договора",
  CONTRACT_SENT: "Договор направлен клиенту",
  CONTRACT_SIGNED: "Договор подписан",
  PREPRODUCTION: "Предпродакшн",
  AWAITING_CLIENT_INPUT: "Ждём данные от клиента",
  AWAITING_VENDOR: "Ждём субподряд / площадку",
  READY_TO_RUN: "Готово к проведению",
  LIVE: "Проведение / монтаж / день Х",
  WRAP_UP: "Закрытие",
  COMPLETED: "Завершён",
  ON_HOLD: "Пауза",
  CANCELLED: "Отменён",
};

export type ProjectStatusGroupId = "preparation" | "execution" | "completion";

export const PROJECT_STATUS_GROUP_LABEL: Record<ProjectStatusGroupId, string> = {
  preparation: "Подготовка",
  execution: "Проведение",
  completion: "Завершение",
};

/** Короткие подписи для шапки и группового переключателя. */
export const PROJECT_STATUS_PICKER_LABEL: Record<ProjectStatus, string> = {
  LEAD: "Новый",
  BRIEFING: "В работе",
  INTERNAL_PREP: "В работе",
  PROPOSAL_SENT: "На согласовании",
  PROPOSAL_REVISION: "На согласовании",
  CONTRACT_PREP: "На согласовании",
  CONTRACT_SENT: "На согласовании",
  CONTRACT_SIGNED: "На согласовании",
  AWAITING_CLIENT_INPUT: "На согласовании",
  AWAITING_VENDOR: "На согласовании",
  ON_HOLD: "Пауза",
  PREPRODUCTION: "Подготовка к монтажу",
  READY_TO_RUN: "Монтаж",
  LIVE: "Проведение / день X",
  WRAP_UP: "Демонтаж",
  COMPLETED: "Закрыт",
  CANCELLED: "Отменён",
};

export const PROJECT_STATUS_GROUPS: Array<{
  id: ProjectStatusGroupId;
  items: ProjectStatus[];
}> = [
  {
    id: "preparation",
    items: [
      "LEAD",
      "BRIEFING",
      "INTERNAL_PREP",
      "PROPOSAL_SENT",
      "PROPOSAL_REVISION",
      "CONTRACT_PREP",
      "CONTRACT_SENT",
      "CONTRACT_SIGNED",
      "AWAITING_CLIENT_INPUT",
      "AWAITING_VENDOR",
      "ON_HOLD",
    ],
  },
  {
    id: "execution",
    items: ["PREPRODUCTION", "READY_TO_RUN", "LIVE"],
  },
  {
    id: "completion",
    items: ["WRAP_UP", "COMPLETED", "CANCELLED"],
  },
];

export function projectStatusPickerLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_PICKER_LABEL[status] ?? PROJECT_STATUS_LABEL[status];
}

export function projectStatusDisplayLabel(status: ProjectStatus): string {
  const short = PROJECT_STATUS_PICKER_LABEL[status];
  const full = PROJECT_STATUS_LABEL[status];
  if (!short || short === full) return full;
  return `${short} · ${full}`;
}

export const PROJECT_BALL_LABEL: Record<ProjectBall, string> = {
  CLIENT: "Клиент",
  WOWSTORG: "Wowstorg",
  VENDOR: "Субподряд",
  VENUE: "Площадка",
  NONE: "—",
};
