import ExcelJS from "exceljs";
import { calcOrderPricing } from "@/server/orders/order-pricing";

type OrderForEstimate = {
  id: string;
  eventName: string | null;
  startDate: Date;
  endDate: Date;
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
  titleBg: "FF0F766E",
  titleText: "FFFFFFFF",
  headerBg: "FFECFEFF",
  headerText: "FF0F172A",
  totalBg: "FFF1F5F9",
  border: "FFE2E8F0",
  accentBg: "FFDCFCE7",
  accentText: "FF14532D",
};

function styleCellBase(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.border } },
    left: { style: "thin", color: { argb: COLORS.border } },
    bottom: { style: "thin", color: { argb: COLORS.border } },
    right: { style: "thin", color: { argb: COLORS.border } },
  };
  cell.font = { name: "Calibri", size: 11 };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number, cols: number) {
  for (let i = 1; i <= cols; i++) {
    const c = ws.getCell(rowNumber, i);
    styleCellBase(c);
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.headerText } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    c.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "center" };
  }
}

function addRowStyled(ws: ExcelJS.Worksheet, values: Array<string | number>, cols = 6) {
  const rowValues = [...values];
  while (rowValues.length < cols) rowValues.push("");
  ws.addRow(rowValues.slice(0, cols));
  const row = ws.lastRow!;
  for (let i = 1; i <= cols; i++) {
    const c = ws.getCell(row.number, i);
    styleCellBase(c);
    if (i > 1) c.alignment = { vertical: "middle", horizontal: "right" };
  }
  return row.number;
}

