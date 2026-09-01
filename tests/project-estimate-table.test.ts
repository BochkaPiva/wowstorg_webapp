import { describe, expect, it } from "vitest";

import {
  buildProjectEstimateTablePasteOperations,
  parseProjectEstimateTableClipboard,
} from "@/lib/project-estimate-table";

describe("project estimate compact table", () => {
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
