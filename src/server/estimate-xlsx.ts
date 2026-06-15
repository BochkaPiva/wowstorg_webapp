import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import { roundMoney } from "@/lib/money";
import {
  calcWarehouseProfitEstimate,
  ORDER_SERVICE_PAYMENT_METHOD_LABELS,
  type OrderServicePaymentMethod,
} from "@/lib/order-service-internal-costs";
import { calcOrderPricing } from "@/server/orders/order-pricing";
import {
  addFormulaRefFormula,
  applyLineFormulas,
  cashInternalTaxFormula,
  percentOfFormula,
  setXlsxFormula,
  setXlsxMoneyFormat,
  sumColumnFormula,
  sumRangesFormula,
  type XlsxDataRowRange,
  type XlsxLineColumns,
  xlsxCellRef,
  XLSX_MONEY_NUMFMT,
} from "@/server/xlsx-estimate-formulas";

type OrderForEstimate = {
  id: string;
  eventName: string | null;
  startDate: Date;
  endDate: Date;
  rentalStartPartOfDay?: "MORNING" | "EVENING";
  rentalEndPartOfDay?: "MORNING" | "EVENING";
  payMultiplier: unknown;
  deliveryEnabled: boolean;
  deliveryPrice: unknown;
  deliveryComment: string | null;
  deliveryInternalCost?: unknown;
  deliveryInternalPaymentMethod?: OrderServicePaymentMethod | string | null;
  montageEnabled: boolean;
  montagePrice: unknown;
  montageComment: string | null;
  montageInternalCost?: unknown;
  montageInternalPaymentMethod?: OrderServicePaymentMethod | string | null;
  demontageEnabled: boolean;
  demontagePrice: unknown;
  demontageComment: string | null;
  demontageInternalCost?: unknown;
  demontageInternalPaymentMethod?: OrderServicePaymentMethod | string | null;
  rentalDiscountType?: string | null;
  rentalDiscountPercent?: unknown;
  rentalDiscountAmount?: unknown;
  customer: { name: string };
  lines: Array<{
    itemId?: string;
    requestedQty: number;
    pricePerDaySnapshot: unknown;
    item?: { name: string };
  }>;
  hiddenExpenses?: Array<{
    title: string;
    comment: string | null;
    cost: unknown;
    internalPaymentMethod: OrderServicePaymentMethod | string | null;
  }>;
};

const COLS = 8;
const LINE_COLS: XlsxLineColumns = {
  number: 1,
  name: 2,
  qty: 5,
  days: 6,
  unitPrice: 7,
  lineTotal: 8,
};

const INTERNAL_COLS = 10;
const INTERNAL_LINE_COLS: XlsxLineColumns = {
  number: 1,
  name: 3,
  qty: 5,
  days: 6,
  unitPrice: 7,
  lineTotal: 8,
  internal: 9,
  payment: 10,
};

const COLORS = {
  ink: "FF111827",
  muted: "FF6B7280",
  violet: "FF7C3AED",
  violetDark: "FF4C1D95",
  violetSoft: "FFF4F0FF",
  yellow: "FFFFE500",
  slateSoft: "FFF8FAFC",
  white: "FFFFFFFF",
  border: "FFE5E7EB",
  borderStrong: "FFC4B5FD",
};

const FONT = "Aptos";
const LOGO_PATH = path.join(process.cwd(), "public", "brand", "wowstorg-estimate-logo.png");

function border(color = COLORS.border): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  };
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    fill?: string;
    fontColor?: string;
    bold?: boolean;
    size?: number;
    horizontal?: "left" | "center" | "right";
    borderColor?: string;
  } = {},
) {
  cell.border = border(opts.borderColor);
  cell.font = {
    name: FONT,
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    color: { argb: opts.fontColor ?? COLORS.ink },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: opts.horizontal ?? "left",
    wrapText: true,
  };
  if (opts.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
  }
}

