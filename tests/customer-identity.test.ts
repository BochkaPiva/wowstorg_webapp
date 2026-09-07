import { describe, expect, it } from "vitest";

import { normalizeCustomerName } from "../src/server/customers/identity";

describe("normalizeCustomerName", () => {
  it.each([
    ["Омск Энерго", "омскэнерго"],
    ["  ОМСК-ЭНЕРГО  ", "омскэнерго"],
    ["Омск_энерго!", "омскэнерго"],
    ["Ёлка", "елка"],
    ["ТГК 11", "тгк11"],
    ["ТГК11", "тгк11"],
  ])("normalizes %s to %s", (source, expected) => {
    expect(normalizeCustomerName(source)).toBe(expected);
  });

  it("keeps meaningful letters and digits from different alphabets", () => {
    expect(normalizeCustomerName(" ACME № 42 ")).toBe("acme42");
  });

  it("returns an empty key for punctuation-only input", () => {
    expect(normalizeCustomerName(" -- / ... ")).toBe("");
  });
});
