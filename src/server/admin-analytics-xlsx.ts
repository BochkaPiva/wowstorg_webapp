import ExcelJS from "exceljs";

import type { AdminAnalyticsData } from "@/server/admin-analytics";

type ExportSection = "global" | "overview" | "tops" | "profitability";

type RowValue = string | number | null;

const COLORS = {
  titleBg: "FF4F46E5",
  titleText: "FFFFFFFF",
  headerBg: "FFEDE9FE",
  headerText: "FF312E81",
  altBg: "FFF8FAFC",
  border: "FFE2E8F0",
  positiveBg: "FFDCFCE7",
  positiveText: "FF166534",
  negativeBg: "FFFEE2E2",
  negativeText: "FF991B1B",
};

function setCols(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.columns = widths.map((w) => ({ width: w }));
}

function styleCellBase(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.border } },
    left: { style: "thin", color: { argb: COLORS.border } },
    bottom: { style: "thin", color: { argb: COLORS.border } },
    right: { style: "thin", color: { argb: COLORS.border } },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  cell.font = { name: "Calibri", size: 11 };
}

function appendTitle(ws: ExcelJS.Worksheet, text: string, colSpan: number) {
  ws.addRow([text]);
  const row = ws.lastRow!;
  ws.mergeCells(row.number, 1, row.number, colSpan);
  const cell = ws.getCell(row.number, 1);
  styleCellBase(cell);
  cell.font = { name: "Calibri", size: 15, bold: true, color: { argb: COLORS.titleText } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.titleBg } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  row.height = 24;
}

function addDataTable(
  ws: ExcelJS.Worksheet,
  headers: string[],
  rows: RowValue[][],
  options?: { highlightNegativeColIdx?: number[]; highlightPositiveColIdx?: number[] },
) {
  ws.addRow(headers);
  const headerRow = ws.lastRow!;
  headerRow.height = 20;
  for (let i = 1; i <= headers.length; i++) {
    const c = ws.getCell(headerRow.number, i);
    styleCellBase(c);
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.headerText } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    c.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "center" };
  }
  for (const r of rows) {
    ws.addRow(r);
    const row = ws.lastRow!;
    for (let i = 1; i <= headers.length; i++) {
      const c = ws.getCell(row.number, i);
      styleCellBase(c);
      c.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "right" };
      if (typeof r[i - 1] === "number") c.numFmt = "#,##0.00";
      if (row.number % 2 === 0) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.altBg } };
      }
      const n = r[i - 1];
      if (typeof n === "number" && options?.highlightNegativeColIdx?.includes(i - 1) && n < 0) {
        c.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.negativeText } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.negativeBg } };
      }
      if (typeof n === "number" && options?.highlightPositiveColIdx?.includes(i - 1) && n > 0) {
        c.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.positiveText } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.positiveBg } };
      }
    }
  }
}

function addPeriodRow(ws: ExcelJS.Worksheet, period: string, colSpan: number) {
  ws.addRow([`Период: ${period}`]);
  const row = ws.lastRow!;
  ws.mergeCells(row.number, 1, row.number, colSpan);
  const c = ws.getCell(row.number, 1);
  styleCellBase(c);
  c.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF334155" } };
}

function addSpacer(ws: ExcelJS.Worksheet) {
  ws.addRow([]);
}

