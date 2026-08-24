import { describe, expect, it } from "vitest";

import {
  GREENWICH_CONFIRMATION_CHECKPOINTS,
  greenwichConfirmationMessage,
  parseGreenwichConfirmationCallback,
} from "../src/server/reminders/greenwich-confirmation";

describe("Grinvich confirmation checkpoints", () => {
  it("contains the four product checkpoints in chronological order", () => {
    expect(GREENWICH_CONFIRMATION_CHECKPOINTS.map((entry) => entry.daysBefore))
      .toEqual([30, 14, 7, 3]);
  });

  it("parses the two-week callback", () => {
    expect(parseGreenwichConfirmationCallback("gcf:14:ok:order-1")).toEqual({
      checkpoint: "DAYS_14",
      daysBefore: 14,
      action: "ok",
      orderId: "order-1",
    });
  });

  it("uses a natural two-week lead in the Telegram text", () => {
    const message = greenwichConfirmationMessage({
      eventName: "Выставка",
      customerName: "Клиент",
      startDate: new Date("2026-09-08T00:00:00.000Z"),
      endDate: new Date("2026-09-09T00:00:00.000Z"),
      daysBefore: 14,
      orderUrl: "https://example.com/orders/order-1",
    });

    expect(message).toContain("начинается через две недели");
  });
});