export async function buildEstimateXlsx(order: OrderForEstimate): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wowstorg";
  wb.created = new Date();

  const ws = wb.addWorksheet("Смета");
  const pricing = calcOrderPricing({
    startDate: order.startDate,
    endDate: order.endDate,
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
  const hasManualDiscount = pricing.discountAmount > 0;
  const cols = hasManualDiscount ? 6 : 5;
  const amountCol = cols;
  ws.columns = [
    { width: 34 },
    { width: 10 },
    { width: 16 },
    { width: 8 },
    { width: 18 },
    ...(hasManualDiscount ? [{ width: 18 }] : []),
  ];
  const days = pricing.days;
  const mult = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
  const period = `${order.startDate.toLocaleDateString("ru-RU")} — ${order.endDate.toLocaleDateString("ru-RU")}`;
  const totalValues = (label: string, amount: number): Array<string | number> => [
    label,
    ...Array(Math.max(0, cols - 2)).fill(""),
    amount,
  ];

  ws.addRow(["Смета по заявке"]);
  ws.mergeCells(1, 1, 1, cols);
  const title = ws.getCell(1, 1);
  styleCellBase(title);
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: COLORS.titleText } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.titleBg } };

  addRowStyled(ws, ["Клиент", order.customer.name], cols);
  addRowStyled(ws, ["Мероприятие", order.eventName || "—"], cols);
  addRowStyled(ws, ["Период", period], cols);
  addRowStyled(ws, ["Дней", days], cols);
  ws.addRow([]);

  ws.addRow(
    hasManualDiscount
      ? ["Позиция", "Кол-во", "Цена/сут (₽)", "Дней", "До скидки (₽)", "После скидки (₽)"]
      : ["Позиция", "Кол-во", "Цена/сут (₽)", "Дней", "Сумма (₽)"],
  );
  styleHeaderRow(ws, ws.lastRow!.number, cols);

  for (const [idx, l] of order.lines.entries()) {
    const price = l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0;
    const clientPrice = Math.round(price * mult * 100) / 100;
    const allocation = pricing.lineAllocations[idx];
    const before = Math.round(allocation?.rentalBeforeDiscount ?? price * l.requestedQty * days * mult);
    const after = Math.round(allocation?.rentalAfterDiscount ?? before);
    const row = addRowStyled(
      ws,
      hasManualDiscount
        ? [l.item?.name ?? "Позиция", l.requestedQty, clientPrice, days, before, after]
        : [l.item?.name ?? "Позиция", l.requestedQty, clientPrice, days, before],
      cols,
    );
    ws.getCell(row, 3).numFmt = "#,##0.00";
    ws.getCell(row, amountCol).numFmt = "#,##0.00";
    if (hasManualDiscount) ws.getCell(row, amountCol - 1).numFmt = "#,##0.00";
  }

  ws.addRow([]);
  const rentalTotalRow = addRowStyled(
    ws,
    totalValues(
      hasManualDiscount ? "Итого аренда до скидки (₽)" : "Итого аренда (₽)",
      Math.round(pricing.rentalSubtotalBeforeDiscount),
    ),
    cols,
  );
  for (let i = 1; i <= cols; i++) {
    const c = ws.getCell(rentalTotalRow, i);
    c.font = { name: "Calibri", size: 11, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  }
  ws.getCell(rentalTotalRow, amountCol).numFmt = "#,##0.00";

  if (pricing.discountAmount > 0) {
    const label =
      pricing.discountType === "PERCENT" && pricing.discountPercent != null
        ? `Скидка на реквизит (${pricing.discountPercent}%)`
        : "Скидка на реквизит";
    const discountRow = addRowStyled(ws, totalValues(label, -Math.round(pricing.discountAmount)), cols);
    ws.getCell(discountRow, amountCol).numFmt = "#,##0.00";
    const afterRow = addRowStyled(
      ws,
      totalValues("Итого аренда после скидки (₽)", Math.round(pricing.rentalSubtotalAfterDiscount)),
      cols,
    );
    for (let i = 1; i <= cols; i++) {
      const c = ws.getCell(afterRow, i);
      c.font = { name: "Calibri", size: 11, bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
    }
    ws.getCell(afterRow, amountCol).numFmt = "#,##0.00";
  }

  const servicesTotal =
    (order.deliveryEnabled ? Number(order.deliveryPrice ?? 0) : 0) +
    (order.montageEnabled ? Number(order.montagePrice ?? 0) : 0) +
    (order.demontageEnabled ? Number(order.demontagePrice ?? 0) : 0);

  if (order.deliveryEnabled || order.montageEnabled || order.demontageEnabled) {
    ws.addRow([]);
    ws.addRow(["Доп. услуги", "Цена (₽)", "Комментарий"]);
    const h = ws.lastRow!.number;
    ws.mergeCells(h, 3, h, cols);
    styleHeaderRow(ws, h, cols);

    if (order.deliveryEnabled) {
      const p = order.deliveryPrice != null ? Number(order.deliveryPrice) : 0;
      const comment = (order.deliveryComment ?? "").trim();
      const row = addRowStyled(ws, ["Доставка", p, comment], cols);
      ws.mergeCells(row, 3, row, cols);
      ws.getCell(row, 2).numFmt = "#,##0.00";
    }
    if (order.montageEnabled) {
      const p = order.montagePrice != null ? Number(order.montagePrice) : 0;
      const comment = (order.montageComment ?? "").trim();
      const row = addRowStyled(ws, ["Монтаж", p, comment], cols);
      ws.mergeCells(row, 3, row, cols);
      ws.getCell(row, 2).numFmt = "#,##0.00";
    }
    if (order.demontageEnabled) {
      const p = order.demontagePrice != null ? Number(order.demontagePrice) : 0;
      const comment = (order.demontageComment ?? "").trim();
      const row = addRowStyled(ws, ["Демонтаж", p, comment], cols);
      ws.mergeCells(row, 3, row, cols);
      ws.getCell(row, 2).numFmt = "#,##0.00";
    }

    ws.addRow([]);
    const servicesRow = addRowStyled(ws, totalValues("Итого доп. услуги (₽)", servicesTotal), cols);
    for (let i = 1; i <= cols; i++) {
      const c = ws.getCell(servicesRow, i);
      c.font = { name: "Calibri", size: 11, bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
    }
    ws.getCell(servicesRow, amountCol).numFmt = "#,##0.00";
  }

  const grandTotal = pricing.grandTotal;
  ws.addRow([]);
  const grandRow = addRowStyled(ws, totalValues("Сумма заявки (₽)", grandTotal), cols);
  for (let i = 1; i <= cols; i++) {
    const c = ws.getCell(grandRow, i);
    c.font = { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.accentText } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.accentBg } };
  }
  ws.getCell(grandRow, amountCol).numFmt = "#,##0.00";
  ws.views = [{ state: "frozen", ySplit: 7 }];

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
