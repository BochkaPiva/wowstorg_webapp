import ExcelJS from "exceljs";

import type { ProjectEstimateReadSection } from "@/server/projects/estimate-read-model";

const COLORS = {
  titleBg: "FF6D28D9",
  titleText: "FFFFFFFF",
  headerBg: "FFF5F3FF",
  headerText: "FF312E81",
  sectionReqBg: "FFEEE7FF",
  sectionLocalBg: "FFF8FAFC",
  totalBg: "FFEDE9FE",
  totalText: "FF4C1D95",
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
  cell.font = { name: "Calibri", size: 11 };
}

export async function buildProjectEstimateXlsx(args: {
  projectTitle: string;
  versionNumber: number;
  sections: ProjectEstimateReadSection[];
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wowstorg";
  wb.created = new Date();

  const ws = wb.addWorksheet("Смета проекта");
  ws.columns = [
    { width: 8 },
    { width: 38 },
    { width: 42 },
    { width: 16 },
    { width: 16 },
  ];

  ws.addRow([`Смета проекта · v${args.versionNumber}`]);
  ws.mergeCells(1, 1, 1, 5);
  const title = ws.getCell(1, 1);
  styleCell(title);
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: COLORS.titleText } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.titleBg } };

  ws.addRow(["Проект", args.projectTitle]);
  ws.mergeCells(2, 2, 2, 5);
  for (let col = 1; col <= 5; col++) styleCell(ws.getCell(2, col));

  ws.addRow([]);

  ws.addRow(["№", "Позиция", "Описание", "Клиент, ₽", "Внутр., ₽"]);
  const headerRow = ws.lastRow!.number;
  for (let col = 1; col <= 5; col++) {
    const cell = ws.getCell(headerRow, col);
    styleCell(cell);
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
  }

  let clientSubtotal = 0;
  let internalSubtotal = 0;

  for (const section of args.sections) {
    ws.addRow([
      "",
      section.kind === "REQUISITE"
        ? `${section.title}${section.linkedOrderStatus ? ` · ${section.linkedOrderStatus}` : ""}`
        : section.title,
      "",
      "",
      "",
    ]);
    const sectionRow = ws.lastRow!.number;
    ws.mergeCells(sectionRow, 2, sectionRow, 5);
    for (let col = 1; col <= 5; col++) {
      const cell = ws.getCell(sectionRow, col);
      styleCell(cell);
      cell.font = { name: "Calibri", size: 11, bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: section.kind === "REQUISITE" ? COLORS.sectionReqBg : COLORS.sectionLocalBg },
      };
    }

    for (const line of section.lines) {
      const client = line.costClient != null ? Number(line.costClient) : 0;
      const internal = line.costInternal != null ? Number(line.costInternal) : 0;
      clientSubtotal += Number.isFinite(client) ? client : 0;
      internalSubtotal += Number.isFinite(internal) ? internal : 0;

      ws.addRow([
        line.lineNumber || "",
        line.name,
        line.description ?? "",
        client || "",
        internal || "",
      ]);
      const row = ws.lastRow!.number;
      for (let col = 1; col <= 5; col++) styleCell(ws.getCell(row, col));
      ws.getCell(row, 4).numFmt = "#,##0.00";
      ws.getCell(row, 5).numFmt = "#,##0.00";
    }

    ws.addRow([]);
  }

  const commission = Math.round(clientSubtotal * 0.15);
  const total = clientSubtotal + commission;
  const rows = [
    ["Сумма клиентских строк", clientSubtotal],
    ["Комиссия 15%", commission],
    ["Итого клиент", total],
    ["Себестоимость", internalSubtotal],
  ] as const;

  for (const [label, value] of rows) {
    ws.addRow([label, "", "", "", value]);
    const row = ws.lastRow!.number;
    ws.mergeCells(row, 1, row, 4);
    for (let col = 1; col <= 5; col++) {
      const cell = ws.getCell(row, col);
      styleCell(cell);
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.totalText } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
    }
    ws.getCell(row, 5).numFmt = "#,##0.00";
  }

  ws.views = [{ state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
