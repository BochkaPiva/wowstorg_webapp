import ExcelJS from "exceljs";

import type { AdminAnalyticsData } from "@/server/admin-analytics";

export type AdminAnalyticsExportSection = "global" | "requisites" | "projects" | "customers";

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
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
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
  row.height = 24;
}

function addPeriodRow(ws: ExcelJS.Worksheet, data: AdminAnalyticsData, colSpan: number) {
  ws.addRow([`Период: ${data.period.from ?? "начало"} — ${data.period.to ?? "сейчас"}`]);
  const row = ws.lastRow!;
  ws.mergeCells(row.number, 1, row.number, colSpan);
  const c = ws.getCell(row.number, 1);
  styleCellBase(c);
  c.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF334155" } };
}

function addSpacer(ws: ExcelJS.Worksheet) {
  ws.addRow([]);
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
    c.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "center", wrapText: true };
  }
  for (const r of rows) {
    ws.addRow(r);
    const row = ws.lastRow!;
    for (let i = 1; i <= headers.length; i++) {
      const c = ws.getCell(row.number, i);
      styleCellBase(c);
      c.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "right", wrapText: true };
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

function addOverview(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Обзор");
  setCols(ws, [46, 22]);
  appendTitle(ws, "Обзор", 2);
  addPeriodRow(ws, data, 2);
  addSpacer(ws);
  addDataTable(ws, ["Метрика", "Значение"], [
    ["Факт выручки, ₽", data.overview.kpi.factRevenue],
    ["Факт реквизита, ₽", data.overview.kpi.factItemsRevenue],
    ["Факт услуг, ₽", data.overview.kpi.factServicesRevenue],
    ["Факт валовой прибыли реквизита, ₽", data.overview.kpi.factGrossProfit],
    ["Закрытые заявки", data.overview.kpi.ordersClosed],
    ["Средний чек, ₽", data.overview.kpi.averageOrderRevenue],
    ["Прогноз проектов, ₽", data.overview.kpi.projectForecastRevenue],
    ["Прогноз маржи после налога, ₽", data.overview.kpi.projectForecastMarginAfterTax],
    ["Активные проекты", data.overview.kpi.activeProjects],
    ["Завершенные проекты", data.overview.kpi.completedProjects],
    ["Отмененные проекты", data.overview.kpi.cancelledProjects],
    ["Проекты без активности 7+ дней", data.overview.kpi.staleProjects],
    ["Проекты с низкой маржой", data.overview.kpi.lowMarginProjects],
    ["Повторные заказчики", data.overview.kpi.repeatCustomers],
  ]);
  addSpacer(ws);
  addDataTable(
    ws,
    ["Проект", "Риск"],
    data.overview.attention.map((r) => [r.projectTitle, r.message]),
  );
}

function addRequisites(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const req = data.requisites;
  const kpi = wb.addWorksheet("Реквизит KPI");
  setCols(kpi, [44, 22]);
  appendTitle(kpi, "Реквизит KPI", 2);
  addPeriodRow(kpi, data, 2);
  addSpacer(kpi);
  addDataTable(kpi, ["Метрика", "Значение"], [
    ["Заявки (все статусы)", req.kpi.ordersTotal],
    ["Закрытые заявки", req.kpi.ordersClosed],
    ["Суммарная выручка, ₽", req.kpi.totalRevenue],
    ["Выручка по реквизиту, ₽", req.kpi.itemsRevenue],
    ["Выручка по услугам, ₽", req.kpi.servicesRevenue],
    ["Средний чек, ₽", req.kpi.averageOrderRevenue],
    ["Средняя длительность аренды, дней", req.kpi.averageRentalDays],
  ]);
  addSpacer(kpi);
  addDataTable(kpi, ["Услуга", "Выручка, ₽", "Заявок"], [
    ["Доставка", req.services.deliveryRevenue, req.services.deliveryOrders],
    ["Монтаж", req.services.montageRevenue, req.services.montageOrders],
    ["Демонтаж", req.services.demontageRevenue, req.services.demontageOrders],
  ]);

  const tops = wb.addWorksheet("Реквизит топы");
  setCols(tops, [6, 48, 18]);
  appendTitle(tops, "Топы реквизита", 3);
  addPeriodRow(tops, data, 3);
  addSpacer(tops);
  addDataTable(tops, ["#", "Позиция", "Выдано, шт"], req.tops.topByIssued.map((r, i) => [i + 1, r.itemName, r.issuedQty]));
  addSpacer(tops);
  addDataTable(tops, ["#", "Позиция", "Выручка, ₽"], req.tops.topByRevenue.map((r, i) => [i + 1, r.itemName, r.revenue]));

  const profitability = wb.addWorksheet("Рентабельность");
  setCols(profitability, [38, 10, 14, 14, 14, 14, 12, 10]);
  appendTitle(profitability, "Рентабельность реквизита", 8);
  addPeriodRow(profitability, data, 8);
  addSpacer(profitability);
  addDataTable(profitability, ["Показатель", "Значение"], [
    ["Позиции с закупом", req.profitability.summary.trackedItems],
    ["Позиции с выручкой", req.profitability.summary.itemsWithRevenue],
    ["Выручка (tracked), ₽", req.profitability.summary.totalRevenue],
    ["Закупочная стоимость, ₽", req.profitability.summary.totalPurchaseCost],
    ["Валовая прибыль, ₽", req.profitability.summary.totalGrossProfit],
    ["Окупаемость", req.profitability.summary.totalPaybackRatio ?? "—"],
    ["ROI, %", req.profitability.summary.totalRoiPercent ?? "—"],
  ]);
  addSpacer(profitability);
  addDataTable(
    profitability,
    ["Позиция", "Кол-во", "Закуп, ₽/шт", "Закуп всего, ₽", "Выручка, ₽", "Прибыль, ₽", "Окупаемость", "ROI, %"],
    req.profitability.rows.map((r) => [
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
}

function addProjects(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const projects = data.projects;
  const financialRows = projects.rows.filter((p) => p.status !== "CANCELLED");
  const kpi = wb.addWorksheet("Проекты KPI");
  setCols(kpi, [48, 22]);
  appendTitle(kpi, "Проекты KPI", 2);
  addPeriodRow(kpi, data, 2);
  addSpacer(kpi);
  addDataTable(kpi, ["Метрика", "Значение"], [
    ["Всего проектов", projects.kpi.projectsTotal],
    ["Активные", projects.kpi.activeProjects],
    ["Завершенные", projects.kpi.completedProjects],
    ["Отмененные", projects.kpi.cancelledProjects],
    ["Архивные", projects.kpi.archivedProjects],
    ["С основной сметой", projects.kpi.withPrimaryEstimate],
    ["Без основной сметы", projects.kpi.withoutPrimaryEstimate],
    ["Со связанной заявкой", projects.kpi.withLinkedOrder],
    ["Без связанной заявки", projects.kpi.withoutLinkedOrder],
    ["Прогноз выручки, ₽", projects.kpi.forecastRevenueTotal],
    ["Прогноз маржи после налога, ₽", projects.kpi.forecastMarginAfterTax],
    ["Средняя маржинальность, %", projects.kpi.averageMarginAfterTaxPercent],
    ["Проекты без активности 7+ дней", projects.kpi.stale7Days],
    ["Проекты с низкой маржой", projects.kpi.lowMarginProjects],
  ]);

  const finances = wb.addWorksheet("Проекты финансы");
  setCols(finances, [34, 26, 18, 16, 16, 16, 16, 14, 14, 14]);
  appendTitle(finances, "Финансы проектов", 10);
  addPeriodRow(finances, data, 10);
  addSpacer(finances);
  addDataTable(
    finances,
    ["Проект", "Заказчик", "Статус", "Выручка", "Внутр.", "Комиссия", "Налог", "Маржа", "Маржа %", "Здоровье"],
    financialRows.map((p) => [
      p.title,
      p.customerName,
      p.status,
      p.financials.revenueTotal,
      p.financials.internalSubtotal,
      p.financials.commission,
      p.financials.tax,
      p.financials.marginAfterTax,
      p.financials.marginAfterTaxPct,
      p.healthScore,
    ]),
    { highlightNegativeColIdx: [7, 8], highlightPositiveColIdx: [7, 8] },
  );

  const risks = wb.addWorksheet("Проекты риски");
  setCols(risks, [34, 26, 18, 14, 14, 58]);
  appendTitle(risks, "Риски проектов", 6);
  addPeriodRow(risks, data, 6);
  addSpacer(risks);
  addDataTable(
    risks,
    ["Проект", "Заказчик", "Статус", "Дней без активности", "Здоровье", "Риски"],
    projects.risks.map((p) => [p.title, p.customerName, p.status, p.daysSinceActivity, p.healthScore, p.risks.join("; ")]),
  );

  const statuses = wb.addWorksheet("Проекты статусы");
  setCols(statuses, [28, 14, 22, 18]);
  appendTitle(statuses, "Статусы проектов", 4);
  addPeriodRow(statuses, data, 4);
  addSpacer(statuses);
  addDataTable(
    statuses,
    ["Статус", "Проектов", "Средний возраст статуса, дней", "Макс. возраст, дней"],
    projects.statusAging.map((r) => [r.status, r.projects, r.averageCurrentAgeDays, r.maxCurrentAgeDays]),
  );
}

function addCustomers(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const customers = wb.addWorksheet("Заказчики");
  setCols(customers, [32, 12, 12, 12, 12, 16, 16, 16, 16, 16, 12, 12]);
  appendTitle(customers, "Заказчики", 12);
  addPeriodRow(customers, data, 12);
  addSpacer(customers);
  addDataTable(
    customers,
    [
      "Заказчик",
      "Проектов",
      "Активные",
      "Заверш.",
      "Отмен.",
      "Прогноз выручки",
      "Маржа",
      "Факт заявок",
      "LTV mixed",
      "Средний проект",
      "Маржа %",
      "Отмены %",
    ],
    data.customers.rows.map((r) => [
      r.customerName,
      r.projectsCount,
      r.activeProjects,
      r.completedProjects,
      r.cancelledProjects,
      r.forecastRevenue,
      r.forecastMarginAfterTax,
      r.closedOrdersFactRevenue,
      r.ltvMixed,
      r.averageProjectRevenue,
      r.averageMarginAfterTaxPercent,
      r.cancelRatePercent,
    ]),
    { highlightNegativeColIdx: [6, 10], highlightPositiveColIdx: [6, 10] },
  );
}

function addMethodology(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Методология");
  setCols(ws, [24, 90]);
  appendTitle(ws, "Методология расчета", 2);
  addPeriodRow(ws, data, 2);
  addSpacer(ws);
  addDataTable(ws, ["Раздел", "Правило"], data.methodology.map((row) => [row.section, row.rule]));
}

export async function buildAdminAnalyticsXlsx(
  data: AdminAnalyticsData,
  section: AdminAnalyticsExportSection,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wowstorg Analytics";
  wb.created = new Date();

  if (section === "global") {
    addOverview(wb, data);
    addRequisites(wb, data);
    addProjects(wb, data);
    addCustomers(wb, data);
    addMethodology(wb, data);
  } else if (section === "requisites") {
    addRequisites(wb, data);
  } else if (section === "projects") {
    addProjects(wb, data);
  } else if (section === "customers") {
    addCustomers(wb, data);
  }

  for (const ws of wb.worksheets) {
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
