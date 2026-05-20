import { describe, expect, it } from "vitest";

import { usableStockUnits } from "@/lib/inventory-stock";
import {
  assertEnabledServicePricesPresent,
  isEnabledServicePriceSpecified,
  listMissingEnabledServicePrices,
} from "@/server/orders/service-pricing";

describe("stock and enabled services", () => {
  it("never exposes negative usable stock", () => {
    expect(usableStockUnits({ total: 10, inRepair: 2, broken: 1, missing: 3 })).toBe(4);
    expect(usableStockUnits({ total: 1, inRepair: 2, broken: 3, missing: 4 })).toBe(0);
  });

  it("allows zero-priced enabled services but rejects blank or negative prices", () => {
    expect(isEnabledServicePriceSpecified(0)).toBe(true);
    expect(isEnabledServicePriceSpecified("0")).toBe(true);
    expect(isEnabledServicePriceSpecified("")).toBe(false);
    expect(isEnabledServicePriceSpecified(-1)).toBe(false);
  });

  it("reports missing prices only for enabled services", () => {
    expect(
      listMissingEnabledServicePrices({
        deliveryEnabled: true,
        deliveryPrice: "",
        montageEnabled: false,
        montagePrice: "",
        demontageEnabled: true,
        demontagePrice: -10,
      }),
    ).toEqual(["Доставка", "Демонтаж"]);

    expect(() =>
      assertEnabledServicePricesPresent({
        deliveryEnabled: true,
        deliveryPrice: "",
      }),
    ).toThrow("MISSING_SERVICE_PRICES:Доставка");
  });
});
