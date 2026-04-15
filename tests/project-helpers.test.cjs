const test = require("node:test");
const assert = require("node:assert/strict");

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
  buildProjectDocumentBaseName,
  buildUtf8AttachmentDisposition,
} = require("../src/lib/project-export-filename.ts");
const {
  listMissingEnabledServicePrices,
} = require("../src/server/orders/service-pricing.ts");

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