export async function buildAdminAnalyticsXlsx(data: AdminAnalyticsData, section: ExportSection): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wowstorg Analytics";
  wb.created = new Date();
  const period = `${data.period.from ?? "начало"} — ${data.period.to ?? "сейчас"}`;

  if (section === "global" || section === "overview") {
    const ws = wb.addWorksheet("Сводка KPI");
    setCols(ws, [44, 22]);
    appendTitle(ws, "Сводка KPI", 2);
    addPeriodRow(ws, period, 2);
    addSpacer(ws);
    addDataTable(ws, ["Метрика", "Значение"], [
      ["Заявки (все статусы)", data.kpi.ordersTotal],
      ["Закрытые заявки", data.kpi.ordersClosed],
      ["Суммарная выручка, ₽", data.kpi.totalRevenue],
      ["Выручка по реквизиту, ₽", data.kpi.itemsRevenue],
      ["Выручка по услугам, ₽", data.kpi.servicesRevenue],
      ["Средний чек (закрытые), ₽", data.kpi.averageOrderRevenue],
      ["Средняя длительность аренды, дней", data.kpi.averageRentalDays],
    ]);
    ws.views = [{ state: "frozen", ySplit: 4 }];

    const ws2 = wb.addWorksheet("Статусы и источники");
    setCols(ws2, [28, 16, 18]);
    appendTitle(ws2, "Статусы и источники", 3);
    addPeriodRow(ws2, period, 3);
    addSpacer(ws2);
    addDataTable(
      ws2,
      ["Статус", "Количество"],
      data.breakdowns.byStatus.map((r) => [r.status, r.count]),
    );
    addSpacer(ws2);
    addDataTable(
      ws2,
      ["Источник", "Количество", "Выручка, ₽"],
      data.breakdowns.bySource.map((r) => [r.source, r.count, r.revenue]),
      { highlightPositiveColIdx: [2] },
    );

    const ws3 = wb.addWorksheet("Выручка по месяцам");
    setCols(ws3, [16, 18, 18]);
    appendTitle(ws3, "Выручка по месяцам", 3);
    addPeriodRow(ws3, period, 3);
    addSpacer(ws3);
    addDataTable(
      ws3,
      ["Месяц", "Выручка, ₽", "Закрытые заявки"],
      data.breakdowns.revenueByMonth.map((r) => [r.month, r.revenue, r.orders]),
      { highlightPositiveColIdx: [1] },
    );

    const ws4 = wb.addWorksheet("Услуги");
    setCols(ws4, [20, 18, 12]);
    appendTitle(ws4, "Дополнительные услуги", 3);
    addPeriodRow(ws4, period, 3);
    addSpacer(ws4);
    addDataTable(
      ws4,
      ["Услуга", "Выручка, ₽", "Заявок"],
      [
        ["Доставка", data.services.deliveryRevenue, data.services.deliveryOrders],
        ["Монтаж", data.services.montageRevenue, data.services.montageOrders],
        ["Демонтаж", data.services.demontageRevenue, data.services.demontageOrders],
      ],
      { highlightPositiveColIdx: [1] },
    );
  }

  if (section === "global" || section === "tops") {
    const ws = wb.addWorksheet("Топ реквизита");
    setCols(ws, [6, 46, 18]);
    appendTitle(ws, "Топ реквизита", 3);
    addPeriodRow(ws, period, 3);
    addSpacer(ws);
    addDataTable(
      ws,
      ["#", "Позиция", "Выдано, шт"],
      data.tops.topByIssued.map((r, i) => [i + 1, r.itemName, r.issuedQty]),
      { highlightPositiveColIdx: [2] },
    );
    addSpacer(ws);
    addDataTable(
      ws,
      ["#", "Позиция", "Выручка, ₽"],
      data.tops.topByRevenue.map((r, i) => [i + 1, r.itemName, r.revenue]),
      { highlightPositiveColIdx: [2] },
    );

    const ws2 = wb.addWorksheet("Топ заказчиков");
    setCols(ws2, [6, 46, 18]);
    appendTitle(ws2, "Топ заказчиков по сумме", 3);
    addPeriodRow(ws2, period, 3);
    addSpacer(ws2);
    addDataTable(
      ws2,
      ["#", "Заказчик", "Сумма, ₽"],
      data.tops.topCustomers.map((r, i) => [i + 1, r.customerName, r.total]),
      { highlightPositiveColIdx: [2] },
    );
  }

  if (section === "global" || section === "profitability") {
    const ws = wb.addWorksheet("Рентабельность");
    setCols(ws, [38, 10, 14, 14, 14, 14, 12, 10]);
    appendTitle(ws, "Рентабельность реквизита", 8);
    addPeriodRow(ws, period, 8);
    addSpacer(ws);
    addDataTable(ws, ["Показатель", "Значение"], [
      ["Позиции с закупом", data.profitability.summary.trackedItems],
      ["Позиции с выручкой", data.profitability.summary.itemsWithRevenue],
      ["Выручка (tracked), ₽", data.profitability.summary.totalRevenue],
      ["Закупочная стоимость, ₽", data.profitability.summary.totalPurchaseCost],
      ["Валовая прибыль, ₽", data.profitability.summary.totalGrossProfit],
      ["Окупаемость", data.profitability.summary.totalPaybackRatio ?? "—"],
      ["ROI, %", data.profitability.summary.totalRoiPercent ?? "—"],
    ]);
    addSpacer(ws);
    addDataTable(
      ws,
      ["Позиция", "Кол-во", "Закуп, ₽/шт", "Закуп всего, ₽", "Выручка, ₽", "Прибыль, ₽", "Окупаемость", "ROI, %"],
      data.profitability.rows.map((r) => [
        r.itemName,
        r.totalQty,
        r.unitPurchasePrice,
        r.purchaseCost,
        r.revenue,
        r.grossProfit,
        r.paybackRatio ?? "—",
        r.roiPercent ?? "—",
      ]),
      { highlightNegativeColIdx: [5, 7], highlightPositiveColIdx: [5, 7] },
    );
    ws.views = [{ state: "frozen", ySplit: 13 }];
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