function styleRange(
  ws: ExcelJS.Worksheet,
  rowFrom: number,
  rowTo: number,
  colFrom: number,
  colTo: number,
  opts: Parameters<typeof styleCell>[1] = {},
) {
  for (let row = rowFrom; row <= rowTo; row += 1) {
    for (let col = colFrom; col <= colTo; col += 1) {
      styleCell(ws.getCell(row, col), opts);
    }
  }
}

function formatDate(value: Date): string {
  const raw = value.toISOString().slice(0, 10);
  const [year, month, day] = raw.split("-");
  return `${day}.${month}.${year}`;
}

function formatPeriod(order: OrderForEstimate): string {
  const start = formatDate(order.startDate);
  const end = formatDate(order.endDate);
  return start === end ? start : `${start} — ${end}`;
}

function formatPercentValue(value: number): string {
  return `${roundMoney(value).toLocaleString("ru-RU")}%`;
}

function paymentMethodLabel(value: OrderServicePaymentMethod | string | null | undefined): string {
  return value === "CASH" ? ORDER_SERVICE_PAYMENT_METHOD_LABELS.CASH : ORDER_SERVICE_PAYMENT_METHOD_LABELS.NON_CASH;
}

function num(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function addLogo(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook) {
  try {
    const buffer = await fs.readFile(LOGO_PATH);
    const imageId = wb.addImage({ base64: buffer.toString("base64"), extension: "png" });
    ws.addImage(imageId, {
      tl: { col: 0.35, row: 0.35 },
      ext: { width: 180, height: 119 },
    });
  } catch {
    // The estimate should still be generated if the brand asset is missing.
  }
}

function addHeader(ws: ExcelJS.Worksheet, order: OrderForEstimate) {
  for (let row = 1; row <= 7; row += 1) {
    ws.getRow(row).height = row <= 5 ? 23 : 10;
  }

  ws.mergeCells(1, 1, 5, 3);
  ws.mergeCells(1, 4, 1, COLS);
  ws.mergeCells(2, 4, 2, COLS);
  ws.mergeCells(3, 4, 3, COLS);
  ws.mergeCells(4, 4, 4, COLS);
  ws.mergeCells(5, 4, 5, COLS);
  styleRange(ws, 1, 5, 1, COLS, { fill: COLORS.white, borderColor: COLORS.white });

  ws.getCell(1, 4).value = "Смета расходов";
  styleCell(ws.getCell(1, 4), { bold: true, size: 22, fontColor: COLORS.violetDark, borderColor: COLORS.white });

  ws.getCell(2, 4).value = order.eventName?.trim() || order.customer.name;
  styleCell(ws.getCell(2, 4), { bold: true, size: 15, borderColor: COLORS.white });

  const metaRows = [
    `Заказчик: ${order.customer.name}`,
    `Даты мероприятия: ${formatPeriod(order)}`,
    "",
  ];
  for (let index = 0; index < metaRows.length; index += 1) {
    const cell = ws.getCell(3 + index, 4);
    cell.value = metaRows[index];
    styleCell(cell, { size: 10, fontColor: COLORS.muted, borderColor: COLORS.white });
  }

  styleRange(ws, 6, 6, 1, COLS, { fill: COLORS.violet, borderColor: COLORS.violet });
  ws.getRow(6).height = 5;
}

function addInternalHeader(ws: ExcelJS.Worksheet, order: OrderForEstimate) {
  for (let row = 1; row <= 7; row += 1) {
    ws.getRow(row).height = row <= 5 ? 23 : 10;
  }

  ws.mergeCells(1, 1, 5, 3);
  ws.mergeCells(1, 4, 1, INTERNAL_COLS);
  ws.mergeCells(2, 4, 2, INTERNAL_COLS);
  ws.mergeCells(3, 4, 3, INTERNAL_COLS);
  ws.mergeCells(4, 4, 4, INTERNAL_COLS);
  ws.mergeCells(5, 4, 5, INTERNAL_COLS);
  styleRange(ws, 1, 5, 1, INTERNAL_COLS, { fill: COLORS.white, borderColor: COLORS.white });

  ws.getCell(1, 4).value = "Внутренняя смета заявки";
  styleCell(ws.getCell(1, 4), { bold: true, size: 22, fontColor: COLORS.violetDark, borderColor: COLORS.white });

  ws.getCell(2, 4).value = order.eventName?.trim() || order.customer.name;
  styleCell(ws.getCell(2, 4), { bold: true, size: 15, borderColor: COLORS.white });

  const metaRows = [
    `Заказчик: ${order.customer.name}`,
    `Даты мероприятия: ${formatPeriod(order)}`,
    `ID заявки: ${order.id}`,
  ];
  for (let index = 0; index < metaRows.length; index += 1) {
    const cell = ws.getCell(3 + index, 4);
    cell.value = metaRows[index];
    styleCell(cell, { size: 10, fontColor: COLORS.muted, borderColor: COLORS.white });
  }

  styleRange(ws, 6, 6, 1, INTERNAL_COLS, { fill: COLORS.violet, borderColor: COLORS.violet });
  ws.getRow(6).height = 5;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number) {
  ws.getRow(rowNumber).height = 28;
  for (let col = 1; col <= COLS; col += 1) {
    styleCell(ws.getCell(rowNumber, col), {
      fill: COLORS.violetDark,
      fontColor: COLORS.white,
      bold: true,
      horizontal: col === 1 || col >= 4 ? "center" : "left",
      borderColor: COLORS.violetDark,
    });
  }
}

function styleDataRow(ws: ExcelJS.Worksheet, row: number, rowIndex: number) {
  ws.getRow(row).height = 40;
  for (let col = 1; col <= COLS; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: rowIndex % 2 === 0 ? COLORS.slateSoft : COLORS.white,
      horizontal: col === 1 || col >= 4 ? "center" : "left",
    });
  }
  ws.getCell(row, 2).font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.ink } };
  setXlsxMoneyFormat(ws, row, [LINE_COLS.unitPrice, LINE_COLS.lineTotal]);
}

