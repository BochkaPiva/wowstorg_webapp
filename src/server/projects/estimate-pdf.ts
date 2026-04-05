import { readFileSync } from "fs";
import { join } from "path";

import * as fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";

const COMMISSION_RATE = 0.15;

/** Noto Sans (SIL Open Font License) — кириллица для PDF; StandardFonts в pdf-lib только WinAnsi. */
function loadNotoFonts(): { regular: Uint8Array; bold: Uint8Array } {
  const base = join(process.cwd(), "src", "server", "fonts");
  return {
    regular: new Uint8Array(readFileSync(join(base, "NotoSans-Regular.ttf"))),
    bold: new Uint8Array(readFileSync(join(base, "NotoSans-Bold.ttf"))),
  };
}

export type EstimatePdfLine = { num: number; name: string; client: number | null };
export type EstimatePdfSection = { title: string; lines: EstimatePdfLine[] };

function sumClientLines(sections: EstimatePdfSection[]): number {
  let s = 0;
  for (const sec of sections) {
    for (const ln of sec.lines) {
      if (ln.client != null && Number.isFinite(ln.client)) s += ln.client;
    }
  }
  return s;
}

export async function buildEstimatePdfBuffer(args: {
  projectTitle: string;
  sections: EstimatePdfSection[];
}): Promise<Uint8Array> {
  const servicesSubtotal = sumClientLines(args.sections);
  const commission = servicesSubtotal * COMMISSION_RATE;
  const total = servicesSubtotal + commission;

  const { regular: regularBytes, bold: boldBytes } = loadNotoFonts();

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(regularBytes);
  const bold = await pdf.embedFont(boldBytes);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  const margin = 48;
  let y = pageSize[1] - margin;
  const lineGap = 14;
  const maxW = pageSize[0] - margin * 2;

  function needSpace(lines = 1) {
    if (y < margin + lines * lineGap) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
    }
  }

  function draw(text: string, size: number, useBold = false, indent = 0) {
    const f = useBold ? bold : font;
    const prefix = " ".repeat(indent);
    const full = prefix + text;
    const chunks: string[] = [];
    let cur = "";
    for (const word of full.split(/\s+/)) {
      const tryLine = cur ? `${cur} ${word}` : word;
      if (f.widthOfTextAtSize(tryLine, size) <= maxW) {
        cur = tryLine;
      } else {
        if (cur) chunks.push(cur);
        cur = word;
      }
    }
    if (cur) chunks.push(cur);
    for (const ch of chunks) {
      needSpace(1);
      page.drawText(ch, { x: margin, y, size, font: f, maxWidth: maxW });
      y -= lineGap;
    }
  }

  draw(`Смета для клиента: ${args.projectTitle}`, 14, true);
  y -= 4;
  draw("Цены до комиссии агентства; итог с комиссией 15% — внизу.", 9);
  y -= 8;

  for (const sec of args.sections) {
    draw(sec.title, 11, true);
    for (const ln of sec.lines) {
      const c = ln.client != null ? `${ln.client.toFixed(2)} ₽` : "—";
      draw(`${ln.num}. ${ln.name} — ${c}`, 10, false, 1);
    }
    y -= 6;
  }

  draw("—", 10);
  draw(`Сумма услуг (без комиссии): ${servicesSubtotal.toFixed(2)} ₽`, 11, true);
  draw(`Комиссия агентства (15%): ${commission.toFixed(2)} ₽`, 10);
  draw(`Итого с комиссией: ${total.toFixed(2)} ₽`, 12, true);

  return pdf.save();
}

export { COMMISSION_RATE };
