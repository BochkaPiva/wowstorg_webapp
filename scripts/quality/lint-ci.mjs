import { ESLint } from "eslint";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { pathToFileURL } from "node:url";

export function countErrors(results, root) {
  const counts = {};
  for (const file of results) {
    const name = relative(root, file.filePath).replaceAll("\\", "/");
    for (const message of file.messages) {
      if (message.severity !== 2) continue;
      const key = `${name}|${message.ruleId ?? "fatal"}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

export function findRegressions(actual, baseline) {
  return Object.entries(actual)
    .filter(([key, count]) => key.endsWith("|fatal") || count > (baseline[key] ?? 0))
    .map(([key, count]) => ({ key, count, allowed: baseline[key] ?? 0 }));
}

async function main() {
  const baseline = JSON.parse(readFileSync(new URL("./eslint-baseline.json", import.meta.url), "utf8"));
  const eslint = new ESLint();
  const results = await eslint.lintFiles([
    "src", "tests", "scripts/quality", "scripts/security",
    "scripts/generate-brain-inventory.mjs", "next.config.ts", "vitest.config.ts",
  ]);
  const actual = countErrors(results, process.cwd());
  const regressions = findRegressions(actual, baseline.errors);
  const errors = Object.values(actual).reduce((sum, count) => sum + count, 0);
  console.log(`ESLint: ${errors} existing errors; ${regressions.length} file/rule regressions.`);
  if (regressions.length) {
    for (const item of regressions) console.error(`${item.key}: ${item.count} errors (baseline ${item.allowed})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
