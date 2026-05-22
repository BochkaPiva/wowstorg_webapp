import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import { calcOrderPricing } from "@/server/orders/order-pricing";

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
  montageEnabled: boolean;
  montagePrice: unknown;
  montageComment: string | null;
  demontageEnabled: boolean;
  demontagePrice: unknown;
  demontageComment: string | null;
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

async function addLogo(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook) {
  try {
    const buffer = await fs.readFile(LOGO_PATH);
    const imageId = wb.addImage({ base64: buffer.toString("base64"), extension: "png" });
    ws.addImage(imageId, {
      tl: { col: 0.35, row: 0.45 },
      ext: { width: 225, height: 118 },
    });
  } catch {
    // The estimate should still be generated if the brand asset is missing.
  }
}

function addHeader(ws: ExcelJS.Worksheet, order: OrderForEstimate, cols: number, days: number) {
  for (let row = 1; row <= 7; row += 1) {
    ws.getRow(row).height = row <= 5 ? 23 : 10;
  }

  ws.mergeCells(1, 1, 5, 3);
  ws.mergeCells(1, 4, 1, cols);
  ws.mergeCells(2, 4, 2, cols);
  ws.mergeCells(3, 4, 3, cols);
  ws.mergeCells(4, 4, 4, cols);
  ws.mergeCells(5, 4, 5, cols);
  styleRange(ws, 1, 5, 1, cols, { fill: COLORS.white, borderColor: COLORS.white });

  ws.getCell(1, 4).value = "Смета расходов";
  styleCell(ws.getCell(1, 4), { bold: true, size: 22, fontColor: COLORS.violetDark, borderColor: COLORS.white });

  ws.getCell(2, 4).value = order.eventName?.trim() || order.customer.name;
  styleCell(ws.getCell(2, 4), { bold: true, size: 15, borderColor: COLORS.white });

  const metaRows = [
    `Заказчик: ${order.customer.name}`,
    `Даты мероприятия: ${formatPeriod(order)}`,
    `Дней в расчете: ${days} · Дата сметы: ${new Date().toLocaleDateString("ru-RU")}`,
  ];
  for (let index = 0; index < metaRows.length; index += 1) {
    const cell = ws.getCell(3 + index, 4);
    cell.value = metaRows[index];
    styleCell(cell, { size: 10, fontColor: COLORS.muted, borderColor: COLORS.white });
  }

  styleRange(ws, 6, 6, 1, cols, { fill: COLORS.violet, borderColor: COLORS.violet });
  ws.getRow(6).height = 5;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number, cols: number) {
  ws.getRow(rowNumber).height = 28;
  for (let col = 1; col <= cols; col += 1) {
    styleCell(ws.getCell(rowNumber, col), {
      fill: COLORS.violetDark,
      fontColor: COLORS.white,
      bold: true,
      horizontal: col === 1 || col >= 4 ? "center" : "left",
      borderColor: COLORS.violetDark,
    });
  }
}

function addEstimateRow(
  ws: ExcelJS.Worksheet,
  values: Array<string | number>,
  cols: number,
  rowIndex: number,
) {
  const rowValues = [...values];
  while (rowValues.length < cols) rowValues.push("");
  ws.addRow(rowValues.slice(0, cols));
  const row = ws.lastRow!;
  row.height = 40;
  for (let col = 1; col <= cols; col += 1) {
    styleCell(ws.getCell(row.number, col), {
      fill: rowIndex % 2 === 0 ? COLORS.slateSoft : COLORS.white,
      horizontal: col === 1 || col >= 4 ? "center" : "left",
    });
  }
  ws.getCell(row.number, 2).font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.ink } };
  ws.getCell(row.number, cols - 1).numFmt = '#,##0 "₽"';
  ws.getCell(row.number, cols).numFmt = '#,##0 "₽"';
  return row.number;
}

function addSectionRow(ws: ExcelJS.Worksheet, title: string, cols: number) {
  ws.addRow(["", title]);
  const row = ws.lastRow!.number;
  ws.mergeCells(row, 2, row, cols);
  ws.getRow(row).height = 30;
  for (let col = 1; col <= cols; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: COLORS.violetSoft,
      fontColor: COLORS.violetDark,
      bold: true,
      size: 11,
      borderColor: COLORS.borderStrong,
    });
  }
}

