import {
  PROJECT_WIDGET_REGISTRY,
  type ProjectWidgetHeightPreset,
  type ProjectWidgetType,
} from "./project-widget-registry";

export const PROJECT_WIDGET_WIDTHS = [4, 6, 8, 12] as const;
export const PROJECT_WIDGET_HEIGHT_PRESETS = ["COMPACT", "MEDIUM", "LARGE", "AUTO"] as const;

export type ProjectWorkspaceWidgetInput = {
  instanceKey: string;
  type: ProjectWidgetType;
  sortOrder: number;
  x: number;
  y: number;
  width: (typeof PROJECT_WIDGET_WIDTHS)[number];
  heightPreset: ProjectWidgetHeightPreset;
  isVisible: boolean;
};

export type StoredProjectWorkspaceWidget = {
  instanceKey: string;
  type: string;
  sortOrder?: number;
  x?: number;
  y?: number;
  width?: number;
  heightPreset?: string;
  isVisible?: boolean;
};

const WIDTH_SET = new Set<number>(PROJECT_WIDGET_WIDTHS);
const HEIGHT_SET = new Set<string>(PROJECT_WIDGET_HEIGHT_PRESETS);

export function buildProjectWorkspaceDraft(
  stored: readonly StoredProjectWorkspaceWidget[] | null | undefined,
): ProjectWorkspaceWidgetInput[] {
  const byType = new Map(stored?.map((widget) => [widget.type, widget]) ?? []);
  const ordered = [...PROJECT_WIDGET_REGISTRY].sort((a, b) => {
    const aOrder = byType.get(a.type)?.sortOrder;
    const bOrder = byType.get(b.type)?.sortOrder;
    if (typeof aOrder === "number" && typeof bOrder === "number") return aOrder - bOrder;
    if (typeof aOrder === "number") return -1;
    if (typeof bOrder === "number") return 1;
    return PROJECT_WIDGET_REGISTRY.indexOf(a) - PROJECT_WIDGET_REGISTRY.indexOf(b);
  });

  return ordered.map((definition, sortOrder) => {
    const saved = byType.get(definition.type);
    const width = saved?.width;
    const heightPreset = saved?.heightPreset;
    return {
      instanceKey: saved?.instanceKey?.trim() || definition.type.toLocaleLowerCase("en-US"),
      type: definition.type,
      sortOrder,
      x: Math.max(0, Number.isFinite(saved?.x) ? Number(saved?.x) : 0),
      y: Math.max(0, Number.isFinite(saved?.y) ? Number(saved?.y) : sortOrder),
      width: WIDTH_SET.has(Number(width)) && definition.allowedWidths.includes(width as ProjectWorkspaceWidgetInput["width"])
        ? (width as ProjectWorkspaceWidgetInput["width"])
        : definition.defaultWidth,
      heightPreset: HEIGHT_SET.has(String(heightPreset)) && definition.allowedHeights.includes(heightPreset as ProjectWidgetHeightPreset)
        ? (heightPreset as ProjectWidgetHeightPreset)
        : definition.defaultHeight,
      isVisible: definition.mandatory ? true : saved?.isVisible === true,
    };
  });
}

export function buildRecommendedProjectWorkspaceDraft(): ProjectWorkspaceWidgetInput[] {
  const composition: Array<{
    type: ProjectWidgetType;
    width: ProjectWorkspaceWidgetInput["width"];
    heightPreset: ProjectWorkspaceWidgetInput["heightPreset"];
  }> = [
    { type: "ESTIMATE", width: 12, heightPreset: "LARGE" },
    { type: "ORDERS", width: 4, heightPreset: "COMPACT" },
    { type: "SCHEDULE", width: 4, heightPreset: "COMPACT" },
    { type: "NOTES", width: 4, heightPreset: "MEDIUM" },
    { type: "TASKS", width: 12, heightPreset: "LARGE" },
    { type: "FREE_BOARD", width: 12, heightPreset: "LARGE" },
    { type: "FILES", width: 4, heightPreset: "COMPACT" },
    { type: "CONTACTS", width: 4, heightPreset: "COMPACT" },
    { type: "HISTORY", width: 4, heightPreset: "COMPACT" },
  ];

  return composition.map((item, sortOrder) => ({
    instanceKey: item.type.toLocaleLowerCase("en-US"),
    type: item.type,
    sortOrder,
    x: 0,
    y: sortOrder,
    width: item.width,
    heightPreset: item.heightPreset,
    isVisible: true,
  }));
}

export function normalizeProjectWorkspaceWidgets(
  widgets: readonly ProjectWorkspaceWidgetInput[],
): ProjectWorkspaceWidgetInput[] {
  const byType = new Map(widgets.map((widget) => [widget.type, widget]));
  const orderedTypes = widgets
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((widget) => widget.type);

  for (const definition of PROJECT_WIDGET_REGISTRY) {
    if (!orderedTypes.includes(definition.type)) orderedTypes.push(definition.type);
  }

  return orderedTypes.map((type, sortOrder) => {
    const definition = PROJECT_WIDGET_REGISTRY.find((item) => item.type === type)!;
    const widget = byType.get(type);
    const width = widget?.width ?? definition.defaultWidth;
    const heightPreset = widget?.heightPreset ?? definition.defaultHeight;
    return {
      instanceKey: widget?.instanceKey?.trim() || type.toLocaleLowerCase("en-US"),
      type,
      sortOrder,
      x: Math.max(0, Number.isFinite(widget?.x) ? Number(widget?.x) : 0),
      y: sortOrder,
      width: WIDTH_SET.has(width) && definition.allowedWidths.includes(width) ? width : definition.defaultWidth,
      heightPreset:
        HEIGHT_SET.has(heightPreset) && definition.allowedHeights.includes(heightPreset)
          ? heightPreset
          : definition.defaultHeight,
      isVisible: definition.mandatory ? true : widget?.isVisible === true,
    };
  });
}
