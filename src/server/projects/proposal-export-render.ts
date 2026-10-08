import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFStream, rgb } from "pdf-lib";
import JSZip from "jszip";
import { planExportPages, type ExportDocument, type ExportText } from "./proposal-export-document";

const assets = () => join(process.cwd(), "src/server/projects/proposal-template-v1");
async function pagePlan(document: ExportDocument) {
  const font = fontkit.create(await readFile(join(assets(), "OksFree.otf")));
  return planExportPages(document, (text, size) => font.layout(text).glyphs.reduce((sum: number, glyph: { advanceWidth: number }) => sum + glyph.advanceWidth, 0) / font.unitsPerEm * size * 1.08);
}
const escapeXml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
const emu = (value: number) => Math.round(value * 9525);
const fitPhoto = (width: number, height: number) => {
  const scale = Math.min(450 / width, 320 / height);
  return { x: 76 + (450 - width * scale) / 2, y: 282 + (320 - height * scale) / 2, width: width * scale, height: height * scale };
};
function textShape(text: ExportText, id: number) {
  const size = Math.round(text.size * 75); // px to PowerPoint hundredths of a point
  const paragraphs = text.text.replace(/[\u00a0\u202f]/g, " ").split("\n").map(line => `<a:p><a:pPr><a:lnSpc><a:spcPct val="120000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="ru-RU" sz="${size}" b="0"><a:solidFill><a:srgbClr val="${text.color ?? "FFFFFF"}"/></a:solidFill><a:latin typeface="Oks Free"/><a:cs typeface="Oks Free"/><a:ea typeface="Oks Free"/></a:rPr><a:t xml:space="preserve">${escapeXml(line)}</a:t></a:r></a:p>`).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="КП текст ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(text.x)}" y="${emu(text.y)}"/><a:ext cx="${emu(text.width)}" cy="${emu(text.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" rIns="0" tIns="0" bIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}
