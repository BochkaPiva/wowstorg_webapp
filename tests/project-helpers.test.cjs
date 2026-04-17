const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const Module = require("node:module");
const path = require("node:path");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(__dirname, "../src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs",
    moduleResolution: "node",
  },
});

const {
  calcProjectEstimateTotals,
} = require("../src/lib/project-estimate-totals.ts");
const {
  normalizedLocalLineCostClientNumber,
} = require("../src/lib/project-estimate-local-line.ts");
const {
  calcProjectEstimateRequisiteTotal,
  calcProjectEstimateRequisiteUnitPricePerDay,
} = require("../src/lib/project-estimate-requisite.ts");
const {
  buildProjectDocumentBaseName,
  buildUtf8AttachmentDisposition,
} = require("../src/lib/project-export-filename.ts");
const {
  listMissingEnabledServicePrices,
} = require("../src/server/orders/service-pricing.ts");
const {
  buildProjectEstimateXlsx,
} = require("../src/server/projects/estimate-xlsx.ts");

test("project estimate totals include agency commission in revenue, tax, and margin", () => {
  const totals = calcProjectEstimateTotals({
    clientSubtotal: 7000,
    internalSubtotal: 0,
  });

  assert.equal(totals.commission, 1050);
  assert.equal(totals.revenueTotal, 8050);
  assert.equal(totals.tax, 483);
  assert.equal(totals.grossMargin, 8050);
  assert.equal(totals.marginAfterTax, 7567);
  assert.equal(Math.round(totals.marginAfterTaxPct), 94);
});

test("local line client amount falls back to qty multiplied by unit price", () => {
  assert.equal(
    normalizedLocalLineCostClientNumber({
      costClient: null,
      qty: "2",
      unitPriceClient: "1500",
    }),
    3000,
  );
});

test("requisite unit price is calculated per item per day", () => {
  const total = calcProjectEstimateRequisiteTotal({
    pricePerDay: 2000,
    qty: 1,
    plannedDays: 3,
    payMultiplier: 1,
  });
  assert.equal(total, 6000);
  assert.equal(
    calcProjectEstimateRequisiteUnitPricePerDay({
      totalClient: total,
      qty: 1,
      plannedDays: 3,
    }),
    2000,
  );
});

test("project export base name uses confirmed dates only", () => {
  assert.equal(
    buildProjectDocumentBaseName({
      eventTitle: "Форум",
      customerName: "Заказчик",
      eventDateConfirmed: true,
      eventStartDate: "2026-04-15",
      eventEndDate: "2026-04-16",
    }),
    "Форум 15.04.2026-16.04.2026",
  );

  assert.equal(
    buildProjectDocumentBaseName({
      eventTitle: "",
      customerName: "Заказчик",
      eventDateConfirmed: false,
      eventStartDate: "2026-04-15",
      eventEndDate: "2026-04-16",
    }),
    "Заказчик",
  );
});

test("content disposition includes ascii fallback and utf8 filename", () => {
  const disposition = buildUtf8AttachmentDisposition("Смета Форум 15.04.2026.xlsx");
  assert.match(disposition, /filename=/);
  assert.match(disposition, /filename\*=UTF-8''/);
});

test("missing service prices are reported only for enabled services", () => {
  assert.deepEqual(
    listMissingEnabledServicePrices({
      deliveryEnabled: true,
      deliveryPrice: null,
      montageEnabled: true,
      montagePrice: 1200,
      demontageEnabled: true,
      demontagePrice: 0,
    }),
    ["Доставка", "Демонтаж"],
  );
});

test("xlsx export merges requisite sections and adds days column", async () => {
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
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Смета (клиент)");
  assert.ok(sheet);
  assert.equal(sheet.getRow(4).getCell(6).value, "Дней");
  assert.equal(sheet.getRow(5).getCell(2).value, "Реквизит");
  assert.equal(sheet.getRow(6).getCell(2).value, "Стул");
  assert.equal(sheet.getRow(6).getCell(6).value, 3);
  assert.equal(sheet.getRow(7).getCell(2).value, "Стол");
  assert.equal(sheet.getRow(7).getCell(6).value, 2);
  assert.equal(sheet.getRow(8).getCell(7).value, "Итого по разделу");
});
