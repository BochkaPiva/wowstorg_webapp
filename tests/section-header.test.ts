import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import sharp from "sharp";
import { SectionHeader } from "@/app/_ui/SectionHeader";

vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => React.createElement("img", { src, alt }) }));

describe("shared operational header", () => {
  it("preserves controls and truthful zero metrics while using decorative thematic art", () => {
    const html = renderToStaticMarkup(React.createElement(SectionHeader, {
      title: "Рабочая очередь", description: "Рабочие данные", mascot: "work",
      metrics: [{ value: 0, label: "проектов в выборке" }],
      actions: React.createElement("button", { type: "button" }, "Составить КП"),
      tabs: React.createElement("div", { role: "tablist" }, React.createElement("button", { role: "tab", "aria-selected": true }, "Активные")),
    }, React.createElement("input", { "aria-label": "Поиск" })));
    expect(html).toContain("<h1>Рабочая очередь</h1>");
    expect(html).toContain("/brand/headers/dino-work.webp");
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<strong>0</strong>проектов в выборке");
    expect(html).toContain('aria-selected="true"');
    expect(html.indexOf('aria-label="Поиск"')).toBeGreaterThan(html.indexOf("</h1>"));
    expect(html).toContain("Составить КП");
  });
  it("ships five distinct small transparent assets with recorded prompts", async () => {
    const sizes = new Set<number>();
    for (const name of ["work", "projects", "contractors", "inventory", "admin"]) {
      const file = `public/brand/headers/dino-${name}.webp`;
      const bytes = await fs.readFile(file);
      const metadata = await sharp(bytes).metadata();
      expect(bytes.length).toBeLessThan(150_000);
      expect(metadata.hasAlpha).toBe(true);
      expect(metadata.width).toBe(720);
      sizes.add(bytes.length);
      expect(JSON.parse(await fs.readFile(`${file}.json`, "utf8")).prompt.length).toBeGreaterThan(100);
    }
    expect(sizes.size).toBe(5);
  });
});
