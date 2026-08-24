import { describe, expect, it } from "vitest";

import { normalizeAssigneeUserIds } from "@/server/work-task-assignees";

describe("work task assignees", () => {
  it("keeps the selected order and removes duplicates", () => {
    expect(normalizeAssigneeUserIds({
      assigneeUserIds: [" user-b ", "user-a", "user-b", ""],
    })).toEqual(["user-b", "user-a"]);
  });

  it("supports the legacy single assignee field", () => {
    expect(normalizeAssigneeUserIds({ assigneeUserId: "user-a" })).toEqual(["user-a"]);
    expect(normalizeAssigneeUserIds({ assigneeUserId: null })).toEqual([]);
  });

  it("does not mutate assignments when neither field was sent", () => {
    expect(normalizeAssigneeUserIds({})).toBeUndefined();
  });
});
