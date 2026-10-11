import { z } from "zod";
import { createHash } from "node:crypto";
import { proposalBudget } from "@/lib/proposal-summary";
import { proposalMoney, type Proposal, type ProposalItem } from "@/lib/proposals";

export const EXPORT_ADAPTER = "wowstorg-template-v2";
export const LEGACY_EXPORT_ADAPTER = "wowstorg-template-v1";
const PhotoSchema = z.object({ jpeg: z.string().max(600_000), width: z.number().int().positive().max(960), height: z.number().int().positive().max(960) }).strict();
const ItemSchema = z.object({
  title: z.string().max(200), contractor: z.string().max(300), description: z.string().nullable(),
  note: z.string().nullable(), quantity: z.number().positive(), unit: z.string().nullable(),
  role: z.enum(["PRIMARY", "OPTIONAL", "ALTERNATIVE"]), price: z.string(), photo: PhotoSchema.nullable(),
}).strict();
export const ExportDocumentSchema = z.object({
  adapter: z.enum([LEGACY_EXPORT_ADAPTER, EXPORT_ADAPTER]), proposalId: z.string(), revision: z.number().int(), variantId: z.string(),
  title: z.string(), variantTitle: z.string(), intro: z.string().nullable(), outro: z.string().nullable(),
  budget: z.string(), budgetDetail: z.string(),
  sections: z.array(z.object({ title: z.string(), items: z.array(ItemSchema).max(200) }).strict()).max(100),
}).strict();
export type ExportDocument = z.infer<typeof ExportDocumentSchema>;
export type ExportPhoto = z.infer<typeof PhotoSchema>;

// JSONB may reorder object keys. Hash a recursive canonical representation, not insertion order.
export function exportChecksum(document: ExportDocument): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return createHash("sha256").update(JSON.stringify(canonical(document))).digest("hex");
}

/** Explicit allowlist. No spread of internal read models into client documents. */
export function projectClientDocument(proposal: Proposal, variantId: string): ExportDocument {
  const variant = proposal.variants.find(variant => variant.id === variantId);
  if (!variant) throw new Error("VARIANT_NOT_FOUND");
  const all = variant.sections.flatMap(section => section.items);
  if (all.length > 200 || variant.sections.length > 100) throw new Error("EXPORT_TOO_LARGE");
  const budget = proposalBudget(all);
  const price = (item: ProposalItem) => item.clientUnitPrice == null ? "По запросу" : `${item.priceTypeSnapshot === "FROM" || item.priceTypeSnapshot === "RANGE" ? "от " : ""}${proposalMoney(Math.round(item.clientUnitPrice * item.qty * 100) / 100)}`;
  return ExportDocumentSchema.parse({
    adapter: EXPORT_ADAPTER, proposalId: proposal.id, revision: proposal.revision, variantId,
    title: proposal.title, variantTitle: variant.title, intro: proposal.clientIntro, outro: proposal.clientOutro,
    budget: budget.label, budgetDetail: budget.detail,
    sections: variant.sections.map(section => ({ title: section.title, items: section.items.filter(item => item.selectionRole !== "EXCLUDED").map(item => ({
      title: item.offerTitleSnapshot, contractor: item.contractorNameSnapshot,
      description: item.offerDescriptionSnapshot, note: item.clientNote,
      quantity: item.qty, unit: item.unitLabel, role: item.selectionRole, price: price(item), photo: null,
    })) })).filter(section => section.items.length),
  });
}

export type ExportText = { x: number; y: number; width: number; height: number; size: number; text: string; color?: string; bold?: boolean; lineHeight?: number };
export type ExportPage = { background: 2 | 5 | 7; texts: ExportText[]; photo?: ExportPhoto; photoBox?: { x: number; y: number; width: number; height: number }; };
export const ROLE_COPY = { PRIMARY: "Включено в основной состав", ALTERNATIVE: "Альтернатива, отдельно от итога", OPTIONAL: "Дополнительная опция, отдельно от итога" };

/** Conservative wrapping, including long unbroken tokens. Identical page plan for both adapters. */
export type TextMeasure = (text: string, size: number) => number;
export function wrapExportText(text: string, columns: number, measure?: TextMeasure, size = 22, width = columns * size * .62): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/·/g, " / ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const tokens = Array.from(word);
      while (tokens.length > columns || measure && measure(tokens.join(""), size) > width) {
        if (line) { lines.push(line); line = ""; }
        let count = Math.min(tokens.length, columns);
        while (count > 1 && measure && measure(tokens.slice(0, count).join(""), size) > width) count--;
        lines.push(tokens.splice(0, count).join(""));
      }
      const rest = tokens.join("");
      if (!rest) continue;
      if (line && (Array.from(line).length + rest.length + 1 > columns || measure && measure(`${line} ${rest}`, size) > width)) { lines.push(line); line = rest; }
      else line += `${line ? " " : ""}${rest}`;
    }
    lines.push(line);
  }
  return lines;
}
function chunks<T>(values: T[], count: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / count) }, (_, i) => values.slice(i * count, (i + 1) * count));
}
export function planExportPages(document: ExportDocument, measure?: TextMeasure): ExportPage[] {
  return document.adapter === LEGACY_EXPORT_ADAPTER ? planExportPagesV1(document, measure) : planExportPagesV2(document, measure);
}

