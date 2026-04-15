import ExcelJS from "exceljs";

import {
  calcProjectEstimateTotals,
  getNumericAmount,
  PROJECT_ESTIMATE_COMMISSION_RATE,
  PROJECT_ESTIMATE_TAX_RATE,
  roundMoney,
} from "@/lib/project-estimate-totals";
import type { ProjectEstimateReadLine, ProjectEstimateReadSection } from "@/server/projects/estimate-read-model";

const COLORS = {
  titleBg: "FF6D28D9",
  titleText: "FFFFFFFF",
  headerBg: "FFF5F3FF",
  headerText: "FF312E81",
  sectionReqBg: "FFEEE7FF",
  sectionLocalBg: "FFF8FAFC",
  sectionContractorBg: "FFFFF7ED",
  totalBg: "FFEDE9FE",
  totalText: "FF4C1D95",
  sectionFooterBg: "FFF1F5F9",
  border: "FFE4E4E7",
};

function styleCell(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.border } },
    left: { style: "thin", color: { argb: COLORS.border } },
    bottom: { style: "thin", color: { argb: COLORS.border } },
    right: { style: "thin", color: { argb: COLORS.border } },
  };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  cell.font = { name: "Calibri", size: 10 };
}

function lineClient(line: ProjectEstimateReadLine): number {
  return getNumericAmount(line.costClient);
}

function lineInternal(line: ProjectEstimateReadLine): number {
  return getNumericAmount(line.costInternal);
}

function unitLabel(line: ProjectEstimateReadLine): string {
  const u = line.unit?.trim();
  return u && u.length > 0 ? u : "шт";
}

function qtyLabel(line: ProjectEstimateReadLine): string | number {
  if (line.qty != null && Number.isFinite(Number(line.qty))) return Number(line.qty);
  return "";
}

function unitPriceLabel(line: ProjectEstimateReadLine): number | string {
  if (line.unitPriceClient != null && Number.isFinite(line.unitPriceClient)) return line.unitPriceClient;
  const c = lineClient(line);
  const q = line.qty != null ? Number(line.qty) : 0;
  if (c > 0 && q > 0) return roundMoney(c / q);
  return "";
}

function sectionTitle(section: ProjectEstimateReadSection): string {
  if (section.kind === "REQUISITE") {
    return `${section.title}${section.linkedOrderStatus ? ` · ${section.linkedOrderStatus}` : ""}`;
  }
  return section.title;
}

function sectionBg(section: ProjectEstimateReadSection): string {
  if (section.kind === "REQUISITE") return COLORS.sectionReqBg;
  if (section.kind === "CONTRACTOR") return COLORS.sectionContractorBg;
  return COLORS.sectionLocalBg;
}

export type ProjectEstimateXlsxVariant = "internal" | "client";