function addSummaryRow(
  ws: ExcelJS.Worksheet,
  cols: number,
  label: string,
  amount: number,
  opts: { emphasis?: boolean; fill?: string; fontColor?: string } = {},
) {
  ws.addRow([]);
  const row = ws.lastRow!.number;
  ws.mergeCells(row, cols - 2, row, cols - 1);
  ws.getCell(row, cols - 2).value = label;
  ws.getCell(row, cols).value = amount;
  ws.getRow(row).height = opts.emphasis ? 30 : 25;
  for (let col = cols - 2; col <= cols; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: opts.fill ?? COLORS.violetSoft,
      fontColor: opts.fontColor ?? COLORS.violetDark,
      bold: true,
      size: opts.emphasis ? 12 : 10,
      horizontal: col === cols ? "right" : "left",
      borderColor: COLORS.borderStrong,
    });
  }
  ws.getCell(row, cols).numFmt = '#,##0 "₽"';
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

  const cols = 8;
  const ws = wb.addWorksheet("Смета", {
    views: [{ state: "frozen", ySplit: 8 }],
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

  addHeader(ws, order, cols, pricing.days);
  await addLogo(ws, wb);

  ws.addRow(["№", "Услуга", "Описание", "Ед.", "Кол-во", "Дней", "Цена/ед.", "Итого"]);
  const headerRow = ws.lastRow!.number;
  styleHeaderRow(ws, headerRow, cols);

  addSectionRow(ws, "Реквизит", cols);
  let visibleIndex = 1;
  for (const [idx, line] of order.lines.entries()) {
    const price = line.pricePerDaySnapshot != null ? Number(line.pricePerDaySnapshot) : 0;
    const multiplier = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
    const clientPrice = Math.round(price * multiplier * 100) / 100;
    const allocation = pricing.lineAllocations[idx];
    const total = Math.round(allocation?.rentalAfterDiscount ?? price * line.requestedQty * pricing.days * multiplier);
    addEstimateRow(
      ws,
      [
        visibleIndex,
        line.item?.name ?? "Позиция",
        "",
        "шт.",
        line.requestedQty,
        pricing.days,
        clientPrice,
        total,
      ],
      cols,
      visibleIndex,
    );
    visibleIndex += 1;
  }

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

  if (services.length > 0) {
    addSectionRow(ws, "Дополнительные услуги", cols);
    for (const [name, amount, comment] of services) {
      addEstimateRow(ws, [visibleIndex, name, comment, "усл.", 1, "", amount, amount], cols, visibleIndex);
      visibleIndex += 1;
    }
  }

  ws.addRow([]);
  addSummaryRow(ws, cols, "Аренда", Math.round(pricing.rentalSubtotalBeforeDiscount));

  if (pricing.discountAmount > 0) {
    const label =
      pricing.discountType === "PERCENT" && pricing.discountPercent != null
        ? `Скидка на реквизит ${pricing.discountPercent}%`
        : "Скидка на реквизит";
    addSummaryRow(ws, cols, label, -Math.round(pricing.discountAmount));
    addSummaryRow(ws, cols, "Аренда после скидки", Math.round(pricing.rentalSubtotalAfterDiscount));
  }

  const servicesTotal =
    (order.deliveryEnabled ? Number(order.deliveryPrice ?? 0) : 0) +
    (order.montageEnabled ? Number(order.montagePrice ?? 0) : 0) +
    (order.demontageEnabled ? Number(order.demontagePrice ?? 0) : 0);
  if (servicesTotal > 0) {
    addSummaryRow(ws, cols, "Доп. услуги", servicesTotal);
  }
  addSummaryRow(ws, cols, `Налог ${Math.round(pricing.taxRate * 100)}%`, pricing.taxAmount);
  addSummaryRow(ws, cols, "Всего по смете", pricing.grandTotal, {
    emphasis: true,
    fill: COLORS.yellow,
    fontColor: COLORS.ink,
  });

  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: cols },
  };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
