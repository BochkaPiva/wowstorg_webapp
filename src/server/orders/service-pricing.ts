type OrderServicePricingInput = {
  deliveryEnabled?: boolean;
  deliveryPrice?: unknown;
  montageEnabled?: boolean;
  montagePrice?: unknown;
  demontageEnabled?: boolean;
  demontagePrice?: unknown;
};

/** Цена указана: допускается 0 ₽, не допускаются пустое значение и отрицательные суммы. */
export function isEnabledServicePriceSpecified(price: unknown): boolean {
  if (price == null || price === "") return false;
  const n = Number(price);
  return Number.isFinite(n) && n >= 0;
}

export function listMissingEnabledServicePrices(args: OrderServicePricingInput): string[] {
  const missing: string[] = [];
  if (args.deliveryEnabled && !isEnabledServicePriceSpecified(args.deliveryPrice)) {
    missing.push("Доставка");
  }
  if (args.montageEnabled && !isEnabledServicePriceSpecified(args.montagePrice)) {
    missing.push("Монтаж");
  }
  if (args.demontageEnabled && !isEnabledServicePriceSpecified(args.demontagePrice)) {
    missing.push("Демонтаж");
  }
  return missing;
}

export function assertEnabledServicePricesPresent(args: OrderServicePricingInput): void {
  const missing = listMissingEnabledServicePrices(args);
  if (missing.length > 0) {
    throw new Error(`MISSING_SERVICE_PRICES:${missing.join(",")}`);
  }
}