export async function buildProjectEstimateXlsx(args: {
  projectTitle: string;
  versionNumber: number;
  sections: ProjectEstimateReadSection[];
  /** internal — все колонки и подытоги; client — только клиентские поля и итоги для клиента. */
  variant?: ProjectEstimateXlsxVariant;
}) {
  const variant = args.variant ?? "internal";
  const isClient = variant === "client";

  const colCount = isClient ? 7 : 12;
  const widths = isClient
    ? [6, 28, 32, 10, 10, 14, 14]
    : [6, 26, 28, 10, 10, 12, 14, 12, 12, 14, 22, 18];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Wowstorg";
  wb.created = new Date();

  const ws = wb.addWorksheet(isClient ? "Смета (клиент)" : "Смета (внутр.)");
  ws.columns = widths.map((w) => ({ width: w }));

  ws.addRow([
    isClient ? `Смета для клиента · v${args.versionNumber}` : `Смета проекта (внутр.) · v${args.versionNumber}`,
  ]);
  ws.mergeCells(1, 1, 1, colCount);
  const title = ws.getCell(1, 1);
  styleCell(title);
  title.font = { name: "Calibri", size: 15, bold: true, color: { argb: COLORS.titleText } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.titleBg } };

  ws.addRow(["Проект", args.projectTitle]);
  ws.mergeCells(2, 2, 2, colCount);
  for (let col = 1; col <= colCount; col++) styleCell(ws.getCell(2, col));

  ws.addRow([]);

  const headerCells = isClient
    ? ["№", "Позиция", "Описание", "Ед. изм.", "Кол-во", "Цена за ед., ₽", "Сумма, ₽"]
    : [
        "№",
        "Позиция",
        "Описание",
        "Ед. изм.",
        "Кол-во",
        "Цена за ед., ₽",
        "Сумма, ₽",
        "Внутр., ₽",
        "Оплата",
        "Статус оплаты",
        "Коммент. подрядчику",
        "Реквизиты",
      ];
  ws.addRow(headerCells);
  const headerRow = ws.lastRow!.number;
  for (let col = 1; col <= colCount; col++) {
    const cell = ws.getCell(headerRow, col);
    styleCell(cell);
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
  }

  let clientSubtotal = 0;
  let internalSubtotal = 0;

  for (const section of args.sections) {
    const rowVals: (string | number)[] = ["", sectionTitle(section)];
    while (rowVals.length < colCount) rowVals.push("");
    ws.addRow(rowVals);
    const sectionRow = ws.lastRow!.number;
    ws.mergeCells(sectionRow, 2, sectionRow, colCount);
    for (let col = 1; col <= colCount; col++) {
      const cell = ws.getCell(sectionRow, col);
      styleCell(cell);
      cell.font = { name: "Calibri", size: 10, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sectionBg(section) } };
    }

    let sectionClient = 0;
    let sectionInternal = 0;

    for (const line of section.lines) {
      const client = lineClient(line);
      const internal = lineInternal(line);
      sectionClient += client;
      sectionInternal += internal;
      clientSubtotal += client;
      internalSubtotal += internal;

      if (isClient) {
        ws.addRow([
          line.lineNumber || "",
          line.name,
          line.description ?? "",
          unitLabel(line),
          qtyLabel(line),
          unitPriceLabel(line),
          client || "",
        ]);
      } else {
        const isContractor = section.kind === "CONTRACTOR";
        ws.addRow([
          line.lineNumber || "",
          line.name,
          line.description ?? "",
          unitLabel(line),
          qtyLabel(line),
          unitPriceLabel(line),
          client || "",
          internal || "",
          isContractor ? (line.paymentMethod ?? "") : "",
          isContractor ? (line.paymentStatus ?? "") : "",
          isContractor ? (line.contractorNote ?? "") : "",
          isContractor ? (line.contractorRequisites ?? "") : "",
        ]);
      }
      const row = ws.lastRow!.number;
      for (let col = 1; col <= colCount; col++) styleCell(ws.getCell(row, col));
      if (isClient) {
        ws.getCell(row, 6).numFmt = "#,##0.00";
        ws.getCell(row, 7).numFmt = "#,##0.00";
      } else {
        ws.getCell(row, 6).numFmt = "#,##0.00";
        ws.getCell(row, 7).numFmt = "#,##0.00";
        ws.getCell(row, 8).numFmt = "#,##0.00";
      }
    }

    if (isClient) {
      ws.addRow(["", "", "", "", "", "Итого по разделу", sectionClient]);
      const sr = ws.lastRow!.number;
      ws.mergeCells(sr, 1, sr, 5);
      for (let col = 1; col <= colCount; col++) {
        const cell = ws.getCell(sr, col);
        styleCell(cell);
        cell.font = { name: "Calibri", size: 10, bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.sectionFooterBg } };
      }
      ws.getCell(sr, 7).numFmt = "#,##0.00";
    } else {
      const sectionTotals = calcProjectEstimateTotals({
        clientSubtotal: sectionClient,
        internalSubtotal: sectionInternal,
      });
      const footerRows: [string, number][] = [
        ["Выручка (клиент), раздел", sectionClient],
        [`Комиссия ${roundMoney(PROJECT_ESTIMATE_COMMISSION_RATE * 100)}%, раздел`, sectionTotals.commission],
        ["Выручка с комиссией, раздел", sectionTotals.revenueTotal],
        ["Внутр., раздел", sectionInternal],
        ["Валовая маржа, раздел", sectionTotals.grossMargin],
        [`Условный налог ${roundMoney(PROJECT_ESTIMATE_TAX_RATE * 100)}% (от выручки раздела с комиссией)`, sectionTotals.tax],
        ["Маржа после условного налога, раздел", sectionTotals.marginAfterTax],
      ];
      for (const [label, value] of footerRows) {
        const cells: (string | number)[] = [label, "", "", "", "", "", value];
        while (cells.length < colCount) cells.push("");
        ws.addRow(cells);
        const fr = ws.lastRow!.number;
        ws.mergeCells(fr, 1, fr, 6);
        for (let col = 1; col <= colCount; col++) {
          const cell = ws.getCell(fr, col);
          styleCell(cell);
          cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: COLORS.totalText } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.sectionFooterBg } };
        }
        ws.getCell(fr, 7).numFmt = "#,##0.00";
      }
    }

    ws.addRow([]);
  }

  const projectTotals = calcProjectEstimateTotals({ clientSubtotal, internalSubtotal });

  if (isClient) {
    const tail: [string, number][] = [
      ["Сумма по смете (клиент)", clientSubtotal],
      [`Комиссия ${roundMoney(PROJECT_ESTIMATE_COMMISSION_RATE * 100)}%`, projectTotals.commission],
      ["Итого с комиссией", projectTotals.revenueTotal],
    ];
    for (const [label, value] of tail) {
      const cells: (string | number)[] = [label, "", "", "", "", "", value];
      ws.addRow(cells);
      const row = ws.lastRow!.number;
      ws.mergeCells(row, 1, row, 6);
      for (let col = 1; col <= colCount; col++) {
        const cell = ws.getCell(row, col);
        styleCell(cell);
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.totalText } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
      }
      ws.getCell(row, 7).numFmt = "#,##0.00";
    }
  } else {
    const tail: [string, number][] = [
      ["Сумма клиентских строк (проект)", clientSubtotal],
      [`Комиссия ${roundMoney(PROJECT_ESTIMATE_COMMISSION_RATE * 100)}%`, projectTotals.commission],
      ["Итого клиент (с комиссией)", projectTotals.revenueTotal],
      ["Себестоимость (проект)", internalSubtotal],
      ["Валовая маржа (проект)", projectTotals.grossMargin],
      [`Условный налог ${roundMoney(PROJECT_ESTIMATE_TAX_RATE * 100)}% (от выручки проекта с комиссией)`, projectTotals.tax],
      ["Маржа после условного налога (проект)", projectTotals.marginAfterTax],
    ];
    for (const [label, value] of tail) {
      const cells: (string | number)[] = [label, "", "", "", "", "", value];
      while (cells.length < colCount) cells.push("");
      ws.addRow(cells);
      const row = ws.lastRow!.number;
      ws.mergeCells(row, 1, row, 6);
      for (let col = 1; col <= colCount; col++) {
        const cell = ws.getCell(row, col);
        styleCell(cell);
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.totalText } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
      }
      ws.getCell(row, 7).numFmt = "#,##0.00";
    }
  }

  ws.views = [{ state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
