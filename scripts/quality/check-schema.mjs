import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Read-only schema comparison. Exit 2 means drift; keep it a failing CI result.
const cli = fileURLToPath(new URL("../../node_modules/prisma/build/index.js", import.meta.url));
const result = spawnSync(process.execPath, [cli, "migrate", "diff",
  "--from-schema-datasource", "prisma/schema.prisma",
  "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"],
{ stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
