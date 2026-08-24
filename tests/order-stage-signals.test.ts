import { describe, expect, it } from "vitest";

import { getOrderStageSignal } from "@/server/dashboard/order-stage-signals";

const context = {
  todayYmd: "2026-08-24",
  now: new Date("2026-08-24T06:00:00.000Z"),
};

const base = {
  readyByDate: "2026-08-24",
  startDate: "2026-08-25",
  endDate: "2026-08-26",
  updatedAt: new Date("2026-08-24T05:00:00.000Z"),
};

describe("order stage signals", () => {
  it("warns when an estimate is still waiting close to readiness", () => {
    expect(getOrderStageSignal({ ...base, status: "ESTIMATE_SENT" }, context)).toMatchObject({
      stage: "approval",
      severity: "critical",
      overdue: true,
    });
  });

  it("marks picking and issue stages as overdue on their due date", () => {
    expect(getOrderStageSignal({ ...base, status: "APPROVED_BY_GREENWICH" }, context)).toMatchObject({ stage: "picking", severity: "critical" });
    expect(getOrderStageSignal({ ...base, status: "PICKING", startDate: "2026-08-24" }, context)).toMatchObject({ stage: "issue", severity: "critical" });
  });

  it("does not flag an issued order before rental end", () => {
    expect(getOrderStageSignal({ ...base, status: "ISSUED" }, context)).toBeNull();
  });

  it("flags a declared return after four hours and escalates after twelve", () => {
    expect(getOrderStageSignal({ ...base, status: "RETURN_DECLARED", updatedAt: new Date("2026-08-24T01:30:00.000Z") }, context)).toMatchObject({ stage: "checkin", severity: "warning" });
    expect(getOrderStageSignal({ ...base, status: "RETURN_DECLARED", updatedAt: new Date("2026-08-23T17:00:00.000Z") }, context)).toMatchObject({ stage: "checkin", severity: "critical" });
  });
});

