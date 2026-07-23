import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseFinancialWorkbook } from "@/server/analytics/reconciliation";

describe("financial reconciliation workbook parser", () => {
  it("reads localized currency, percentages, bonuses, and source links", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "№",
        "Проект",
        "Сумма по смете",
        "Наши расходы",
        "Заработок",
        "Рентабельность",
        "Бонусы",
        "Бонусы Александр",
        "Бонусы Михаил",
        "Смета Ваусторг",
      ],
      [
        1,
        "Тестовый проект",
        "р.10,600.00",
        "2 670,00 ₽",
        "7 930,00",
        "74,81%",
        "1 189,50",
        "594,75",
        "594,75",
        "Открыть",
      ],
    ]);
    sheet.J2.l = { Target: "https://example.test/projects/project-1" };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Июль 2026");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    const result = parseFinancialWorkbook(bytes);

    expect(result.sheetName).toBe("Июль 2026");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      projectName: "Тестовый проект",
      revenue: 10_600,
      expenses: 2_670,
      profit: 7_930,
      marginPercent: 74.81,
      bonusPool: 1_189.5,
      bonusFirst: 594.75,
      bonusSecond: 594.75,
      sourceLink: "https://example.test/projects/project-1",
    });
    expect(result.totals).toMatchObject({
      revenue: 10_600,
      expenses: 2_670,
      profit: 7_930,
      bonusPool: 1_189.5,
    });
  });

  it("keeps explicit zero bonuses instead of replacing them with the default formula", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Проект", "Сумма по смете", "Наши расходы", "Заработок", "Бонусы"],
      ["Без бонуса", 10_000, 2_000, 8_000, 0],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Период");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    const result = parseFinancialWorkbook(bytes);

    expect(result.rows[0].bonusPool).toBe(0);
    expect(result.rows[0].bonusFirst).toBe(0);
    expect(result.rows[0].bonusSecond).toBe(0);
  });
});
