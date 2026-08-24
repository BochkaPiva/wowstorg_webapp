import { describe, expect, it } from "vitest";

import {
  estimateApprovalKeyboard,
  parseGreenwichOrderActionCallback,
  returnDeclarationKeyboard,
  serviceRatingKeyboard,
} from "@/server/telegram-order-actions";

describe("Grinvich Telegram order actions", () => {
  it("round-trips an estimate approval callback", () => {
    const keyboard = estimateApprovalKeyboard({
      orderId: "order-123",
      orderUrl: "https://example.com/orders/order-123",
    });
    const callback = keyboard.inline_keyboard[0][0].callback_data;

    expect(callback).toBeTruthy();
    expect(parseGreenwichOrderActionCallback(callback!)).toEqual({
      action: "approve-estimate",
      orderId: "order-123",
    });
  });

  it("parses the safe return action", () => {
    const keyboard = returnDeclarationKeyboard({
      orderId: "order-123",
      orderUrl: "https://example.com/orders/order-123",
    });
    expect(parseGreenwichOrderActionCallback(keyboard.inline_keyboard[0][0].callback_data!)).toEqual({
      action: "declare-return-ok",
      orderId: "order-123",
    });
    expect(keyboard.inline_keyboard[1][0].callback_data).toBeUndefined();
  });

  it("parses every service rating and keeps callbacks within Telegram limits", () => {
    const keyboard = serviceRatingKeyboard({
      orderId: "cm12345678901234567890123",
      orderUrl: "https://example.com/orders?feedback=cm12345678901234567890123",
    });
    for (let rating = 1; rating <= 5; rating += 1) {
      const callback = keyboard.inline_keyboard[0][rating - 1].callback_data!;
      expect(callback.length).toBeLessThanOrEqual(64);
      expect(parseGreenwichOrderActionCallback(callback)).toEqual({
        action: "rate-service",
        orderId: "cm12345678901234567890123",
        rating,
      });
    }
  });

  it("rejects malformed or unrelated callbacks", () => {
    expect(parseGreenwichOrderActionCallback("gcf:ok:123:DAYS_3")).toBeNull();
    expect(parseGreenwichOrderActionCallback("goa:approve:")).toBeNull();
    expect(parseGreenwichOrderActionCallback("goa:delete:order-123")).toBeNull();
    expect(parseGreenwichOrderActionCallback("goa:rate:order-123:6")).toBeNull();
  });
});
