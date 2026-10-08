import { describe, expect, it } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFStream } from "pdf-lib";
import type { Proposal, ProposalItem } from "@/lib/proposals";
import { exportChecksum, projectClientDocument, planExportPages, wrapExportText } from "@/server/projects/proposal-export-document";
import { renderProposalPdf, renderProposalPptx } from "@/server/projects/proposal-export-render";

const service = (id: string, patch: Partial<ProposalItem> = {}): ProposalItem => ({ id, offerId: null, selectionRole: "PRIMARY", qty: 2,
  clientUnitPrice: 15000, internalUnitCost: 7777, priceTypeSnapshot: "FIXED", unitLabel: "час", contractorNameSnapshot: "Демо · ведущий",
  offerTitleSnapshot: "Ведение мероприятия", offerDescriptionSnapshot: "Программа для команды: интерактивы, музыка и церемония награждения.",
  clientNote: "Согласуем сценарий с вами.", assetSnapshot: null, ...patch });
const proposal = (): Proposal => ({ id: "export-qa", title: "Демо · корпоратив для команды", revision: 4, status: "DRAFT", owner: null,
  clientIntro: "Собрали программу для команды. Все данные в этом примере демонстрационные.", clientOutro: "Готовы обсудить состав и уточнить стоимость.",
  variants: [{ id: "v", title: "Основной вариант", isRecommended: true, sections: [
    { id: "s1", title: "Программа", category: null, items: [service("i1"), service("opt", { selectionRole: "OPTIONAL", clientUnitPrice: 999999 }), service("excluded", { selectionRole: "EXCLUDED", offerTitleSnapshot: "СЕКРЕТ" })] },
    { id: "s2", title: "Площадка", category: null, items: [service("i2", { offerTitleSnapshot: "Аренда зала", clientUnitPrice: null }), service("free", { offerTitleSnapshot: "Координация", qty: 1, clientUnitPrice: 0 })] },
  ] }] });
describe("client proposal export", () => {
  it("exports a strict allowlist, primary-only budget, options separate and unknown not zero", () => {
    const doc = projectClientDocument(proposal(), "v"), json = JSON.stringify(doc);
    expect(json).not.toMatch(/7777|internalUnitCost|СЕКРЕТ/);
    expect(doc.sections[0].items).toHaveLength(2);
    expect(doc.budget).toContain("30"); expect(doc.budgetDetail).toMatch(/запросу|уточн/);
    expect(doc.sections[1].items[0].price).toBe("По запросу");
    expect(doc.sections[1].items[1].price).toMatch(/^0/);
    expect(() => projectClientDocument(proposal(), "missing")).toThrow("VARIANT_NOT_FOUND");
  });
  it("canonical checksum survives JSONB key reordering", () => {
    const doc = projectClientDocument(proposal(), "v");
    expect(exportChecksum(doc)).toBe(exportChecksum(Object.fromEntries(Object.entries(doc).reverse()) as typeof doc));
    expect(exportChecksum({ ...doc, title: "Другое КП" })).not.toBe(exportChecksum(doc));
  });
  it("wraps and paginates long text without losing content", () => {
    const text = "Ш".repeat(5000), doc = projectClientDocument(proposal(), "v");
    expect(wrapExportText(text, 43).join("")).toBe(text);
    doc.sections[0].items[0].description = text;
    expect(planExportPages(doc).length).toBeGreaterThan(10);
    expect(planExportPages(doc).flatMap(p => p.texts).reduce((sum, block) => sum + (block.text.match(/Ш/g)?.length ?? 0), 0)).toBe(5000);
  });
  it("keeps one- and two-line cover variants clear of the template rule and logo", () => {
    for (const title of ["Основной вариант", "Основной вариант мероприятия для команды с расширенной программой"]) {
      const doc = projectClientDocument(proposal(), "v"); doc.variantTitle = title;
      const label = planExportPages(doc)[0].texts.find(text => text.y === 458);
      expect(label).toBeDefined(); expect(label!.y).toBeGreaterThan(440);
      expect(label!.y + label!.height).toBeLessThan(520);
      expect(label!.text.split("\n").length).toBeLessThanOrEqual(2);
    }
  });
  it("renders branded editable PPTX and real PDF with intact package references", async () => {
    const doc = projectClientDocument(proposal(), "v");
    const image = await sharp({ create: { width: 450, height: 600, channels: 3, background: "#977ab2" } }).jpeg().toBuffer();
    doc.sections[0].items[0].photo = { jpeg: image.toString("base64"), width: 450, height: 600 };
    const [pptx, pdf] = await Promise.all([renderProposalPptx(doc), renderProposalPdf(doc)]);
    const zip = await JSZip.loadAsync(pptx);
    const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const pdfDocument = await PDFDocument.load(pdf);
    expect(slides.length).toBe(pdfDocument.getPageCount());
    const fontStreams = pdfDocument.context.enumerateIndirectObjects().map(([, object]) => object)
      .filter(object => object instanceof PDFStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("OpenType"));
    expect(fontStreams).toHaveLength(1);
    expect(await zip.file(slides[2])!.async("string")).toContain("<a:t");
    const xml = (await Promise.all(slides.map(name => zip.file(name)!.async("string")))).join("");
    expect(xml).toContain("Ведение мероприятия"); expect(xml).not.toContain("7777");
    expect(xml).toContain('typeface="Oks Free"'); expect(xml).not.toContain('typeface="Century Gothic"');
    for (const name of Object.keys(zip.files).filter(n => n.endsWith(".rels"))) {
      const relations = await zip.file(name)!.async("string");
      const base = name === "_rels/.rels" ? "" : path.posix.dirname(name).replace(/\/_rels$/, "");
      for (const relation of relations.matchAll(/<Relationship\b[^>]*\/>/g)) {
        if (/TargetMode="External"/.test(relation[0])) continue;
        const target = /Target="([^"]+)"/.exec(relation[0])?.[1];
        if (target) expect(zip.file(path.posix.normalize(path.posix.join(base, target))), `${name}: ${target}`).not.toBeNull();
      }
    }
    if (process.env.PROPOSAL_EXPORT_QA === "1") {
      await mkdir("tmp/proposal-export-qa", { recursive: true });
      await writeFile("tmp/proposal-export-qa/demo.pptx", pptx); await writeFile("tmp/proposal-export-qa/demo.pdf", pdf);
      const twoLine = { ...doc, variantTitle: "Программа новогоднего корпоратива\nРасширенный вариант для команды" };
      await writeFile("tmp/proposal-export-qa/cover-two-line.pptx", await renderProposalPptx(twoLine));
      await writeFile("tmp/proposal-export-qa/cover-two-line.pdf", await renderProposalPdf(twoLine));
    }
  }, 30000);
});
