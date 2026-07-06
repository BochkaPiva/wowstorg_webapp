import ExcelJS from "exceljs";
import sharp from "sharp";

import { getItemPhoto } from "@/server/file-storage";

type ExportItem = {
  id: string;
  name: string;
  description: string | null;
  type: "ASSET" | "BULK" | "CONSUMABLE";
  isActive: boolean;
  internalOnly: boolean;
  pricePerDay: unknown;
  purchasePricePerUnit: unknown;
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
  photo1Key: string | null;
  photo2Key: string | null;
  updatedAt: Date;
  categories: Array<{ category: { name: string } }>;
};

const COLORS = {
  ink: "FF111827",
  muted: "FF6B7280",
  violet: "FF7C3AED",
  violetDark: "FF4C1D95",
  violetSoft: "FFF4F0FF",
  yellowSoft: "FFFFF8E1",
  greenSoft: "FFEAFBF2",
  redSoft: "FFFFF1F2",
  slateSoft: "FFF8FAFC",
  white: "FFFFFFFF",
  border: "FFE5E7EB",
  borderStrong: "FFC4B5FD",
};

const FONT = "Aptos";

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown) {
  return toNumber(value);
}

function availableNow(item: Pick<ExportItem, "total" | "inRepair" | "broken" | "missing">) {
  return Math.max(0, item.total - item.inRepair - item.broken - item.missing);
}

function typeLabel(type: ExportItem["type"]) {
  if (type === "ASSET") return "Штучный";
  if (type === "BULK") return "Мерный";
  return "Расходник";
}

function rubFormat() {
  return '# ##0 ₽';
}

function border(color = COLORS.border): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  };
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    bg?: string;
    color?: string;
    bold?: boolean;
    size?: number;
    align?: Partial<ExcelJS.Alignment>;
    borderColor?: string;
  } = {},
) {
  cell.font = {
    name: FONT,
    size: opts.size ?? 11,
    bold: opts.bold ?? false,
    color: { argb: opts.color ?? COLORS.ink },
  };
  if (opts.bg) cell.fill = fill(opts.bg);
  cell.border = border(opts.borderColor);
  cell.alignment = {
    vertical: "middle",
    wrapText: true,
    ...opts.align,
  };
}

async function loadPhotoForXlsx(key: string | null) {
  if (!key) return null;
  try {
    const source = await getItemPhoto(key);
    if (!source) return null;
    return sharp(source)
      .rotate()
      .resize({ width: 220, height: 160, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (e) {
    console.warn("[inventory-export] photo skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function buildInventoryPositionsExportXlsx(items: ExportItem[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WowStorg";
  workbook.created = new Date();
  workbook.modified = new Date();

  const ws = workbook.addWorksheet("Реквизит", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: "number", width: 7 },
    { key: "photo1", width: 18 },
    { key: "photo2", width: 18 },
    { key: "name", width: 32 },
    { key: "categories", width: 28 },
    { key: "type", width: 16 },
    { key: "price", width: 16 },
    { key: "purchase", width: 16 },
    { key: "total", width: 11 },
    { key: "available", width: 12 },
    { key: "repair", width: 11 },
    { key: "broken", width: 11 },
    { key: "missing", width: 11 },
    { key: "status", width: 16 },
    { key: "visibility", width: 18 },
    { key: "description", width: 46 },
    { key: "updated", width: 16 },
    { key: "id", width: 26 },
  ];

  ws.mergeCells("A1:R1");
  ws.getCell("A1").value = "Каталог реквизита WowStorg";
  styleCell(ws.getCell("A1"), {
    bg: COLORS.violetDark,
    color: COLORS.white,
    bold: true,
    size: 20,
    align: { horizontal: "center" },
    borderColor: COLORS.violetDark,
  });
  ws.getRow(1).height = 32;

  ws.mergeCells("A2:R2");
  ws.getCell("A2").value = `Позиций: ${items.length} · выгружено ${new Date().toLocaleString("ru-RU")}`;
  styleCell(ws.getCell("A2"), {
    bg: COLORS.violetSoft,
    color: COLORS.muted,
    size: 11,
    align: { horizontal: "center" },
    borderColor: COLORS.borderStrong,
  });
  ws.getRow(2).height = 24;

  ws.addRow([]);
  const header = ws.addRow([
    "№",
    "Фото 1",
    "Фото 2",
    "Название",
    "Категории",
    "Тип",
    "Цена/сутки",
    "Закуп/ед.",
    "Всего",
    "Доступно",
    "Ремонт",
    "Сломано",
    "Утеряно",
    "Статус",
    "Видимость",
    "Описание",
    "Обновлено",
    "ID",
  ]);
  header.height = 28;
  header.eachCell((cell) =>
    styleCell(cell, {
      bg: COLORS.violet,
      color: COLORS.white,
      bold: true,
      align: { horizontal: "center" },
      borderColor: COLORS.violet,
    }),
  );

  for (const [idx, item] of items.entries()) {
    const categories = item.categories.map((c) => c.category.name).filter(Boolean).join(", ");
    const row = ws.addRow([
      idx + 1,
      item.photo1Key ? "" : "нет фото",
      item.photo2Key ? "" : "нет фото",
      item.name,
      categories,
      typeLabel(item.type),
      money(item.pricePerDay),
      item.purchasePricePerUnit == null ? null : money(item.purchasePricePerUnit),
      item.total,
      availableNow(item),
      item.inRepair,
      item.broken,
      item.missing,
      item.isActive ? "Активна" : "Неактивна",
      item.internalOnly ? "Внутренняя" : "Каталог",
      item.description ?? "",
      item.updatedAt,
      item.id,
    ]);
    row.height = 78;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const bg =
        !item.isActive
          ? COLORS.slateSoft
          : item.internalOnly
            ? COLORS.yellowSoft
            : colNumber === 10 && availableNow(item) <= 0
              ? COLORS.redSoft
              : COLORS.white;
      styleCell(cell, {
        bg,
        bold: colNumber === 4 || colNumber === 7,
        align: colNumber <= 3 || (colNumber >= 7 && colNumber <= 13)
          ? { horizontal: "center" }
          : undefined,
      });
    });

    row.getCell(7).numFmt = rubFormat();
    row.getCell(8).numFmt = rubFormat();
    row.getCell(17).numFmt = "dd.mm.yyyy";

    const photo1 = await loadPhotoForXlsx(item.photo1Key);
    if (photo1) {
      const imageId = workbook.addImage({ base64: photo1.toString("base64"), extension: "png" });
      ws.addImage(imageId, {
        tl: { col: 1.15, row: row.number - 0.85 },
        ext: { width: 82, height: 60 },
        editAs: "oneCell",
      });
    }

    const photo2 = await loadPhotoForXlsx(item.photo2Key);
    if (photo2) {
      const imageId = workbook.addImage({ base64: photo2.toString("base64"), extension: "png" });
      ws.addImage(imageId, {
        tl: { col: 2.15, row: row.number - 0.85 },
        ext: { width: 82, height: 60 },
        editAs: "oneCell",
      });
    }
  }

  ws.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number, column: ws.columnCount },
  };

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.protection = { locked: false };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
