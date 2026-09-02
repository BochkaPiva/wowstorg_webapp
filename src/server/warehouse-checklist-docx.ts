import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

export type WarehouseChecklistLine = {
  number: number;
  name: string;
  quantity: number | string;
  days?: number | null;
  comment?: string | null;
};

export type WarehouseChecklistSection = {
  title: string;
  lines: WarehouseChecklistLine[];
};

const TABLE_WIDTH = 15_400;
const COLUMN_WIDTHS = [620, 4_200, 1_000, 1_000, 1_400, 5_780, 1_400] as const;
const CELL_MARGINS = { top: 90, bottom: 90, left: 110, right: 110 } as const;
const GRID_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "D8D8D4" } as const;

function textParagraph(text: string, options?: {
  bold?: boolean;
  size?: number;
  color?: string;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
}) {
  return new Paragraph({
    alignment: options?.alignment,
    spacing: { before: 0, after: 0, line: 260 },
    children: [new TextRun({
      text,
      font: "Calibri",
      size: options?.size ?? 18,
      bold: options?.bold,
      color: options?.color ?? "202020",
    })],
  });
}

function cell(text: string, width: number, options?: {
  bold?: boolean;
  fill?: string;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  size?: number;
}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    shading: options?.fill
      ? { fill: options.fill, color: "auto", type: ShadingType.CLEAR }
      : undefined,
    children: [textParagraph(text, {
      bold: options?.bold,
      size: options?.size,
      alignment: options?.alignment,
    })],
  });
}

function headerRow() {
  const titles = ["№", "Позиция", "Кол-во", "Дней", "Собрано", "Комментарий", "Забрали"];
  return new TableRow({
    tableHeader: true,
    cantSplit: true,
    height: { value: 520, rule: HeightRule.ATLEAST },
    children: titles.map((title, index) => cell(title, COLUMN_WIDTHS[index], {
      bold: true,
      fill: index === 4 || index === 6 ? "FFF2B8" : "EEEAF7",
      alignment: index === 1 || index === 5 ? AlignmentType.LEFT : AlignmentType.CENTER,
      size: 18,
    })),
  });
}

function sectionRow(title: string) {
  return new TableRow({
    cantSplit: true,
    children: [new TableCell({
      columnSpan: COLUMN_WIDTHS.length,
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      margins: { top: 90, bottom: 90, left: 140, right: 140 },
      shading: { fill: "F7F6F2", color: "auto", type: ShadingType.CLEAR },
      children: [textParagraph(title, { bold: true, size: 18, color: "5B21B6" })],
    })],
  });
}

function lineRow(line: WarehouseChecklistLine) {
  return new TableRow({
    cantSplit: true,
    height: { value: 760, rule: HeightRule.ATLEAST },
    children: [
      cell(String(line.number), COLUMN_WIDTHS[0], { alignment: AlignmentType.CENTER }),
      cell(line.name || "—", COLUMN_WIDTHS[1], { bold: true }),
      cell(String(line.quantity), COLUMN_WIDTHS[2], { alignment: AlignmentType.CENTER, bold: true }),
      cell(line.days == null ? "" : String(line.days), COLUMN_WIDTHS[3], { alignment: AlignmentType.CENTER }),
      cell("☐", COLUMN_WIDTHS[4], { alignment: AlignmentType.CENTER, size: 28 }),
      cell(line.comment?.trim() ?? "", COLUMN_WIDTHS[5]),
      cell("☐", COLUMN_WIDTHS[6], { alignment: AlignmentType.CENTER, size: 28 }),
    ],
  });
}

function formatMetaDate(value: Date | null | undefined) {
  if (!value) return "не указана";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(value);
}

export async function buildWarehouseChecklistDocx(args: {
  title: string;
  customerName?: string | null;
  createdByName?: string | null;
  readyByDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  sections: WarehouseChecklistSection[];
}): Promise<Buffer> {
  const nonEmptySections = args.sections.filter((section) => section.lines.length > 0);
  const lineCount = nonEmptySections.reduce((sum, section) => sum + section.lines.length, 0);
  const showSectionTitles = nonEmptySections.length > 1 || nonEmptySections.some((section) => section.title !== "Состав заявки");

  const rows: TableRow[] = [headerRow()];
  for (const section of nonEmptySections) {
    if (showSectionTitles) rows.push(sectionRow(section.title));
    rows.push(...section.lines.map(lineRow));
  }
  if (lineCount === 0) {
    rows.push(new TableRow({
      height: { value: 900, rule: HeightRule.ATLEAST },
      children: [new TableCell({
        columnSpan: COLUMN_WIDTHS.length,
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        margins: CELL_MARGINS,
        children: [textParagraph("В смете пока нет складских позиций.", { alignment: AlignmentType.CENTER, color: "71717A" })],
      })],
    }));
  }

  const period = args.startDate || args.endDate
    ? `${formatMetaDate(args.startDate)} — ${formatMetaDate(args.endDate)}`
    : "не указан";

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 20, color: "202020" },
          paragraph: { spacing: { after: 120, line: 300 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          // docx меняет width/height местами при LANDSCAPE, поэтому задаём исходный A4 portrait.
          size: { width: 11_906, height: 16_838, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 560, right: 600, bottom: 560, left: 600, header: 320, footer: 320 },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 0, after: 0 },
            children: [
              new TextRun({ text: "ВАУСТОРГ · складской чек-лист · ", font: "Calibri", size: 16, color: "777777" }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16, color: "777777" }),
              new TextRun({ text: " / ", font: "Calibri", size: 16, color: "777777" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Calibri", size: 16, color: "777777" }),
            ],
          })],
        }),
      },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 40 },
          children: [new TextRun({ text: "ЧЕК-ЛИСТ КОМПЛЕКТАЦИИ", font: "Calibri", size: 22, bold: true, color: "6D28D9", characterSpacing: 30 })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 80, line: 320 },
          children: [new TextRun({ text: args.title || "Без названия", font: "Calibri", size: 34, bold: true, color: "111111" })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 120, line: 260 },
          children: [
            new TextRun({ text: "Заказчик: ", font: "Calibri", size: 18, bold: true }),
            new TextRun({ text: args.customerName?.trim() || "не указан", font: "Calibri", size: 18 }),
            new TextRun({ text: "     Оформил: ", font: "Calibri", size: 18, bold: true }),
            new TextRun({ text: args.createdByName?.trim() || "не указан", font: "Calibri", size: 18 }),
            new TextRun({ text: "     Подготовить к: ", font: "Calibri", size: 18, bold: true }),
            new TextRun({ text: formatMetaDate(args.readyByDate), font: "Calibri", size: 18 }),
            new TextRun({ text: "     Период: ", font: "Calibri", size: 18, bold: true }),
            new TextRun({ text: period, font: "Calibri", size: 18 }),
            new TextRun({ text: `     Позиций: ${lineCount}`, font: "Calibri", size: 18, bold: true }),
          ],
        }),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          indent: { size: 120, type: WidthType.DXA },
          columnWidths: [...COLUMN_WIDTHS],
          layout: TableLayoutType.FIXED,
          margins: CELL_MARGINS,
          borders: { top: GRID_BORDER, bottom: GRID_BORDER, left: GRID_BORDER, right: GRID_BORDER, insideHorizontal: GRID_BORDER, insideVertical: GRID_BORDER },
          rows,
        }),
      ],
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