// Immutable v1 snapshots keep their original geometry. Do not silently restyle them.
function planExportPagesV1(document: ExportDocument, measure?: TextMeasure): ExportPage[] {
  const wrap = (text: string, columns: number, size = 22, width = columns * size * .62) => wrapExportText(text, columns, measure, size, width);
  const titleText = (text: string): ExportText => {
    let size = 28;
    while (size > 14 && wrap(text, 200, size, 1060).length * size * 1.2 > 96) size--;
    return { x: 88, y: 18, width: 1060, height: 96, size, text: wrap(text, 200, size, 1060).join("\n"), bold: true };
  };
  const pages: ExportPage[] = [];
  const variantLines = wrap(document.variantTitle, 44, 20, 620);
  for (const [i, title] of chunks(wrap(document.title, 32, 40, 760), 4).entries()) {
    pages.push({ background: 2, texts: [
      { x: 260, y: 120, width: 760, height: 210, size: 40, text: title.join("\n"), bold: true },
      { x: 335, y: 340, width: 620, height: 78, size: 22, text: i ? "Коммерческое предложение, продолжение" : "Коммерческое предложение" },
      ...(!i && variantLines.length <= 2 ? [{ x: 335, y: 458, width: 620, height: 50, size: 20, text: variantLines.join("\n") }] : []),
    ] });
  }
  const addProse = (title: string, body: string | null) => {
    if (!body?.trim()) return;
    chunks(wrap(body, 75, 24, 1080), 14).forEach(lines => pages.push({ background: 7, texts: [titleText(title), { x: 88, y: 166, width: 1080, height: 420, size: 24, text: lines.join("\n") }] }));
  };
  if (variantLines.length > 2) addProse("Вариант мероприятия", document.variantTitle);
  addProse("О мероприятии", document.intro);
  for (const section of document.sections) for (const item of section.items) {
    const width = item.photo ? 600 : 1080;
    const title = wrap(item.title, item.photo ? 36 : 64, 26, width).join("\n");
    const titleHeight = Math.max(2, title.split("\n").length) * 32;
    const bodyY = 145 + titleHeight + 14;
    const parts = chunks(wrap([item.contractor, `Количество: ${item.quantity} ${item.unit ?? "шт."}`, item.description, item.note].filter(Boolean).join("\n\n"), item.photo ? 43 : 75, 22, width), Math.max(1, Math.floor((560 - bodyY) / 26.4)));
    for (const [index, lines] of (parts.length ? parts : [[]]).entries()) {
      const x = item.photo ? 580 : 88, width = item.photo ? 600 : 1080;
      pages.push({ background: 7, ...(item.photo ? { photo: item.photo } : {}), texts: [
        titleText(section.title),
        { x, y: 145, width, height: titleHeight, size: 26, text: title, bold: true },
        { x, y: bodyY, width, height: 560 - bodyY, size: 22, text: lines.join("\n") },
        { x, y: 572, width, height: 28, size: 20, text: item.price, color: "FFEC00", bold: true },
        { x, y: 610, width, height: 42, size: 16, text: wrap(index ? `${ROLE_COPY[item.role]}. Продолжение` : ROLE_COPY[item.role], 60, 16, width).join("\n") },
      ] });
    }
  }
  const primary = document.sections.flatMap(section => section.items.filter(item => item.role === "PRIMARY"));
  const rows = primary.flatMap(item => wrap(`${item.title}: ${item.price}`, 70, 23, 1080));
  for (const group of (chunks(rows, 10).length ? chunks(rows, 10) : [[]])) pages.push({ background: 7, texts: [
    titleText("Бюджет мероприятия"),
    { x: 88, y: 160, width: 1080, height: 300, size: 23, text: group.join("\n") },
    { x: 88, y: 480, width: 1080, height: 44, size: 32, text: document.budget, color: "FFEC00", bold: true },
    { x: 88, y: 540, width: 1080, height: 30, size: 18, text: document.budgetDetail },
    { x: 88, y: 586, width: 1080, height: 55, size: 17, text: "Альтернативы и дополнительные опции не входят в итог.\nНаличие и финальную стоимость уточняем перед согласованием." },
  ] });
  addProse("Условия и комментарии", document.outro);
  if (pages.length > 300) throw new Error("EXPORT_TOO_LARGE");
  return pages;
}