function addSectionRow(ws: ExcelJS.Worksheet, title: string) {
  ws.addRow(["", title]);
  const row = ws.lastRow!.number;
  ws.mergeCells(row, 2, row, COLS);
  ws.getRow(row).height = 30;
  for (let col = 1; col <= COLS; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: COLORS.violetSoft,
      fontColor: COLORS.violetDark,
      bold: true,
      size: 11,
      borderColor: COLORS.borderStrong,
    });
  }
}

function addSummaryFormulaRow(
  ws: ExcelJS.Worksheet,
  label: string,
  formula: string,
  result: number,
  opts: { emphasis?: boolean; fill?: string; fontColor?: string; staticValue?: number } = {},
) {
  ws.addRow([]);
  const row = ws.lastRow!.number;
  ws.mergeCells(row, COLS - 2, row, COLS - 1);
  ws.getCell(row, COLS - 2).value = label;
  if (opts.staticValue !== undefined) {
    ws.getCell(row, COLS).value = opts.staticValue;
  } else {
    setXlsxFormula(ws, row, COLS, formula, result);
  }
  ws.getRow(row).height = opts.emphasis ? 30 : 25;
  for (let col = COLS - 2; col <= COLS; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: opts.fill ?? COLORS.violetSoft,
      fontColor: opts.fontColor ?? COLORS.violetDark,
      bold: true,
      size: opts.emphasis ? 12 : 10,
      horizontal: col === COLS ? "right" : "left",
      borderColor: COLORS.borderStrong,
    });
  }
  ws.getCell(row, COLS).numFmt = XLSX_MONEY_NUMFMT;
  return row;
}

function addDataSection(
  ws: ExcelJS.Worksheet,
  title: string,
  rows: Array<Array<string | number>>,
  lineTotalResults: number[],
  rowIndexStart: number,
): { range: XlsxDataRowRange | null; nextRowIndex: number } {
  addSectionRow(ws, title);
  if (rows.length === 0) return { range: null, nextRowIndex: rowIndexStart };

  const sectionStartRow = ws.lastRow!.number + 1;
  let rowIndex = rowIndexStart;
  let firstRow = 0;
  let lastRow = 0;

  rows.forEach((values, idx) => {
    ws.addRow(values);
    const row = ws.lastRow!.number;
    if (idx === 0) firstRow = row;
    lastRow = row;
    styleDataRow(ws, row, rowIndex);
    applyLineFormulas(ws, row, LINE_COLS, sectionStartRow, lineTotalResults[idx]);
    rowIndex += 1;
  });

  return { range: { firstRow, lastRow }, nextRowIndex: rowIndex };
}

function styleInternalHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number) {
  ws.getRow(rowNumber).height = 28;
  for (let col = 1; col <= INTERNAL_COLS; col += 1) {
    styleCell(ws.getCell(rowNumber, col), {
      fill: COLORS.violetDark,
      fontColor: COLORS.white,
      bold: true,
      horizontal: col === 1 || col >= 5 ? "center" : "left",
      borderColor: COLORS.violetDark,
    });
  }
}

function styleInternalDataRow(ws: ExcelJS.Worksheet, row: number, rowIndex: number) {
  ws.getRow(row).height = 40;
  for (let col = 1; col <= INTERNAL_COLS; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: rowIndex % 2 === 0 ? COLORS.slateSoft : COLORS.white,
      horizontal: col === 1 || col >= 5 ? "center" : "left",
    });
  }
  ws.getCell(row, 3).font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.ink } };
  setXlsxMoneyFormat(ws, row, [INTERNAL_LINE_COLS.unitPrice, INTERNAL_LINE_COLS.lineTotal, INTERNAL_LINE_COLS.internal!]);
}

function addInternalSectionRow(ws: ExcelJS.Worksheet, title: string) {
  ws.addRow(["", "", title]);
  const row = ws.lastRow!.number;
  ws.mergeCells(row, 3, row, INTERNAL_COLS);
  ws.getRow(row).height = 30;
  for (let col = 1; col <= INTERNAL_COLS; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: COLORS.violetSoft,
      fontColor: COLORS.violetDark,
      bold: true,
      size: 11,
      borderColor: COLORS.borderStrong,
    });
  }
}

function addInternalDataSection(
  ws: ExcelJS.Worksheet,
  title: string,
  rows: Array<Array<string | number>>,
  clientTotalResults: number[],
  rowIndexStart: number,
): { range: XlsxDataRowRange | null; nextRowIndex: number } {
  addInternalSectionRow(ws, title);
  if (rows.length === 0) return { range: null, nextRowIndex: rowIndexStart };

  const sectionStartRow = ws.lastRow!.number + 1;
  let rowIndex = rowIndexStart;
  let firstRow = 0;
  let lastRow = 0;

  rows.forEach((values, idx) => {
    ws.addRow(values);
    const row = ws.lastRow!.number;
    if (idx === 0) firstRow = row;
    lastRow = row;
    styleInternalDataRow(ws, row, rowIndex);
    applyLineFormulas(ws, row, INTERNAL_LINE_COLS, sectionStartRow, clientTotalResults[idx]);
    rowIndex += 1;
  });

  return { range: { firstRow, lastRow }, nextRowIndex: rowIndex };
}

function addInternalSummaryFormulaRow(
  ws: ExcelJS.Worksheet,
  label: string,
  formula: string,
  result: number,
  opts: { emphasis?: boolean; fill?: string; fontColor?: string; numFmt?: string } = {},
) {
  ws.addRow([]);
  const row = ws.lastRow!.number;
  ws.mergeCells(row, INTERNAL_COLS - 2, row, INTERNAL_COLS - 1);
  ws.getCell(row, INTERNAL_COLS - 2).value = label;
  setXlsxFormula(ws, row, INTERNAL_COLS, formula, result);
  ws.getRow(row).height = opts.emphasis ? 30 : 25;
  for (let col = INTERNAL_COLS - 2; col <= INTERNAL_COLS; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: opts.fill ?? COLORS.violetSoft,
      fontColor: opts.fontColor ?? COLORS.violetDark,
      bold: true,
      size: opts.emphasis ? 12 : 10,
      horizontal: col === INTERNAL_COLS ? "right" : "left",
      borderColor: COLORS.borderStrong,
    });
  }
  ws.getCell(row, INTERNAL_COLS).numFmt = opts.numFmt ?? XLSX_MONEY_NUMFMT;
  return row;
}

