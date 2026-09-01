import { describe, expect, it } from "vitest";

import {
  buildLegacyProjectWorkspaceDraft,
  parseProjectWorkspaceFeatureFlag,
  resolveProjectWorkspaceView,
} from "@/lib/projects/project-workspace-rollout";

describe("project workspace rollout", () => {
  it("keeps server-side flags disabled until rollout explicitly enables them", () => {
    expect(parseProjectWorkspaceFeatureFlag(undefined)).toBe(false);
    expect(parseProjectWorkspaceFeatureFlag("")).toBe(false);
    expect(parseProjectWorkspaceFeatureFlag("1")).toBe(true);
    expect(parseProjectWorkspaceFeatureFlag("true")).toBe(true);
    expect(parseProjectWorkspaceFeatureFlag("on")).toBe(true);
    expect(parseProjectWorkspaceFeatureFlag("v2")).toBe(true);
    expect(parseProjectWorkspaceFeatureFlag("0")).toBe(false);
    expect(parseProjectWorkspaceFeatureFlag("false")).toBe(false);
    expect(parseProjectWorkspaceFeatureFlag("off")).toBe(false);
    expect(parseProjectWorkspaceFeatureFlag("unexpected")).toBe(false);
  });

  it("lets an explicit URL override select either view for acceptance testing", () => {
    expect(resolveProjectWorkspaceView(null, true)).toBe("v2");
    expect(resolveProjectWorkspaceView(null, false)).toBe("legacy");
    expect(resolveProjectWorkspaceView("legacy", true)).toBe("legacy");
    expect(resolveProjectWorkspaceView("v2", false)).toBe("v2");
  });

  it("keeps the fallback deterministic and exposes every existing module", () => {
    const widgets = buildLegacyProjectWorkspaceDraft();

    expect(widgets).toHaveLength(9);
    expect(widgets.every((widget) => widget.isVisible)).toBe(true);
    expect(widgets.every((widget, index) => widget.sortOrder === index && widget.y === index)).toBe(true);
    expect(widgets.find((widget) => widget.type === "ESTIMATE")?.width).toBe(12);
    expect(widgets.find((widget) => widget.type === "ORDERS")?.width).toBe(12);
  });
});
