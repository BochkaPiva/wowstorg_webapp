export type ProjectEstimateLocalLineLike = {
  costClient?: string | number | null;
  qty?: string | number | null;
  unitPriceClient?: string | number | null;
};

export function parseEstimateQtyUp(
  line: Pick<ProjectEstimateLocalLineLike, "qty" | "unitPriceClient">,
): { q: number; up: number } | null {
  const qRaw = typeof line.qty === "number" && Number.isFinite(line.qty) ? String(line.qty) : (line.qty ?? "");
  const upRaw =
    typeof line.unitPriceClient === "number" && Number.isFinite(line.unitPriceClient)
      ? String(line.unitPriceClient)
      : (line.unitPriceClient ?? "");
  const q = Number(String(qRaw).replace(",", "."));
  const up = Number(String(upRaw).replace(",", "."));
  if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(up) || up < 0) return null;
  return { q, up };
}

export function normalizedLocalLineCostClientNumber(line: ProjectEstimateLocalLineLike): number | null {
  const parsed = parseEstimateQtyUp(line);
  if (parsed) return Math.round(parsed.q * parsed.up);
  const current = line.costClient == null || line.costClient === "" ? NaN : Number(line.costClient);
  return Number.isFinite(current) ? Math.round(current) : null;
}

export function normalizedLocalLineCostClientString(line: ProjectEstimateLocalLineLike): string | null {
  const value = normalizedLocalLineCostClientNumber(line);
  return value == null ? null : String(value);
}
