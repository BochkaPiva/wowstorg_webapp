import { z } from "zod";

import { PROJECT_WIDGET_HEIGHT_PRESETS, normalizeProjectWorkspaceWidgets } from "./project-workspace";
import { PROJECT_WIDGET_TYPES } from "./project-widget-registry";

export const PROJECT_WORKSPACE_TEMPLATE_SCHEMA_VERSION = 1;

export const ProjectWorkspaceTemplateWidgetSchema = z.object({
  instanceKey: z.string().trim().min(1).max(80),
  type: z.enum(PROJECT_WIDGET_TYPES),
  sortOrder: z.number().int().min(0).max(100),
  x: z.number().int().min(0).max(12),
  y: z.number().int().min(0).max(100),
  width: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(12)]),
  heightPreset: z.enum(PROJECT_WIDGET_HEIGHT_PRESETS),
  isVisible: z.boolean(),
}).strict();

export const ProjectWorkspaceTemplateWidgetsSchema = z
  .array(ProjectWorkspaceTemplateWidgetSchema)
  .length(PROJECT_WIDGET_TYPES.length);

export type ProjectWorkspaceTemplateSummary = {
  id: string;
  name: string;
  widgets: ReturnType<typeof parseProjectWorkspaceTemplateWidgets>;
  updatedAt: string;
};

export function serializeProjectWorkspaceTemplateWidgets(value: unknown) {
  const parsed = ProjectWorkspaceTemplateWidgetsSchema.parse(value);
  return normalizeProjectWorkspaceWidgets(parsed);
}

export function parseProjectWorkspaceTemplateWidgets(value: unknown) {
  return serializeProjectWorkspaceTemplateWidgets(value);
}
