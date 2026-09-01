export const PROJECT_WIDGET_TYPES = [
  "ESTIMATE",
  "ORDERS",
  "TASKS",
  "SCHEDULE",
  "FREE_BOARD",
  "NOTES",
  "FILES",
  "CONTACTS",
  "HISTORY",
] as const;

export type ProjectWidgetType = (typeof PROJECT_WIDGET_TYPES)[number];
export type ProjectWidgetHeightPreset = "COMPACT" | "MEDIUM" | "LARGE" | "AUTO";

export type ProjectWidgetDefinition = {
  type: ProjectWidgetType;
  title: string;
  description: string;
  eyebrow: string;
  icon: "calculator" | "clipboard" | "tasks" | "board" | "calendar" | "files" | "contacts" | "notes" | "history";
  mandatory: boolean;
  allowedWidths: readonly (4 | 6 | 8 | 12)[];
  allowedHeights: readonly ProjectWidgetHeightPreset[];
  defaultWidth: 4 | 6 | 8 | 12;
  defaultHeight: ProjectWidgetHeightPreset;
};

export const PROJECT_WIDGET_REGISTRY: readonly ProjectWidgetDefinition[] = [
  {
    type: "ESTIMATE",
    title: "Смета",
    description: "Строки, версии и финансовый результат проекта.",
    eyebrow: "Финансы",
    icon: "calculator",
    mandatory: true,
    allowedWidths: [12],
    allowedHeights: ["LARGE", "AUTO"],
    defaultWidth: 12,
    defaultHeight: "LARGE",
  },
  {
    type: "ORDERS",
    title: "Заявки",
    description: "Связанные заявки реквизита и их текущие статусы.",
    eyebrow: "Операции",
    icon: "clipboard",
    mandatory: true,
    allowedWidths: [4, 6, 8, 12],
    allowedHeights: ["COMPACT", "MEDIUM", "LARGE", "AUTO"],
    defaultWidth: 4,
    defaultHeight: "COMPACT",
  },
  {
    type: "TASKS",
    title: "Задачи",
    description: "Задачи проекта из YouGile без отдельного поиска по доске.",
    eyebrow: "Работа",
    icon: "tasks",
    mandatory: false,
    allowedWidths: [12],
    allowedHeights: ["LARGE", "AUTO"],
    defaultWidth: 12,
    defaultHeight: "LARGE",
  },
  {
    type: "SCHEDULE",
    title: "Тайминг",
    description: "План дней, контрольных точек и событий проекта.",
    eyebrow: "План",
    icon: "calendar",
    mandatory: false,
    allowedWidths: [4, 6, 8, 12],
    allowedHeights: ["COMPACT", "MEDIUM", "LARGE", "AUTO"],
    defaultWidth: 4,
    defaultHeight: "COMPACT",
  },
  {
    type: "FREE_BOARD",
    title: "Свободная доска",
    description: "Стикеры, заметки и визуальные связи в свободном пространстве.",
    eyebrow: "Пространство",
    icon: "board",
    mandatory: false,
    allowedWidths: [12],
    allowedHeights: ["MEDIUM", "LARGE"],
    defaultWidth: 12,
    defaultHeight: "LARGE",
  },
  {
    type: "NOTES",
    title: "Состояние проекта",
    description: "Текущий контекст, блокеры и то, что требует внимания сейчас.",
    eyebrow: "Сейчас",
    icon: "notes",
    mandatory: false,
    allowedWidths: [4, 6, 8, 12],
    allowedHeights: ["COMPACT", "MEDIUM", "LARGE", "AUTO"],
    defaultWidth: 4,
    defaultHeight: "MEDIUM",
  },
  {
    type: "FILES",
    title: "Файлы",
    description: "Рабочие документы и материалы проекта.",
    eyebrow: "Материалы",
    icon: "files",
    mandatory: false,
    allowedWidths: [4, 6, 8, 12],
    allowedHeights: ["COMPACT", "MEDIUM", "LARGE", "AUTO"],
    defaultWidth: 6,
    defaultHeight: "MEDIUM",
  },
  {
    type: "CONTACTS",
    title: "Контакты",
    description: "Ключевые люди, подрядчики и площадки.",
    eyebrow: "Команда",
    icon: "contacts",
    mandatory: false,
    allowedWidths: [4, 6, 8],
    allowedHeights: ["COMPACT", "MEDIUM", "AUTO"],
    defaultWidth: 4,
    defaultHeight: "COMPACT",
  },
  {
    type: "HISTORY",
    title: "История",
    description: "Ключевые изменения и действия внутри проекта.",
    eyebrow: "Контроль",
    icon: "history",
    mandatory: false,
    allowedWidths: [4, 6, 8, 12],
    allowedHeights: ["COMPACT", "MEDIUM", "LARGE", "AUTO"],
    defaultWidth: 4,
    defaultHeight: "COMPACT",
  },
] as const;

const PROJECT_WIDGET_TYPE_SET = new Set<string>(PROJECT_WIDGET_TYPES);

export function isProjectWidgetType(value: string): value is ProjectWidgetType {
  return PROJECT_WIDGET_TYPE_SET.has(value);
}

export function normalizeProjectWidgetTypes(values?: readonly ProjectWidgetType[]): ProjectWidgetType[] {
  const requested = new Set<ProjectWidgetType>(values ?? []);
  for (const definition of PROJECT_WIDGET_REGISTRY) {
    if (definition.mandatory) requested.add(definition.type);
  }
  return PROJECT_WIDGET_REGISTRY.filter((definition) => requested.has(definition.type)).map(
    (definition) => definition.type,
  );
}

export type InitialProjectWidget = {
  instanceKey: string;
  type: ProjectWidgetType;
  sortOrder: number;
  x: number;
  y: number;
  width: number;
  heightPreset: ProjectWidgetHeightPreset;
};

export function buildInitialProjectWidgets(values?: readonly ProjectWidgetType[]): InitialProjectWidget[] {
  const selected = normalizeProjectWidgetTypes(values);
  let cursorX = 0;
  let cursorY = 0;

  return selected.map((type, sortOrder) => {
    const definition = PROJECT_WIDGET_REGISTRY.find((item) => item.type === type)!;
    if (cursorX + definition.defaultWidth > 12) {
      cursorX = 0;
      cursorY += 1;
    }
    const widget = {
      instanceKey: type.toLocaleLowerCase("en-US"),
      type,
      sortOrder,
      x: cursorX,
      y: cursorY,
      width: definition.defaultWidth,
      heightPreset: definition.defaultHeight,
    };
    cursorX += definition.defaultWidth;
    if (cursorX >= 12) {
      cursorX = 0;
      cursorY += 1;
    }
    return widget;
  });
}
