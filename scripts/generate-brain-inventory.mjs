/**
 * Генерирует проверяемые реестры из исходников (единственный источник правды — код).
 *
 * Запуск: node scripts/generate-brain-inventory.mjs
 * npm:    npm run brain:inventory
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const API_ROOT = path.join(ROOT, "src", "app", "api");
const BRAIN_REF = path.join(ROOT, "brain", "reference");
const ENV_SCAN_ROOTS = [
  path.join(ROOT, "src"),
  path.join(ROOT, "prisma", "seed.cjs"),
];

function collectPrismaDatasourceEnv() {
  const schemaPath = path.join(ROOT, "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) return [];
  const s = fs.readFileSync(schemaPath, "utf8");
  const re = /env\("([A-Z][A-Z0-9_]*)"\)/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  return out;
}

function walkRouteFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) {
    console.error("Missing:", dir);
    process.exit(1);
  }
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkRouteFiles(p, acc);
    else if (ent.name === "route.ts") acc.push(p);
  }
  return acc;
}

function appRouteUrl(routeFile) {
  const appDir = path.join(ROOT, "src", "app");
  const dir = path.dirname(routeFile);
  const rel = path.relative(appDir, dir).replace(/\\/g, "/");
  return "/" + rel;
}

function extractHttpMethods(source) {
  const re = /^export async function (GET|POST|PATCH|PUT|DELETE)\b/gm;
  return [...source.matchAll(re)].map((m) => m[1]);
}

function collectEnvVars() {
  const names = new Set();
  for (const n of collectPrismaDatasourceEnv()) names.add(n);
  const re = /process\.env\.([A-Z][A-Z0-9_]*)/g;

  function scanFile(filePath) {
    const s = fs.readFileSync(filePath, "utf8");
    let m;
    while ((m = re.exec(s)) !== null) names.add(m[1]);
  }

  function walkDir(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".next") continue;
        walkDir(p);
      } else if (/\.(ts|tsx|mts|cts)$/.test(ent.name)) scanFile(p);
    }
  }

  for (const root of ENV_SCAN_ROOTS) {
    const st = fs.statSync(root);
    if (st.isFile()) scanFile(root);
    else walkDir(root);
  }

  return [...names].sort();
}

function main() {
  fs.mkdirSync(BRAIN_REF, { recursive: true });

  const routeFiles = walkRouteFiles(API_ROOT).sort((a, b) => a.localeCompare(b));
  const generatedAt = new Date().toISOString();

  const apiLines = [
    "# Реестр HTTP API (сгенерировано из кода)",
    "",
    `> **Сгенерировано:** ${generatedAt}  
> **Файлов route.ts:** ${routeFiles.length}  
> Команда: \`npm run brain:inventory\`  
> См. также: \`brain/reference/README.md\` (ручные реестры: prisma-transactions, schedule-after-response).  
> Расхождение других доков с этой таблицей — **ошибка документации**.`,
    "",
    "| HTTP | Путь (App Router) | Файл |",
    "|------|-------------------|------|",
  ];

  for (const f of routeFiles) {
    const src = fs.readFileSync(f, "utf8");
    const methods = extractHttpMethods(src);
    const url = appRouteUrl(f);
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    const methodStr = methods.length ? methods.join(", ") : "—";
    apiLines.push(`| ${methodStr} | \`${url}\` | \`${rel}\` |`);
  }

  fs.writeFileSync(path.join(BRAIN_REF, "api-inventory.md"), apiLines.join("\n") + "\n", "utf8");

  const envNames = collectEnvVars();
  const envLines = [
    "# Переменные окружения (сгенерировано из кода)",
    "",
    `> **Сгенерировано:** ${generatedAt}  
> Уникальных имён \`process.env.*\`: ${envNames.length}  
> Скан: \`src/**/*.ts(x)\` и \`prisma/seed.cjs\`  
> Перегенерировать: \`npm run brain:inventory\``,
    "",
    "| Переменная |",
    "|------------|",
    ...envNames.map((n) => `| \`${n}\` |`),
  ];

  fs.writeFileSync(path.join(BRAIN_REF, "env-inventory.md"), envLines.join("\n") + "\n", "utf8");

  console.log(`Wrote brain/reference/api-inventory.md (${routeFiles.length} routes)`);
  console.log(`Wrote brain/reference/env-inventory.md (${envNames.length} env vars)`);
}

main();
