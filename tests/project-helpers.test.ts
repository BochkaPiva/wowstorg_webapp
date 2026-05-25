import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { normalizedLocalLineCostClientNumber } from "@/lib/project-estimate-local-line";
import {
  calcProjectEstimateRequisiteTotal,
  calcProjectEstimateRequisiteUnitPricePerDay,
} from "@/lib/project-estimate-requisite";
import {
  buildProjectDocumentBaseName,
  buildUtf8AttachmentDisposition,
} from "@/lib/project-export-filename";
import { calcProjectEstimateTotals } from "@/lib/project-estimate-totals";
import { listMissingEnabledServicePrices } from "@/server/orders/service-pricing";
import { buildProjectEstimateXlsx } from "@/server/projects/estimate-xlsx";

describe("project helpers", () => {
  it("includes agency commission in revenue, tax, and margin", () => {
    const totals = calcProjectEstimateTotals({
      clientSubtotal: 7000,
      internalSubtotal: 0,
    });

    expect(totals.commission).toBe(1050);
    expect(totals.revenueTotal).toBe(8050);
    expect(totals.tax).toBe(483);
    expect(totals.grossMargin).toBe(8050);
    expect(totals.marginAfterTax).toBe(7567);
    expect(Math.round(totals.marginAfterTaxPct)).toBe(94);
  });

  it("falls back to qty multiplied by unit price for local line client amount", () => {
    expect(
      normalizedLocalLineCostClientNumber({
        costClient: null,
        qty: "2",
        unitPriceClient: "1500",
      }),
    ).toBe(3000);
  });

  it("calculates requisite unit price per item per day", () => {
    const total = calcProjectEstimateRequisiteTotal({
      pricePerDay: 2000,
      qty: 1,
      plannedDays: 3,
      payMultiplier: 1,
    });

    expect(total).toBe(6000);
    expect(
      calcProjectEstimateRequisiteUnitPricePerDay({
        totalClient: total,
        qty: 1,
        plannedDays: 3,
      }),
    ).toBe(2000);
  });

  it("uses confirmed dates only for project export base names", () => {
    expect(
      buildProjectDocumentBaseName({
        eventTitle: "Форум",
        customerName: "Заказчик",
        eventDateConfirmed: true,
        eventStartDate: "2026-04-15",
        eventEndDate: "2026-04-16",
      }),
    ).toBe("Форум 15.04.2026-16.04.2026");

    expect(
      buildProjectDocumentBaseName({
        eventTitle: "",
        customerName: "Заказчик",
        eventDateConfirmed: false,
        eventStartDate: "2026-04-15",
        eventEndDate: "2026-04-16",
      }),
    ).toBe("Заказчик");
  });

  it("adds ascii fallback and utf8 filename to content disposition", () => {
    const disposition = buildUtf8AttachmentDisposition("Смета Форум 15.04.2026.xlsx");

    expect(disposition).toMatch(/filename=/);
    expect(disposition).toMatch(/filename\*=UTF-8''/);
  });

  it("reports missing service prices only for enabled services", () => {
    expect(
      listMissingEnabledServicePrices({
        deliveryEnabled: true,
        deliveryPrice: null,
        montageEnabled: true,
        montagePrice: 1200,
        demontageEnabled: true,
        demontagePrice: 0,
      }),
    ).toEqual(["Доставка"]);
  });

  it("accepts zero as a valid enabled service price", () => {
    expect(
      listMissingEnabledServicePrices({
        deliveryEnabled: true,
        deliveryPrice: 0,
        montageEnabled: false,
        demontageEnabled: false,
      }),
    ).toEqual([]);
  });

  it("treats a negative enabled service price as missing", () => {
    expect(
      listMissingEnabledServicePrices({
        deliveryEnabled: true,
        deliveryPrice: -1,
      }),
    ).toEqual(["Доставка"]);
  });

  it("merges requisite sections and adds days column in xlsx export", async () => {
    const buffer = await buildProjectEstimateXlsx({
      projectTitle: "Тест",
      versionNumber: 1,
      variant: "client",
      sections: [
        {
          id: "req-1",
          sortOrder: 3,
          title: "Заявка №1 · weird",
          kind: "REQUISITE",
          linkedOrderId: "o1",
          linkedDraftOrderId: null,
          linkedOrderStatus: "APPROVED_BY_GREENWICH",
          linkedOrderEditable: false,
          lineLocalExtras: null,
          lines: [
            {
              id: "l1",
              position: 0,
              lineNumber: 1,
              name: "Стул",
              description: null,
              lineType: "RENTAL",
              costClient: "6000",
              costInternal: "0",
              orderLineId: "ol1",
              itemId: "i1",
              unit: "шт",
              unitPriceClient: 2000,
              qty: 1,
              plannedDays: 3,
            },
          ],
        },
        {
          id: "req-2",
          sortOrder: 4,
          title: "Заявка №2 · weird",
          kind: "REQUISITE",
          linkedOrderId: "o2",
          linkedDraftOrderId: null,
          linkedOrderStatus: "APPROVED_BY_GREENWICH",
          linkedOrderEditable: false,
          lineLocalExtras: null,
          lines: [
            {
              id: "l2",
              position: 0,
              lineNumber: 1,
              name: "Стол",
              description: null,
              lineType: "RENTAL",
              costClient: "8000",
              costInternal: "0",
              orderLineId: "ol2",
              itemId: "i2",
              unit: "шт",
              unitPriceClient: 4000,
              qty: 1,
              plannedDays: 2,
            },
          ],
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    type ExcelJsBuffer = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];
    await workbook.xlsx.load(buffer as unknown as ExcelJsBuffer);
    const sheet = workbook.getWorksheet("Смета для клиента");

    expect(sheet).toBeTruthy();

    let daysColumn = 0;
    sheet!.eachRow((row) => {
      row.eachCell((cell, colNumber) => {
        if (cell.value === "Дней") daysColumn = colNumber;
      });
    });
    expect(daysColumn).toBeGreaterThan(0);

    const findRowByName = (name: string): ExcelJS.Row | undefined => {
      let found: ExcelJS.Row | undefined;
      sheet!.eachRow((row) => {
        if (row.getCell(2).value === name) found = row;
      });
      return found;
    };

    expect(findRowByName("Реквизит")).toBeTruthy();
    expect(findRowByName("Стул")?.getCell(daysColumn).value).toBe(3);
    expect(findRowByName("Стол")?.getCell(daysColumn).value).toBe(2);

    expect(findRowByName("Стул")?.getCell(8).value).toMatchObject({
      formula: expect.stringMatching(/E\d+\*IF\(F\d+="",1,F\d+\)\*G\d+/),
    });
    expect(findRowByName("Стул")?.getCell(1).value).toMatchObject({
      formula: expect.stringMatching(/COUNTA\(\$B\$/),
    });

    let hasSectionTotal = false;
    sheet!.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value === "Итого по разделу") hasSectionTotal = true;
      });
    });
    expect(hasSectionTotal).toBe(true);
  });
});
