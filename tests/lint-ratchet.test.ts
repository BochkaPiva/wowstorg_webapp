import { describe, expect, it } from "vitest";
import { countErrors, findRegressions } from "../scripts/quality/lint-ci.mjs";

describe("CI lint debt ratchet", () => {
  it("does not fail for unchanged or reduced existing debt", () => {
    expect(findRegressions({ "a.ts|rule": 1 }, { "a.ts|rule": 2 })).toEqual([]);
  });
  it("fails for new files, rules, or increased counts", () => {
    expect(findRegressions({ "a.ts|rule": 2, "b.ts|rule": 1 }, { "a.ts|rule": 1 })).toHaveLength(2);
  });
  it("never accepts parser failures", () => {
    expect(findRegressions({ "a.ts|fatal": 1 }, { "a.ts|fatal": 1 })).toHaveLength(1);
  });
  it("counts errors per normalized file and rule, not warnings", () => {
    expect(countErrors([{ filePath: "/repo/a.ts", messages: [
      { severity: 2, ruleId: "rule" }, { severity: 2, ruleId: "rule" },
      { severity: 1, ruleId: "warning" },
    ] }], "/repo")).toEqual({ "a.ts|rule": 2 });
  });
});
