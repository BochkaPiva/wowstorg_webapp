import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("migration SQL encoding", () => {
  it("does not send UTF-8 BOM bytes to PostgreSQL", () => {
    const root = join(process.cwd(), "prisma/migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      const sql = readFileSync(join(root, dir.name, "migration.sql"));
      expect(sql.subarray(0, 3).toString("hex"), dir.name).not.toBe("efbbbf");
    }
  });
});
