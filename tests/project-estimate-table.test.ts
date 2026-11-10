import { describe, expect, it } from "vitest";

import {
  buildProjectEstimateTablePasteOperations,
  parseProjectEstimateTableClipboard,
  validateEstimateImport,
  inferEstimateImportMapping,
} from "@/lib/project-estimate-table";

describe("project estimate compact table", () => {
  it("recognizes real column headings and skips numbering and calculated totals", () => {
    expect(inferEstimateImportMapping([["№", "Наименование", "Кол-во", "Цена / ед.", "Сумма"]])).toEqual({header:true,mapping:[-1,0,3,4,-1]});
    expect(inferEstimateImportMapping([["DJ", "Ведение", "шт", "1", "5000"]])).toEqual({header:false,mapping:[0,1,2,3,4]});
  });
  it("rejects import mappings and cells that would fail autosave without discarding them", () => {
    expect(validateEstimateImport([["DJ", "25 000,50 ₽"]], [0, 4], 1)).toBeNull();
    expect(validateEstimateImport([["DJ", "Цена"]], [0, 4], 1)).toContain("числовых");
    expect(validateEstimateImport([["DJ", "DJ"]], [0, 0], 1)).toContain("один раз");
    expect(validateEstimateImport([["", "42"]], [0, 4], 1)).toContain("название");
    expect(validateEstimateImport([["DJ"]], [0], 0)).toContain("ещё 0");
    expect(validateEstimateImport([["A".repeat(501)]], [0], 1)).toContain("Слишком длинное");
  });
  it("keeps quoted Excel multiline cells and escaped quotes in one row", () => {
    expect(parseProjectEstimateTableClipboard('Звук\t"Две строки\nи ""кавычки"""\tшт\n')).toEqual([["Звук", 'Две строки\nи "кавычки"', "шт"]]);
  });
  it("normalizes Excel currency and grouping spaces only for numeric columns", () => {
    expect(buildProjectEstimateTablePasteOperations({text: '2\t25\u00a0000,50 ₽\t1 000', startColumn: "qty"})[0]?.patch).toEqual({qty:"2",unitPriceClient:"25000.50",costInternal:"1000"});
  });
  it("parses spreadsheet rows without treating decimal commas as delimiters", () => {
    expect(parseProjectEstimateTableClipboard("Монтаж\t2\t1 500,50\r\nДоставка\t1\t5000\r\n")).toEqual([
      ["Монтаж", "2", "1 500,50"],
      ["Доставка", "1", "5000"],
    ]);
  });

  it("maps a pasted range from the selected column and ignores overflow columns", () => {
    expect(
      buildProjectEstimateTablePasteOperations({
        text: "2\t1500\t900\n3\t2500\t1200",
        startColumn: "qty",
      }),
    ).toEqual([
      {
        rowOffset: 0,
        patch: { qty: "2", unitPriceClient: "1500", costInternal: "900" },
      },
      {
        rowOffset: 1,
        patch: { qty: "3", unitPriceClient: "2500", costInternal: "1200" },
      },
    ]);
  });

  it("keeps empty spreadsheet cells as explicit clears", () => {
    expect(
      buildProjectEstimateTablePasteOperations({
        text: "Новая позиция\t\tшт",
        startColumn: "name",
      }),
    ).toEqual([
      {
        rowOffset: 0,
        patch: { name: "Новая позиция", description: null, unit: "шт" },
      },
    ]);
  });

  it("keeps a 70-row project estimate paste ordered and complete", () => {
    const text = Array.from({ length: 70 }, (_, index) =>
      [`Позиция ${index + 1}`, "шт", String(index + 1), String((index + 1) * 100)].join("\t"),
    ).join("\n");

    const operations = buildProjectEstimateTablePasteOperations({
      text,
      startColumn: "name",
    });

    expect(operations).toHaveLength(70);
    expect(operations[0]).toEqual({
      rowOffset: 0,
      patch: { name: "Позиция 1", description: "шт", unit: "1", qty: "100" },
    });
    expect(operations[69]).toEqual({
      rowOffset: 69,
      patch: { name: "Позиция 70", description: "шт", unit: "70", qty: "7000" },
    });
  });
});
