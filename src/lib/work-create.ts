export type WorkCreateKind = "proposal" | "estimate" | "project";

export const WORK_CREATE = {
  proposal: { title: "Составить КП", description: "Фото, программа и цены для клиента. Проект пока не нужен.", submit: "Открыть конструктор", endpoint: "/api/proposals", list: "/proposals", resultKey: "proposal", route: "/proposals" },
  estimate: { title: "Составить смету", description: "Предварительный расчёт. Позже можно превратить его в проект.", submit: "Открыть смету", endpoint: "/api/standalone-estimates", list: "/work", resultKey: "estimate", route: "/estimates" },
  project: { title: "Начать проект", description: "Рабочее пространство команды: сметы, подрядчики, задачи и сроки.", submit: "Открыть проект", endpoint: "/api/projects", list: "/projects", resultKey: "project", route: "/projects" },
} as const;

export function workCreateBody(title: string, customer: string, customers: Array<{ id: string; name: string }>) {
  const matched = customers.find(entry => entry.name.localeCompare(customer.trim(), "ru", { sensitivity: "accent" }) === 0);
  return { title: title.trim(), customerId: matched?.id, customerName: matched ? undefined : customer.trim() || undefined };
}

export function workCreatedHref(kind: WorkCreateKind, data: unknown): string {
  const config = WORK_CREATE[kind];
  const entity = data && typeof data === "object" ? (data as Record<string, unknown>)[config.resultKey] : null;
  const id = entity && typeof entity === "object" ? (entity as Record<string, unknown>).id : null;
  if (typeof id !== "string" || !id.trim()) throw new Error("Объект создан, но ссылка не получена. Откройте список и проверьте его перед повторным созданием.");
  return `${config.route}/${encodeURIComponent(id)}`;
}
