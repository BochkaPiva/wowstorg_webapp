import { describe, expect, it } from "vitest";

import { buildProjectWorkspaceDraft } from "@/lib/projects/project-workspace";
import {
  parseProjectWorkspaceTemplateWidgets,
  serializeProjectWorkspaceTemplateWidgets,
} from "@/lib/projects/project-workspace-template";

describe("project workspace templates", () => {
  it("keeps layout only and forces mandatory widgets to stay visible", () => {
    const draft = buildProjectWorkspaceDraft(undefined).map((widget, index) => ({
      ...widget,
      sortOrder: draftOrder(index),
      isVisible: widget.type === "ESTIMATE" ? false : widget.isVisible,
    }));

    const stored = serializeProjectWorkspaceTemplateWidgets(draft);

    expect(stored).toHaveLength(9);
    expect(stored.find((widget) => widget.type === "ESTIMATE")?.isVisible).toBe(true);
    expect(stored.every((widget, index) => widget.sortOrder === index && widget.y === index)).toBe(true);
  });

  it("rejects incomplete or unsupported layouts", () => {
    expect(() => parseProjectWorkspaceTemplateWidgets([])).toThrow();
    const draft = buildProjectWorkspaceDraft(undefined);
    expect(() => parseProjectWorkspaceTemplateWidgets([{ ...draft[0], width: 5 }, ...draft.slice(1)])).toThrow();
  });
});

function draftOrder(index: number) {
  return 8 - index;
}
