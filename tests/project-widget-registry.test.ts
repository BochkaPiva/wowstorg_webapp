import { describe, expect, it } from "vitest";

import {
  buildInitialProjectWidgets,
  normalizeProjectWidgetTypes,
  PROJECT_WIDGET_REGISTRY,
} from "../src/lib/projects/project-widget-registry";
import {
  buildRecommendedProjectWorkspaceDraft,
  buildProjectWorkspaceDraft,
  normalizeProjectWorkspaceWidgets,
} from "../src/lib/projects/project-workspace";

describe("project widget registry", () => {
  it("always keeps mandatory modules and registry order", () => {
    expect(normalizeProjectWidgetTypes(["FILES", "ESTIMATE", "FILES"])).toEqual([
      "ESTIMATE",
      "ORDERS",
      "FILES",
    ]);
  });

  it("packs initial widgets into the 12-column grid", () => {
    const widgets = buildInitialProjectWidgets(["TASKS", "SCHEDULE", "FILES"]);
    expect(widgets.every((widget) => widget.x >= 0 && widget.x + widget.width <= 12)).toBe(true);
    expect(widgets.map((widget) => widget.type)).toEqual(["ESTIMATE", "ORDERS", "TASKS", "SCHEDULE", "FILES"]);
  });

  it("keeps the recommended command-center composition stable", () => {
    const widgets = buildRecommendedProjectWorkspaceDraft();
    expect(widgets.map(({ type, width, heightPreset }) => ({ type, width, heightPreset }))).toEqual([
      { type: "ESTIMATE", width: 12, heightPreset: "LARGE" },
      { type: "ORDERS", width: 4, heightPreset: "COMPACT" },
      { type: "SCHEDULE", width: 4, heightPreset: "COMPACT" },
      { type: "NOTES", width: 4, heightPreset: "MEDIUM" },
      { type: "TASKS", width: 12, heightPreset: "LARGE" },
      { type: "FREE_BOARD", width: 12, heightPreset: "LARGE" },
      { type: "FILES", width: 4, heightPreset: "COMPACT" },
      { type: "CONTACTS", width: 4, heightPreset: "COMPACT" },
      { type: "HISTORY", width: 4, heightPreset: "COMPACT" },
    ]);
  });

  it("has one definition per widget type", () => {
    expect(new Set(PROJECT_WIDGET_REGISTRY.map((item) => item.type)).size).toBe(PROJECT_WIDGET_REGISTRY.length);
    expect(
      PROJECT_WIDGET_REGISTRY.every(
        (item) => item.allowedWidths.includes(item.defaultWidth) && item.allowedHeights.includes(item.defaultHeight),
      ),
    ).toBe(true);
  });

  it("restores the complete settings catalog while keeping optional modules hidden", () => {
    const draft = buildProjectWorkspaceDraft([
      { instanceKey: "orders", type: "ORDERS", sortOrder: 0, isVisible: true },
      { instanceKey: "estimate", type: "ESTIMATE", sortOrder: 1, isVisible: true },
    ]);

    expect(draft).toHaveLength(PROJECT_WIDGET_REGISTRY.length);
    expect(draft.slice(0, 2).map((widget) => widget.type)).toEqual(["ORDERS", "ESTIMATE"]);
    expect(draft.find((widget) => widget.type === "TASKS")?.isVisible).toBe(false);
  });

  it("keeps mandatory modules visible and produces a stable sequential order", () => {
    const normalized = normalizeProjectWorkspaceWidgets([
      {
        instanceKey: "tasks",
        type: "TASKS",
        sortOrder: 8,
        x: 7,
        y: 20,
        width: 6,
        heightPreset: "MEDIUM",
        isVisible: true,
      },
      {
        instanceKey: "estimate",
        type: "ESTIMATE",
        sortOrder: 2,
        x: 0,
        y: 2,
        width: 12,
        heightPreset: "LARGE",
        isVisible: false,
      },
    ]);

    expect(normalized.find((widget) => widget.type === "ESTIMATE")?.isVisible).toBe(true);
    expect(normalized.find((widget) => widget.type === "ORDERS")?.isVisible).toBe(true);
    expect(normalized.map((widget) => widget.sortOrder)).toEqual(normalized.map((_, index) => index));
  });

  it("replaces a size that is globally valid but forbidden for a particular module", () => {
    const normalized = normalizeProjectWorkspaceWidgets([
      {
        instanceKey: "estimate",
        type: "ESTIMATE",
        sortOrder: 0,
        x: 0,
        y: 0,
        width: 4,
        heightPreset: "COMPACT",
        isVisible: true,
      },
    ]);

    const estimate = normalized.find((widget) => widget.type === "ESTIMATE");
    expect(estimate?.width).toBe(12);
    expect(estimate?.heightPreset).toBe("LARGE");
  });
});
