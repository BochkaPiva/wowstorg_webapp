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

export const PROJECT_BALL_LABEL: Record<ProjectBall, string> = {
  CLIENT: "Клиент",
  WOWSTORG: "Wowstorg",
  VENDOR: "Субподряд",
  VENUE: "Площадка",
  NONE: "—",
};