/** Fixed typographic hierarchy and one bounded layout shared by PDF and editable PPTX. */
function planExportPagesV2(document: ExportDocument, measure?: TextMeasure): ExportPage[] {
  const wrap = (text: string, size: number, width: number) => wrapExportText(text, Math.max(1, Math.floor(width / (size * .62))), measure, size, width);
  const block = (text: string, x: number, y: number, width: number, size: number, lineHeight = size * 1.2, color = "FFFFFF"): ExportText => ({ x, y, width, size, lineHeight, height: text.split("\n").length * lineHeight, text, color });
  const pages: ExportPage[] = [];
  const push = (page: ExportPage) => {
    if (pages.length >= 300) throw new Error("EXPORT_TOO_LARGE");
    pages.push(page);
  };
  const header = (title: string): ExportText => {
    let size = 26;
    while (size > 14 && wrap(title, size, 1060).length * size * 1.2 > 96) size--;
    return block(wrap(title, size, 1060).join("\n"), 88, 18, 1060, size);
  };
  const variantLines = wrap(document.variantTitle, 20, 620);
  for (const [index, lines] of chunks(wrap(document.title, 48, 760), 3).entries()) push({ background: 2, texts: [
    block(lines.join("\n"), 260, 128, 760, 48, 58),
    block(index ? "Коммерческое предложение, продолжение" : "Коммерческое предложение", 335, 344, 620, 22),
    ...(!index && variantLines.length <= 2 ? [block(variantLines.join("\n"), 335, 458, 620, 20, 24)] : []),
  ] });
  const prose = (title: string, body: string | null) => {
    if (!body?.trim()) return;
    for (const lines of chunks(wrap(body, 24, 1080), 14)) push({ background: 7, texts: [header(title), block(lines.join("\n"), 88, 164, 1080, 24, 32)] });
  };
  if (variantLines.length > 2) prose("Вариант мероприятия", document.variantTitle);
  prose("О мероприятии", document.intro);
  for (const section of document.sections) for (const item of section.items) {
    const x = item.photo ? 580 : 88, width = item.photo ? 600 : 1080;
    const titleGroups = chunks(wrap(item.title, 40, width), 3);
    const titleLines = titleGroups.at(-1) ?? [""];
    const makePage = (lines: string[]): ExportPage => ({ background: 7,
      ...(item.photo ? { photo: item.photo, photoBox: { x: 88, y: 164, width: 440, height: 430 } } : {}),
      texts: [header(section.title), block(lines.join("\n"), x, 160, width, 40, 48)],
    });
    // Extremely long names get continuation slides, never microscopic type or clipping.
    for (const lines of titleGroups.slice(0, -1)) push(makePage(lines));
    let page = makePage(titleLines);
    const bodyTop = 160 + titleLines.length * 48 + 18;
    let y = bodyTop;
    const footer = () => {
      page.texts.push(block(item.price, x, 582, width, 32, 40, "FFEC00"));
      page.texts.push(block(wrap(ROLE_COPY[item.role], 17, width).join("\n"), x, 632, width, 17, 21));
      push(page);
    };
    const flow = (value: string | null, size: number, color = "FFFFFF", gap = 12) => {
      if (!value?.trim()) return;
      const lineHeight = size * 1.3;
      for (const line of wrap(value, size, width)) {
        if (y + lineHeight > 562) { footer(); page = makePage(titleLines); y = bodyTop; }
        page.texts.push(block(line, x, y, width, size, lineHeight, color));
        y += lineHeight;
      }
      y += gap;
    };
    flow(item.contractor, 21, "F0E4F6", 8);
    flow(`Количество: ${item.quantity} ${item.unit ?? "шт."}`, 17, "F0E4F6", 18);
    flow(item.description, 24);
    if (item.note?.trim()) { flow("Комментарий для вас", 17, "FFEC00", 6); flow(item.note, 22); }
    footer();
  }
  const primary = document.sections.flatMap(section => section.items.filter(item => item.role === "PRIMARY"));
  const rows = primary.flatMap(item => wrap(`${item.title}: ${item.price}`, 25, 1080));
  const detail = wrap(document.budgetDetail, 18, 1080);
  for (const group of (chunks(rows, 9).length ? chunks(rows, 9) : [[]])) push({ background: 7, texts: [
    header("Бюджет мероприятия"),
    block(group.join("\n"), 88, 164, 1080, 25, 32),
    block(document.budget, 88, 488, 1080, 44, 54, "FFEC00"),
    ...(detail.length <= 2 ? [block(detail.join("\n"), 88, 562, 1080, 18, 23)] : []),
    block("Опции и альтернативы — отдельно от итога.\nНаличие и финальную стоимость согласуем с вами.", 88, 610, 1080, 17, 21),
  ] });
  if (detail.length > 2) prose("Пояснение к бюджету", document.budgetDetail);
  prose("Условия и комментарии", document.outro);
  return pages;
}
