import type { ProjectWorkspaceWidgetInput } from "./project-workspace";

export type ProjectWorkspaceView = "legacy" | "v2";

const ENABLED_VALUES = new Set(["1", "true", "on", "v2"]);

export function parseProjectWorkspaceFeatureFlag(
  value: string | null | undefined,
): boolean {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  return normalized ? ENABLED_VALUES.has(normalized) : false;
}

export function resolveProjectWorkspaceView(
  queryValue: string | null | undefined,
  serverEnabled: boolean,
): ProjectWorkspaceView {
  const query = queryValue?.trim().toLocaleLowerCase("en-US");
  if (query === "legacy") return "legacy";
  if (query === "v2") return "v2";

  return serverEnabled ? "v2" : "legacy";
}

const LEGACY_LAYOUT: ReadonlyArray<
  Pick<ProjectWorkspaceWidgetInput, "type" | "width" | "heightPreset">
> = [
  { type: "TASKS", width: 12, heightPreset: "MEDIUM" },
  { type: "NOTES", width: 6, heightPreset: "COMPACT" },
  { type: "CONTACTS", width: 6, heightPreset: "COMPACT" },
  { type: "ORDERS", width: 12, heightPreset: "MEDIUM" },
  { type: "FREE_BOARD", width: 12, heightPreset: "LARGE" },
  { type: "ESTIMATE", width: 12, heightPreset: "LARGE" },
  { type: "SCHEDULE", width: 6, heightPreset: "MEDIUM" },
  { type: "FILES", width: 6, heightPreset: "MEDIUM" },
  { type: "HISTORY", width: 12, heightPreset: "MEDIUM" },
];

export function buildLegacyProjectWorkspaceDraft(): ProjectWorkspaceWidgetInput[] {
  return LEGACY_LAYOUT.map((widget, sortOrder) => ({
    instanceKey: `legacy-${widget.type.toLocaleLowerCase("en-US")}`,
    type: widget.type,
    sortOrder,
    x: 0,
    y: sortOrder,
    width: widget.width,
    heightPreset: widget.heightPreset,
    isVisible: true,
  }));
}
