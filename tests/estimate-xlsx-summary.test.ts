import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildInternalEstimateXlsx } from "@/server/estimate-xlsx";
import { buildProjectEstimateXlsx } from "@/server/projects/estimate-xlsx";

type ExcelJsBuffer = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

async function loadFirstSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJsBuffer);
  return workbook.worksheets[0];
}

function findCell(sheet: ExcelJS.Worksheet, value: string): ExcelJS.Cell | null {
  let found: ExcelJS.Cell | null = null;
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value === value) found = cell;
    });
  });
  return found;
}

describe("internal estimate xlsx summaries", () => {
  it("groups project totals and exposes the client-facing amount", async () => {
    const buffer = await buildProjectEstimateXlsx({
      projectTitle: "Тестовый проект",
      versionNumber: 1,
      variant: "internal",
      sections: [
        {
          id: "local-1",
          sortOrder: 1,
          title: "Организация",
          kind: "LOCAL",
          linkedOrderId: null,
          linkedDraftOrderId: null,
          linkedOrderStatus: null,
          linkedOrderEditable: false,
          lineLocalExtras: null,
          lines: [
            {
              id: "line-1",
              position: 0,
              lineNumber: 1,
              name: "Координация",
              description: "Работа команды",
              lineType: "SERVICE",
              costClient: "10000",
              costInternal: "3000",
              orderLineId: null,
              itemId: null,
              unit: "усл",
              unitPriceClient: 10000,
              qty: 1,
              plannedDays: null,
            },
          ],
        },
      ],
    });
    const sheet = await loadFirstSheet(buffer);

    expect(findCell(sheet, "Итоги проекта")).toBeTruthy();
    expect(findCell(sheet, "Клиент")).toBeTruthy();
    expect(findCell(sheet, "Расходы")).toBeTruthy();
    expect(findCell(sheet, "Результат")).toBeTruthy();

    const clientAmount = findCell(sheet, "Сумма для клиента");
    expect(clientAmount).toBeTruthy();
    expect(clientAmount!.row).toBe(findCell(sheet, "Итого расходов")!.row);
    expect(sheet.getCell(clientAmount!.row, 4).value).toMatchObject({
      formula: expect.any(String),
      result: expect.any(Number),
    });
  });

  it("uses the same compact summary structure for order estimates", async () => {
    const buffer = await buildInternalEstimateXlsx({
      id: "order-1",
      eventName: "Тестовая заявка",
      startDate: new Date("2026-08-10T00:00:00.000Z"),
      endDate: new Date("2026-08-10T00:00:00.000Z"),
      payMultiplier: 1,
      deliveryEnabled: false,
      deliveryPrice: 0,
      deliveryComment: null,
      montageEnabled: false,
      montagePrice: 0,
      montageComment: null,
      demontageEnabled: false,
      demontagePrice: 0,
      demontageComment: null,
      customer: { name: "Заказчик" },
      lines: [
        {
          itemId: "item-1",
          requestedQty: 2,
          pricePerDaySnapshot: 1500,
          item: { name: "Тестовый реквизит" },
        },
      ],
      hiddenExpenses: [],
    });
    const sheet = await loadFirstSheet(buffer);

    expect(findCell(sheet, "Итоги заявки")).toBeTruthy();
    expect(findCell(sheet, "Клиент")).toBeTruthy();
    expect(findCell(sheet, "Расходы")).toBeTruthy();
    expect(findCell(sheet, "Результат")).toBeTruthy();

    const clientAmount = findCell(sheet, "Сумма для клиента");
    expect(clientAmount).toBeTruthy();
    expect(sheet.getCell(clientAmount!.row, 3).value).toMatchObject({
      formula: expect.any(String),
      result: expect.any(Number),
    });
  });
});
