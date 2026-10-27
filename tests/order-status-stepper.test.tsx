// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";

describe("order status stepper", () => {
  it("shows a completed mark on the closed stage while preserving its current-step semantics", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<OrderStatusStepper status="CLOSED" hideHelp />);
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.getAttribute("aria-label")).toBe("Закрыта");
    expect(current?.querySelector("svg")).not.toBeNull();
    expect(current?.textContent).toBe("");
  });
  it("keeps an active stage distinct from completed stages", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<OrderStatusStepper status="PICKING" hideHelp />);
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.getAttribute("aria-label")).toBe("Сборка");
    expect(current?.querySelector("svg")).toBeNull();
  });
});
