import { describe, expect, it } from "vitest";

import { summarizeProjectEstimateLines } from "@/lib/project-estimate-line-totals";
import {
  evaluateProjectEstimateCustomColumns,
  evaluateProjectEstimateFormula,
  normalizeProjectEstimateCustomCellValue,
  ProjectEstimateCustomColumnsSchema,
  type ProjectEstimateCustomColumn,
  validateProjectEstimateFormula,
} from "@/lib/projects/project-estimate-custom-columns";

const canonicalValues = {
  line_number: 3,
  qty: 4,
  unit_price: 1_250,
  client_total: 5_000,
  internal_total: 3_200,
  margin: 1_800,
};

function column(
  id: string,
  key: string,
  type: ProjectEstimateCustomColumn["type"],
  sortOrder: number,
  formula: string | null = null,
): ProjectEstimateCustomColumn {
  return { id, key, label: key, type, formula, sortOrder, width: 160 };
}

describe("project estimate custom columns", () => {
  it("evaluates arithmetic and the allowed helper functions", () => {
    expect(
      evaluateProjectEstimateFormula(
        "round((client_total - internal_total) / qty, 2) + max(5, abs(-2))",
        canonicalValues,
      ),
    ).toEqual({ value: 455, error: null });
  });

  it("rejects unsafe syntax, unknown functions, and division by zero", () => {
    expect(validateProjectEstimateFormula("globalThis.process.exit()").ok).toBe(false);
    expect(validateProjectEstimateFormula("eval(1)"))
      .toEqual({ ok: false, error: "Функция «eval» не разрешена" });
    expect(evaluateProjectEstimateFormula("qty / 0", canonicalValues))
      .toEqual({ value: null, error: "Деление на ноль" });
  });

  it("validates limits, unique stable keys, and formula-only configuration", () => {
    const duplicate = column("column-1", "c_markup_1", "NUMBER", 0);
    expect(ProjectEstimateCustomColumnsSchema.safeParse([duplicate, { ...duplicate, id: "column-2" }]).success)
      .toBe(false);
    expect(
      ProjectEstimateCustomColumnsSchema.safeParse([
        { ...duplicate, formula: "qty * 2" },
      ]).success,
    ).toBe(false);
    expect(
      ProjectEstimateCustomColumnsSchema.safeParse(
        Array.from({ length: 13 }, (_, index) =>
          column(`column-${index}`, `c_value_${String(index).padStart(6, "0")}`, "TEXT", Math.min(index, 11)),
        ),
      ).success,
    ).toBe(false);
  });

  it("normalizes persisted values by column type", () => {
    expect(normalizeProjectEstimateCustomCellValue("NUMBER", " 12,50 ")).toBe("12.5");
    expect(normalizeProjectEstimateCustomCellValue("NUMBER", "не число")).toBeNull();
    expect(normalizeProjectEstimateCustomCellValue("CHECKBOX", "true")).toBe("true");
    expect(normalizeProjectEstimateCustomCellValue("CHECKBOX", "yes")).toBe("false");
    expect(normalizeProjectEstimateCustomCellValue("DATE", "2026-08-30")).toBe("2026-08-30");
    expect(normalizeProjectEstimateCustomCellValue("DATE", "30.08.2026")).toBeNull();
    expect(normalizeProjectEstimateCustomCellValue("FORMULA", "100")).toBeNull();
  });

  it("resolves formulas that depend on other custom columns", () => {
    const columns = [
      column("markup", "c_markup_1", "NUMBER", 0),
      column("with-markup", "c_with_markup", "FORMULA", 1, "client_total + c_markup_1"),
      column("per-unit", "c_per_unit_1", "FORMULA", 2, "round(c_with_markup / qty, 2)"),
    ];

    expect(
      evaluateProjectEstimateCustomColumns({
        columns,
        rawValues: { markup: "600" },
        canonicalValues,
      }),
    ).toEqual({
      markup: { value: 600, error: null },
      "with-markup": { value: 5_600, error: null },
      "per-unit": { value: 1_400, error: null },
    });
  });

  it("reports circular custom-column dependencies without evaluating them", () => {
    const result = evaluateProjectEstimateCustomColumns({
      columns: [
        column("a", "c_cycle_a", "FORMULA", 0, "c_cycle_b + 1"),
        column("b", "c_cycle_b", "FORMULA", 1, "c_cycle_a + 1"),
      ],
      canonicalValues,
    });

    expect(result.a.error).toBe("Циклическая ссылка в формуле");
    expect(result.b.error).toBe("Циклическая ссылка в формуле");
  });

  it("keeps helper values isolated from canonical project finance", () => {
    const canonicalLines = [
      { costClient: 5_000, costInternal: 3_200, paymentMethod: "CASH" },
      { costClient: 2_500, costInternal: 900, paymentMethod: "CASHLESS" },
    ];
    const linesWithHelpers = canonicalLines.map((line, index) => ({
      ...line,
      customValues: {
        helper: String(9_999_999 * (index + 1)),
        checkbox: "true",
      },
    }));

    expect(summarizeProjectEstimateLines(linesWithHelpers))
      .toEqual(summarizeProjectEstimateLines(canonicalLines));
  });
});
