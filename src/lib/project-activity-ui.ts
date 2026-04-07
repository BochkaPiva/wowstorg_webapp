import type { ProjectActivityKind, ProjectBall, ProjectStatus } from "@prisma/client";

import { PROJECT_BALL_LABEL, PROJECT_STATUS_LABEL } from "@/lib/project-ui-labels";

export const PROJECT_ACTIVITY_KIND_LABEL: Record<ProjectActivityKind, string> = {
  PROJECT_CREATED: "Проект создан",
  PROJECT_UPDATED: "Правки карточки",
  PROJECT_ARCHIVED: "Отправлен в архив",
  ORDER_LINKED: "Создана заявка реквизита",
  ORDER_CANCELLED: "Заявка реквизита отменена",
  PROJECT_CONTACT_CREATED: "Добавлен контакт",
  PROJECT_CONTACT_UPDATED: "Изменён контакт",
  PROJECT_FOLDER_CREATED: "Создана папка",
  PROJECT_FOLDER_RENAMED: "Папка переименована",
  PROJECT_FOLDER_DELETED: "Папка удалена",
  PROJECT_FILE_UPLOADED: "Загружен файл",
  PROJECT_FILE_DELETED: "Удалён файл",
  PROJECT_ESTIMATE_VERSION_CREATED: "Новая версия сметы",
};

export const PROJECT_PATCH_FIELD_LABEL: Record<string, string> = {
  title: "Название",
  status: "Статус",
  ball: "Мяч",
  eventStartDate: "Дата начала мероприятия",
  eventEndDate: "Дата окончания мероприятия",
  eventDateNote: "Дата мероприятия (заметка)",
  eventDateConfirmed: "Дата подтверждена",
  openBlockers: "Блокеры",
  internalSummary: "Внутреннее резюме",
};

export const CONTACT_PATCH_FIELD_LABEL: Record<string, string> = {
  fullName: "ФИО",
  phone: "Телефон",
  email: "Email",
  category: "Категория",
  roleNote: "Роль / примечание",
  isActive: "Активен",
};

export const PROJECT_CONTACT_CATEGORY_LABEL: Record<string, string> = {
  DECISION_MAKER: "ЛПР",
  CONTRACTOR: "Подрядчик",
  VENUE: "Площадка",
  OTHER: "Прочее",
};

export function formatActivityValue(field: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (field === "status" && typeof v === "string") {
    return PROJECT_STATUS_LABEL[v as ProjectStatus] ?? String(v);
  }
  if (field === "ball" && typeof v === "string") {
    return PROJECT_BALL_LABEL[v as ProjectBall] ?? String(v);
  }
  if (field === "category" && typeof v === "string") {
    return PROJECT_CONTACT_CATEGORY_LABEL[v] ?? String(v);
  }
  if (typeof v === "boolean") return v ? "да" : "нет";
  const s = String(v);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}
