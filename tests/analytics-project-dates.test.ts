import { describe, expect, it } from "vitest";
import { projectClosedDate } from "@/server/analytics/project-dates";

const log = (createdAt: string, from = "LEAD", to = "COMPLETED") => ({ kind: "PROJECT_UPDATED", payload: { changes: { status: { from, to } } }, createdAt: new Date(createdAt) });
const completed = { status: "COMPLETED", archivedAt: null, activityLogs: [] };

describe("recorded analytics closing day", () => {
  it("uses the archive timestamp and Omsk calendar day at month/year boundaries", () => {
    expect(projectClosedDate({ ...completed, archivedAt: new Date("2026-08-31T17:59:59.999Z") })).toBe("2026-08-31");
    expect(projectClosedDate({ ...completed, archivedAt: new Date("2026-08-31T18:00:00Z") })).toBe("2026-09-01");
    expect(projectClosedDate({ ...completed, archivedAt: new Date("2026-12-31T18:00:00Z") })).toBe("2027-01-01");
  });
  it("prioritises archiving over an earlier status transition", () => {
    expect(projectClosedDate({ ...completed, archivedAt: new Date("2026-09-10Z"), activityLogs: [log("2026-09-01Z")] })).toBe("2026-09-10");
  });
  it("uses the latest real completion transition regardless of log order", () => {
    expect(projectClosedDate({ ...completed, activityLogs: [log("2026-09-15T18:00:00Z", "IN_PROGRESS"), log("2026-07-01Z"), log("2026-10-01Z", "COMPLETED"), log("2026-09-14Z", "COMPLETED", "IN_PROGRESS")] })).toBe("2026-09-16");
  });
  it("does not infer dates from edits, creation, malformed logs, or other terminal statuses", () => {
    expect(projectClosedDate(completed)).toBeNull();
    expect(projectClosedDate({ ...completed, activityLogs: [null, [], { changes: null }, { changes: { status: null } }, { changes: { title: { to: "COMPLETED" } } }].map(payload => ({ kind: "PROJECT_UPDATED", payload, createdAt: new Date("2026-09-01Z") })) })).toBeNull();
    for (const status of ["IN_PROGRESS", "CANCELLED"]) {
      expect(projectClosedDate({ status, archivedAt: new Date("2026-09-01Z"), activityLogs: [log("2026-09-01Z")] })).toBeNull();
    }
  });
});