export async function buildEstimateXlsx(order: OrderForEstimate): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wowstorg";
  wb.created = new Date();
  wb.modified = new Date();

  const pricing = calcOrderPricing({
    startDate: order.startDate,
    endDate: order.endDate,
    rentalStartPartOfDay: order.rentalStartPartOfDay,
    rentalEndPartOfDay: order.rentalEndPartOfDay,
    payMultiplier: order.payMultiplier,
    deliveryPrice: order.deliveryEnabled ? order.deliveryPrice : 0,
    montagePrice: order.montageEnabled ? order.montagePrice : 0,
    demontagePrice: order.demontageEnabled ? order.demontagePrice : 0,
    lines: order.lines.map((line) => ({
      itemId: line.itemId,
      requestedQty: line.requestedQty,
      pricePerDaySnapshot: line.pricePerDaySnapshot,
    })),
    discount: order,
  });

  const ws = wb.addWorksheet("Смета", {
    views: [{ state: "frozen", ySplit: 8, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.15,
        footer: 0.15,
      },
    },
  });
  ws.columns = [
    { width: 6 },
    { width: 30 },
    { width: 34 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 16 },
    { width: 17 },
  ];
  ws.properties.defaultRowHeight = 22;

  addHeader(ws, order);
  await addLogo(ws, wb);

  ws.addRow(["№", "Услуга", "Описание", "Ед.", "Кол-во", "Дней", "Цена/ед.", "Итого"]);
  styleHeaderRow(ws, ws.lastRow!.number);

  const requisiteRows: Array<Array<string | number>> = [];
  const requisiteTotals: number[] = [];
  for (const [idx, line] of order.lines.entries()) {
    const price = line.pricePerDaySnapshot != null ? Number(line.pricePerDaySnapshot) : 0;
    const multiplier = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
    const clientPrice = roundMoney(price * multiplier);
    const allocation = pricing.lineAllocations[idx];
    const total = roundMoney(
      allocation?.rentalAfterDiscount ?? price * line.requestedQty * pricing.days * multiplier,
    );
    requisiteRows.push(["", line.item?.name ?? "Позиция", "", "шт.", line.requestedQty, pricing.days, clientPrice, ""]);
    requisiteTotals.push(total);
  }

  const { range: requisiteRange } = addDataSection(ws, "Реквизит", requisiteRows, requisiteTotals, 1);

  const serviceRows: Array<Array<string | number>> = [];
  const serviceTotals: number[] = [];
  const services: Array<[string, number, string]> = [];
  if (order.deliveryEnabled) {
    services.push(["Доставка", Number(order.deliveryPrice ?? 0), (order.deliveryComment ?? "").trim()]);
  }
  if (order.montageEnabled) {
    services.push(["Монтаж", Number(order.montagePrice ?? 0), (order.montageComment ?? "").trim()]);
  }
  if (order.demontageEnabled) {
    services.push(["Демонтаж", Number(order.demontagePrice ?? 0), (order.demontageComment ?? "").trim()]);
  }
  for (const [name, amount, comment] of services) {
    serviceRows.push(["", name, comment, "усл.", 1, "", amount, ""]);
    serviceTotals.push(roundMoney(amount));
  }

  const { range: servicesRange } =
    serviceRows.length > 0
      ? addDataSection(ws, "Дополнительные услуги", serviceRows, serviceTotals, requisiteRows.length + 1)
      : { range: null as XlsxDataRowRange | null };

  ws.addRow([]);

  const rentalFormula =
    requisiteRange != null
      ? sumColumnFormula(LINE_COLS.lineTotal, requisiteRange.firstRow, requisiteRange.lastRow)
      : "0";
  const rentalRow = addSummaryFormulaRow(
    ws,
    "Аренда",
    rentalFormula,
    roundMoney(pricing.rentalSubtotalBeforeDiscount),
  );

  let rentalBaseRef = xlsxCellRef(rentalRow, COLS);
  if (pricing.discountAmount > 0) {
    const label =
      pricing.discountType === "PERCENT" && pricing.discountPercent != null
        ? `Скидка на реквизит ${pricing.discountPercent}%`
        : "Скидка на реквизит";
    const discountRow = addSummaryFormulaRow(ws, label, "", -roundMoney(pricing.discountAmount), {
      staticValue: -roundMoney(pricing.discountAmount),
    });
    const afterDiscountRow = addSummaryFormulaRow(
      ws,
      "Аренда после скидки",
      addFormulaRefFormula(rentalBaseRef, xlsxCellRef(discountRow, COLS)),
      roundMoney(pricing.rentalSubtotalAfterDiscount),
    );
    rentalBaseRef = xlsxCellRef(afterDiscountRow, COLS);
  }

  let subtotalFormula = rentalBaseRef;
  if (servicesRange != null) {
    const servicesFormula = sumColumnFormula(
      LINE_COLS.lineTotal,
      servicesRange.firstRow,
      servicesRange.lastRow,
    );
    const servicesRow = addSummaryFormulaRow(
      ws,
      "Доп. услуги",
      servicesFormula,
      roundMoney(pricing.servicesTotal),
    );
    subtotalFormula = addFormulaRefFormula(rentalBaseRef, xlsxCellRef(servicesRow, COLS));
  }

  const subtotalRow = addSummaryFormulaRow(
    ws,
    "Сумма до налога",
    subtotalFormula,
    roundMoney(pricing.grandTotalBeforeTax),
  );
  const subtotalRef = xlsxCellRef(subtotalRow, COLS);

  const taxRow = addSummaryFormulaRow(
    ws,
    `Налог ${Math.round(pricing.taxRate * 100)}%`,
    percentOfFormula(pricing.taxRate, subtotalRef),
    roundMoney(pricing.taxAmount),
  );

  addSummaryFormulaRow(
    ws,
    "Всего по смете",
    addFormulaRefFormula(subtotalRef, xlsxCellRef(taxRow, COLS)),
    roundMoney(pricing.grandTotal),
    {
      emphasis: true,
      fill: COLORS.yellow,
      fontColor: COLORS.ink,
    },
  );

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.protection = { locked: false };
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function buildInternalEstimateXlsx(order: OrderForEstimate): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wowstorg";
  wb.created = new Date();
  wb.modified = new Date();

  const pricing = calcOrderPricing({
    startDate: order.startDate,
    endDate: order.endDate,
    rentalStartPartOfDay: order.rentalStartPartOfDay,
    rentalEndPartOfDay: order.rentalEndPartOfDay,
    payMultiplier: order.payMultiplier,
    deliveryPrice: order.deliveryEnabled ? order.deliveryPrice : 0,
    montagePrice: order.montageEnabled ? order.montagePrice : 0,
    demontagePrice: order.demontageEnabled ? order.demontagePrice : 0,
    lines: order.lines.map((line) => ({
      itemId: line.itemId,
      requestedQty: line.requestedQty,
      pricePerDaySnapshot: line.pricePerDaySnapshot,
    })),
    discount: order,
  });

  const warehouse = calcWarehouseProfitEstimate({
    clientGrandTotal: pricing.grandTotal,
    clientTaxAmount: pricing.taxAmount,
    delivery: {
      enabled: order.deliveryEnabled,
      internalCost: order.deliveryInternalCost,
      internalPaymentMethod: order.deliveryInternalPaymentMethod,
    },
    montage: {
      enabled: order.montageEnabled,
      internalCost: order.montageInternalCost,
      internalPaymentMethod: order.montageInternalPaymentMethod,
    },
    demontage: {
      enabled: order.demontageEnabled,
      internalCost: order.demontageInternalCost,
      internalPaymentMethod: order.demontageInternalPaymentMethod,
    },
    hiddenExpenses: order.hiddenExpenses,
  });

  const ws = wb.addWorksheet("Внутренняя смета", {
    views: [{ state: "frozen", ySplit: 8, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.15,
        footer: 0.15,
      },
    },
  });
  ws.columns = [
    { width: 6 },
    { width: 15 },
    { width: 28 },
    { width: 34 },
    { width: 10 },
    { width: 10 },
    { width: 16 },
    { width: 17 },
    { width: 17 },
    { width: 13 },
  ];
  ws.properties.defaultRowHeight = 22;

  addInternalHeader(ws, order);
  await addLogo(ws, wb);

  ws.addRow(["№", "Блок", "Позиция", "Комментарий", "Кол-во", "Дней", "Цена клиенту", "Сумма клиенту", "Внутр. расход", "Оплата"]);
  styleInternalHeaderRow(ws, ws.lastRow!.number);

  const clientRanges: XlsxDataRowRange[] = [];
  const internalRanges: XlsxDataRowRange[] = [];
  let rowIndex = 1;

  const requisiteRows: Array<Array<string | number>> = [];
  const requisiteTotals: number[] = [];
  for (const [idx, line] of order.lines.entries()) {
    const price = num(line.pricePerDaySnapshot);
    const clientPrice = roundMoney(price * pricing.payMultiplier);
    const allocation = pricing.lineAllocations[idx];
    const total = roundMoney(
      allocation?.rentalAfterDiscount ?? price * line.requestedQty * pricing.days * pricing.payMultiplier,
    );
    requisiteRows.push([
      "",
      "Реквизит",
      line.item?.name ?? "Позиция",
      "",
      line.requestedQty,
      pricing.days,
      clientPrice,
      "",
      0,
      "",
    ]);
    requisiteTotals.push(total);
  }

  const requisiteSection = addInternalDataSection(ws, "Реквизит", requisiteRows, requisiteTotals, rowIndex);
  rowIndex = requisiteSection.nextRowIndex;
  if (requisiteSection.range) {
    clientRanges.push(requisiteSection.range);
    internalRanges.push(requisiteSection.range);
  }

  const serviceRows: Array<Array<string | number>> = [];
  const serviceTotals: number[] = [];
  const services: Array<{
    name: string;
    clientPrice: number;
    comment: string;
    internalCost: number;
    paymentMethod: string;
  }> = [];
  if (order.deliveryEnabled) {
    services.push({
      name: "Доставка",
      clientPrice: num(order.deliveryPrice),
      comment: (order.deliveryComment ?? "").trim(),
      internalCost: num(order.deliveryInternalCost),
      paymentMethod: paymentMethodLabel(order.deliveryInternalPaymentMethod),
    });
  }
  if (order.montageEnabled) {
    services.push({
      name: "Монтаж",
      clientPrice: num(order.montagePrice),
      comment: (order.montageComment ?? "").trim(),
      internalCost: num(order.montageInternalCost),
      paymentMethod: paymentMethodLabel(order.montageInternalPaymentMethod),
    });
  }
  if (order.demontageEnabled) {
    services.push({
      name: "Демонтаж",
      clientPrice: num(order.demontagePrice),
      comment: (order.demontageComment ?? "").trim(),
      internalCost: num(order.demontageInternalCost),
      paymentMethod: paymentMethodLabel(order.demontageInternalPaymentMethod),
    });
  }
  for (const service of services) {
    serviceRows.push([
      "",
      "Доп. услуга",
      service.name,
      service.comment,
      1,
      "",
      service.clientPrice,
      "",
      service.internalCost,
      service.paymentMethod,
    ]);
    serviceTotals.push(roundMoney(service.clientPrice));
  }

  if (serviceRows.length > 0) {
    const serviceSection = addInternalDataSection(ws, "Дополнительные услуги", serviceRows, serviceTotals, rowIndex);
    rowIndex = serviceSection.nextRowIndex;
    if (serviceSection.range) {
      clientRanges.push(serviceSection.range);
      internalRanges.push(serviceSection.range);
    }
  }

  const hiddenRows: Array<Array<string | number>> = [];
  const hiddenTotals: number[] = [];
  for (const expense of order.hiddenExpenses ?? []) {
    const cost = num(expense.cost);
    if (cost <= 0 && !expense.title.trim()) continue;
    hiddenRows.push([
      "",
      "Скрытая трата",
      expense.title.trim() || "Скрытая трата",
      expense.comment?.trim() ?? "",
      1,
      "",
      0,
      "",
      cost,
      paymentMethodLabel(expense.internalPaymentMethod),
    ]);
    hiddenTotals.push(0);
  }

  if (hiddenRows.length > 0) {
    const hiddenSection = addInternalDataSection(ws, "Скрытые траты", hiddenRows, hiddenTotals, rowIndex);
    if (hiddenSection.range) {
      clientRanges.push(hiddenSection.range);
      internalRanges.push(hiddenSection.range);
    }
  }

  ws.addRow([]);

  const clientBeforeTaxFormula = sumRangesFormula(INTERNAL_LINE_COLS.lineTotal, clientRanges);
  const clientBeforeTaxRow = addInternalSummaryFormulaRow(
    ws,
    "Сумма клиента до налога",
    clientBeforeTaxFormula,
    pricing.grandTotalBeforeTax,
  );
  const clientBeforeTaxRef = xlsxCellRef(clientBeforeTaxRow, INTERNAL_COLS);
  const clientTaxRow = addInternalSummaryFormulaRow(
    ws,
    `Налог клиента ${Math.round(pricing.taxRate * 100)}%`,
    percentOfFormula(pricing.taxRate, clientBeforeTaxRef),
    pricing.taxAmount,
  );
  const clientTotalRow = addInternalSummaryFormulaRow(
    ws,
    "Итого клиент",
    addFormulaRefFormula(clientBeforeTaxRef, xlsxCellRef(clientTaxRow, INTERNAL_COLS)),
    pricing.grandTotal,
  );
  const clientTotalRef = xlsxCellRef(clientTotalRow, INTERNAL_COLS);

  const internalCostFormula = sumRangesFormula(INTERNAL_LINE_COLS.internal!, internalRanges);
  const internalCostRow = addInternalSummaryFormulaRow(
    ws,
    "Расходы доп. услуг и скрытых трат",
    internalCostFormula,
    warehouse.internalCostTotal,
  );
  const internalCostRef = xlsxCellRef(internalCostRow, INTERNAL_COLS);
  let totalExpenseFormula = addFormulaRefFormula(xlsxCellRef(clientTaxRow, INTERNAL_COLS), internalCostRef);
  if (warehouse.cashInternalCostTax > 0) {
    const cashTaxFormula = internalRanges
      .map(({ firstRow, lastRow }) =>
        cashInternalTaxFormula(INTERNAL_LINE_COLS.internal!, INTERNAL_LINE_COLS.payment!, firstRow, lastRow),
      )
      .join("+");
    const cashTaxRow = addInternalSummaryFormulaRow(
      ws,
      `Налог нал ${formatPercentValue(warehouse.cashTaxRate * 100)}`,
      cashTaxFormula || "0",
      warehouse.cashInternalCostTax,
    );
    totalExpenseFormula = addFormulaRefFormula(totalExpenseFormula, xlsxCellRef(cashTaxRow, INTERNAL_COLS));
  }
  const totalExpensesRow = addInternalSummaryFormulaRow(
    ws,
    "Итого расходов",
    totalExpenseFormula,
    roundMoney(pricing.taxAmount + warehouse.internalCostWithCashTax),
  );
  const totalExpensesRef = xlsxCellRef(totalExpensesRow, INTERNAL_COLS);
  const profitRow = addInternalSummaryFormulaRow(
    ws,
    "Заработок",
    `${clientTotalRef}-${totalExpensesRef}`,
    warehouse.profitEstimate,
    {
      emphasis: true,
      fill: COLORS.violetSoft,
      fontColor: COLORS.violetDark,
    },
  );
  addInternalSummaryFormulaRow(
    ws,
    "Рентабельность",
    `IFERROR(${xlsxCellRef(profitRow, INTERNAL_COLS)}/${clientTotalRef},0)`,
    warehouse.profitabilityPct / 100,
    { numFmt: "0.00%" },
  );

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.protection = { locked: false };
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer()) as unknown as Buffer;
}
