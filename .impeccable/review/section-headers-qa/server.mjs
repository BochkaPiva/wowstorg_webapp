// Isolated visual fixture: no credentials, database or outgoing API requests.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd(), qa = path.join(root, ".impeccable/review/section-headers-qa");
const globals = await fs.readFile(path.join(root, "src/app/globals.css"), "utf8");
const theme = globals.slice(globals.indexOf("@font-face"), globals.indexOf("@theme inline"));
http.createServer(async (req, res) => {
  const route = new URL(req.url, "http://127.0.0.1").pathname;
  try {
    if (route.startsWith("/api/")) {
      if (route.startsWith("/api/admin/analytics")) { res.writeHead(503, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: "Synthetic error state; no database connection" } })); }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(route === "/api/work-queue" ? { items: [], meta: { total: 0, projects: 0, standaloneOrders: 0, estimates: 0, undated: 0, from: "2026-10-01", to: "2026-10-31" } } : { customers: [] }));
    }
    if (route.startsWith("/bundle.") || route.startsWith("/brand/") || route.startsWith("/fonts/")) {
      const file = route.startsWith("/bundle.") ? path.join(qa, path.basename(route)) : path.join(root, "public", route);
      res.writeHead(200, { "content-type": route.endsWith(".js") ? "text/javascript" : route.endsWith(".css") ? "text/css" : route.endsWith(".woff2") ? "font/woff2" : route.endsWith(".png") ? "image/png" : "image/webp" });
      return res.end(await fs.readFile(file));
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>${theme}*{box-sizing:border-box}body{margin:0;background:var(--wow-paper);font-family:Onest,Arial,sans-serif;color:var(--wow-ink)}button,input,select{font:inherit}.qa-topbar{display:flex;align-items:center;gap:24px;padding:20px 32px;border-bottom:1px solid var(--wow-line)}.qa-topbar span{margin-left:auto;font-size:12px;color:var(--wow-muted)}.qa-shell{padding:28px;max-width:1420px;margin:auto}.qa-topbar a{color:var(--wow-purple)}@media(max-width:650px){.qa-shell{padding:14px}.qa-topbar{padding:16px}.qa-topbar span{max-width:120px}}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  } catch (error) { res.writeHead(500); res.end(String(error)); }
}).listen(3115, "127.0.0.1", () => console.log("Header QA: http://127.0.0.1:3115/work and /headers"));
