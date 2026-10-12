// Isolated UI fixture. No credentials, database or external requests.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const root = process.cwd(), qa = path.join(root, ".impeccable/review/compact-work-qa");
const css = (await postcss([tailwind()]).process(await fs.readFile(path.join(root, "src/app/globals.css"), "utf8"), { from: path.join(root, "src/app/globals.css") })).css;
http.createServer(async (req, res) => {
  const route = new URL(req.url, "http://127.0.0.1").pathname;
  try {
    if (route.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json" });
      if (route === "/api/customers/merge") return res.end(JSON.stringify({ summary: { groups: 0, duplicateCards: 0 }, groups: [], history: [] }));
      return res.end(JSON.stringify(route === "/api/work-queue" ? { items: [], meta: { total: 0, projects: 0, standaloneOrders: 0, estimates: 0, undated: 0 } } : route === "/api/admin/users" ? { users: [] } : route === "/api/admin/loyalty" ? { users: [], rules: [], offers: [], history: [] } : { customers: [] }));
    }
    if (route.startsWith("/bundle.") || route.startsWith("/brand/") || route.startsWith("/fonts/")) {
      const file = route.startsWith("/bundle.") ? path.join(qa, path.basename(route)) : path.join(root, "public", route);
      res.writeHead(200, { "content-type": route.endsWith(".js") ? "text/javascript" : route.endsWith(".css") ? "text/css" : route.endsWith(".woff2") ? "font/woff2" : "image/webp" });
      return res.end(await fs.readFile(file));
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>${css}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  } catch (error) { res.writeHead(500); res.end(String(error)); }
}).listen(3115, "127.0.0.1", () => console.log("Compact work QA: http://127.0.0.1:3115/work"));
