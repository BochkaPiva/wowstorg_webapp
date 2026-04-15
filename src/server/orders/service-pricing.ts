type OrderServicePricingInput = {
  deliveryEnabled?: boolean;
  deliveryPrice?: unknown;
  montageEnabled?: boolean;
  montagePrice?: unknown;
  demontageEnabled?: boolean;
  demontagePrice?: unknown;
};

export function listMissingEnabledServicePrices(args: OrderServicePricingInput): string[] {
  const missing: string[] = [];
  if (args.deliveryEnabled && (args.deliveryPrice == null || Number(args.deliveryPrice) <= 0)) {
    missing.push("Доставка");
  }
  if (args.montageEnabled && (args.montagePrice == null || Number(args.montagePrice) <= 0)) {
    missing.push("Монтаж");
  }
  if (args.demontageEnabled && (args.demontagePrice == null || Number(args.demontagePrice) <= 0)) {
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
