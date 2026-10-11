// Local synthetic evidence server. No database, credentials or outgoing API calls.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd(), qa = path.join(root, ".impeccable/review/work-launch-qa");
const globals = await fs.readFile(path.join(root, "src/app/globals.css"), "utf8");
const theme = globals.slice(globals.indexOf("@font-face"), globals.indexOf("@theme inline"));
const categories = ["Локации", "Ведущие", "Шоу-программа", "Музыка", "Оборудование", "Кейтеринг"].map((name, index) => ({ id: `category-${index}`, name }));
const contractors = [{ id: "qa-contractor", name: "Демо · ведущий", photoUrl: null, offers: [{ id: "offer-1", title: "Ведение мероприятия", description: "Программа для команды: интерактивы и церемония награждения.", clientPrice: 15000, clientPriceMax: null, priceType: "FIXED", unitLabel: "час", priceConfirmedAt: null, category: categories[1] }] }];
const proposals = new Map();
let counter = 0;
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1"), route = url.pathname;
  const json = (body, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  try {
    if (route.startsWith("/api/")) {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (route === "/api/work-queue") return json({ items: [], meta: { total: 0, projects: 0, standaloneOrders: 0, estimates: 0, undated: 0, from: "2026-10-01", to: "2026-10-31" } });
      if (route === "/api/customers") return json({ customers: [{ id: "customer-1", name: "Демо · клиент", logoUrl: null }] });
      if (route === "/api/contractor-categories") return json({ categories });
      if (route === "/api/contractors") return json({ contractors: contractors.filter(c => !url.searchParams.get("categoryId") || c.offers.some(o => o.category.id === url.searchParams.get("categoryId"))), nextCursor: null });
      if (route === "/api/proposals" && req.method === "POST") {
        const id = `qa-proposal-${++counter}`;
        const proposal = { id, title: body.title, status: "DRAFT", revision: 0, clientIntro: null, clientOutro: null, owner: { type: "STANDALONE", customer: null, leadCustomerName: body.customerName ?? null, convertedAt: null }, variants: [{ id: `variant-${counter}`, title: "Основной вариант", isRecommended: true, sections: [] }] };
        proposals.set(id, proposal); return json({ proposal });
      }
      if (["/api/standalone-estimates", "/api/projects"].includes(route) && req.method === "POST") return json({ [route.includes("estimates") ? "estimate" : "project"]: { id: `qa-${++counter}`, title: body.title } });
      const id = route.split("/")[3], proposal = proposals.get(id);
      if (proposal && route.endsWith("/mutations")) {
        if (body.expectedRevision !== proposal.revision) return json({ error: { message: "Revision conflict" } }, 409);
        const section = proposal.variants.flatMap(v => v.sections).find(s => s.id === body.sectionId);
        if (body.action === "ADD_SECTION") proposal.variants[0].sections.push({ id: `section-${++counter}`, title: body.title, category: categories.find(c => c.id === body.categoryId) ?? null, items: [] });
        if (body.action === "ADD_CATALOG_ITEM") section.items.push({ id: `item-${++counter}`, offerId: "offer-1", selectionRole: "PRIMARY", qty: 1, clientUnitPrice: 15000, internalUnitCost: null, priceTypeSnapshot: "FIXED", unitLabel: "час", contractorNameSnapshot: contractors[0].name, offerTitleSnapshot: "Ведение мероприятия", offerDescriptionSnapshot: contractors[0].offers[0].description, clientNote: null, assetSnapshot: null });
        if (body.action === "REMOVE_ITEM") for (const s of proposal.variants[0].sections) s.items = s.items.filter(i => i.id !== body.itemId);
        proposal.revision++; return json({ proposal, changeId: body.mutationId });
      }
      if (proposal) return json({ proposal });
      return json({ error: { message: "Fixture endpoint not implemented" } }, 404);
    }
    if (route === "/bundle.js" || route === "/bundle.css" || route.startsWith("/brand/") || route.startsWith("/fonts/")) {
      const file = route.startsWith("/bundle.") ? path.join(qa, path.basename(route)) : path.join(root, "public", route);
      const mime = route.endsWith(".js") ? "text/javascript" : route.endsWith(".css") ? "text/css" : route.endsWith(".woff2") ? "font/woff2" : "image/webp";
      res.writeHead(200, { "content-type": mime }); return res.end(await fs.readFile(file));
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>${theme}*{box-sizing:border-box}body{margin:0;background:var(--wow-paper);font-family:Onest,Arial,sans-serif;color:var(--wow-ink)}button,input,select{font:inherit}.qa-topbar{display:flex;align-items:center;gap:24px;padding:20px 32px;border-bottom:1px solid var(--wow-line)}.qa-topbar span{margin-left:auto;font-size:12px;color:var(--wow-muted)}.qa-shell{padding:28px;max-width:1260px;margin:auto}.qa-topbar a{color:var(--wow-purple)}@media(max-width:650px){.qa-shell{padding:14px}.qa-topbar{padding:16px}.qa-topbar span{max-width:120px}}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  } catch (error) { console.error(error.message); json({ error: { message: error.message } }, 500); }
}).listen(3114, "127.0.0.1", () => console.log("Synthetic work/proposal QA: http://127.0.0.1:3114/work"));
