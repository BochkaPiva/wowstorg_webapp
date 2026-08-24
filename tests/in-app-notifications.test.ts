import { describe, expect, it } from "vitest";

import {
  isAfterNotificationCursor,
  mergeNotificationRows,
} from "@/lib/in-app-notifications";

describe("in-app notification cursor", () => {
  it("treats only notifications after the initial cursor as new", () => {
    const cursor = { id: "b", createdAt: "2026-08-24T06:00:00.000Z" };

    expect(isAfterNotificationCursor({ id: "a", createdAt: cursor.createdAt }, cursor)).toBe(false);
    expect(isAfterNotificationCursor({ id: "c", createdAt: cursor.createdAt }, cursor)).toBe(true);
    expect(isAfterNotificationCursor({ id: "a", createdAt: "2026-08-24T06:00:01.000Z" }, cursor)).toBe(true);
  });

  it("merges polling batches without duplicates and keeps newest first", () => {
    const current = [
      { id: "b", createdAt: "2026-08-24T06:00:02.000Z", title: "B" },
      { id: "a", createdAt: "2026-08-24T06:00:01.000Z", title: "A" },
    ];
    const incoming = [
      { id: "c", createdAt: "2026-08-24T06:00:03.000Z", title: "C" },
      { id: "b", createdAt: "2026-08-24T06:00:02.000Z", title: "B updated" },
    ];

    expect(mergeNotificationRows(current, incoming)).toEqual([
      incoming[0],
      incoming[1],
      current[1],
    ]);
  });
});