export async function renderProposalPptx(document: ExportDocument) {
  const zip = await JSZip.loadAsync(await readFile(join(assets(), "source.pptx")));
  const pages = await pagePlan(document);
  const bases = new Map<number, { xml: string; relations: string }>();
  for (const i of [2, 5, 7]) bases.set(i, {
    xml: await zip.file(`ppt/slides/slide${i}.xml`)!.async("string"),
    relations: await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)!.async("string"),
  });
  // Remove source slides and notes, not the template layouts, artwork, theme or masters.
  for (const name of Object.keys(zip.files)) if (/^ppt\/(slides\/|notesSlides\/|notesMasters\/)|^docProps\//.test(name)) zip.remove(name);
  let slideIds = "", relationships = "", contentTypes = "";
  const photoNames = new Map<string, string>();
  for (const [i, page] of pages.entries()) {
    const n = i + 1, base = bases.get(page.background)!;
    const source = base.xml.replace(/<p:sp>[^]*?<\/p:sp>/g, ""); // only the trusted, pinned template's empty placeholders
    let shapes = page.texts.map((text, index) => textShape(text, 1000 + index)).join("");
    let rels = base.relations.replace(/<Relationship\b[^>]*Type="[^"]*\/notesSlide"[^>]*\/>/g, "");
    if (page.photo) {
      const key = createHash("sha256").update(page.photo.jpeg).digest("hex");
      const name = photoNames.get(key) ?? `proposal-${photoNames.size + 1}.jpg`;
      if (!photoNames.has(key)) { photoNames.set(key, name); zip.file(`ppt/media/${name}`, Buffer.from(page.photo.jpeg, "base64")); }
      rels = rels.replace("</Relationships>", `<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/></Relationships>`);
      const frame = fitPhoto(page.photo.width, page.photo.height);
      shapes += `<p:pic><p:nvPicPr><p:cNvPr id="2000" name="Фото подрядчика"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdPhoto"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(frame.x)}" y="${emu(frame.y)}"/><a:ext cx="${emu(frame.width)}" cy="${emu(frame.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }
    zip.file(`ppt/slides/slide${n}.xml`, source.replace("</p:spTree>", `${shapes}</p:spTree>`));
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, rels);
    slideIds += `<p:sldId id="${256 + n}" r:id="rIdExport${n}"/>`;
    relationships += `<Relationship Id="rIdExport${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`;
    contentTypes += `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }
  const presentation = await zip.file("ppt/presentation.xml")!.async("string");
  zip.file("ppt/presentation.xml", presentation.replace(/<p:sldIdLst>[^]*?<\/p:sldIdLst>/, `<p:sldIdLst>${slideIds}</p:sldIdLst>`).replace(/<p:notesMasterIdLst>[^]*?<\/p:notesMasterIdLst>/, ""));
  const presRels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string");
  zip.file("ppt/_rels/presentation.xml.rels", presRels.replace(/<Relationship\b[^>]*Type="[^"]*\/(?:slide|notesMaster)"[^>]*\/>/g, "").replace("</Relationships>", `${relationships}</Relationships>`));
  const types = await zip.file("[Content_Types].xml")!.async("string");
  zip.file("[Content_Types].xml", types.replace(/<Override\b[^>]*PartName="\/(?:ppt\/(?:slides|notesSlides|notesMasters)\/|docProps\/)[^>]*\/>/g, "").replace("</Types>", `${contentTypes}${/Extension="jpg"/.test(types) ? "" : '<Default Extension="jpg" ContentType="image/jpeg"/>'}</Types>`));
  const rootRels = await zip.file("_rels/.rels")!.async("string");
  zip.file("_rels/.rels", rootRels.replace(/<Relationship\b[^>]*Target="docProps\/[^>]*\/>/g, ""));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function renderProposalPdf(document: ExportDocument) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit({ create: (bytes: Uint8Array) => {
    const font = fontkit.create(bytes);
    // @pdf-lib/fontkit exposes the CFF table by tag, while pdf-lib expects `cff`.
    // The pinned Oks Free file is OTTO/CFF, not a TrueType glyf font.
    Object.defineProperty(font, "cff", { value: true });
    return font;
  } });
  const regular = await pdf.embedFont(await readFile(join(assets(), "OksFree.otf")), { subset: false });
  const bold = regular; // Original brand font has one weight. Hierarchy uses size, not synthetic bold.
  const backgrounds = new Map<number, Awaited<ReturnType<typeof pdf.embedJpg>>>();
  const photos = new Map<string, Awaited<ReturnType<typeof pdf.embedJpg>>>();
  for (const source of await pagePlan(document)) {
    const page = pdf.addPage([1280, 720]);
    if (!backgrounds.has(source.background)) backgrounds.set(source.background, await pdf.embedJpg(Uint8Array.from(await readFile(join(assets(), `background-${source.background}.jpg`)))));
    page.drawImage(backgrounds.get(source.background)!, { x: 0, y: 0, width: 1280, height: 720 });
    for (const text of source.texts) {
      const color = text.color ?? "FFFFFF";
      const font = text.bold ? bold : regular;
      const lines = text.text.replace(/[\u00a0\u202f]/g, " ").split("\n");
      for (const [index, line] of lines.entries()) {
        // No silent clipping: fail export if content violates the adapter's contract.
        if (font.widthOfTextAtSize(line, text.size) > text.width + 2 || (index + 1) * text.size * 1.2 > text.height + text.size * .2) throw new Error("EXPORT_TEXT_OVERFLOW");
        page.drawText(line, { x: text.x, y: 720 - text.y - text.size - index * text.size * 1.2, font, size: text.size, color: rgb(parseInt(color.slice(0, 2), 16) / 255, parseInt(color.slice(2, 4), 16) / 255, parseInt(color.slice(4, 6), 16) / 255) });
      }
    }
    if (source.photo) {
      const key = createHash("sha256").update(source.photo.jpeg).digest("hex");
      if (!photos.has(key)) photos.set(key, await pdf.embedJpg(Uint8Array.from(Buffer.from(source.photo.jpeg, "base64"))));
      const image = photos.get(key)!;
      const frame = fitPhoto(source.photo.width, source.photo.height);
      page.drawImage(image, { x: frame.x, y: 720 - frame.y - frame.height, width: frame.width, height: frame.height });
    }
  }
  pdf.setTitle(document.title); pdf.setAuthor("ВАУСТОРГ"); pdf.setCreator("Wowstorg Proposal Studio");
  await pdf.flush();
  // pdf-lib labels the complete OTF container as raw CFF. Full OTF requires /OpenType.
  // This adapter embeds only one full OpenType/CFF font, never a raw CFF subset.
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (object instanceof PDFStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("CIDFontType0C")) object.dict.set(PDFName.of("Subtype"), PDFName.of("OpenType"));
  }
  return pdf.save();
}
