import { describe, expect, it } from "vitest";
import { changedHistoricalMigrations, validateBaseSha } from "../scripts/quality/check-migration-history.mjs";

describe("immutable historical migrations", () => {
  it("allows only new SQL, ignoring non-SQL documentation", () => {
    expect(changedHistoricalMigrations("A\tprisma/migrations/next/migration.sql\nM\tprisma/migrations/migration_lock.toml\n")).toEqual([]);
  });
  it.each(["M", "D", "T"])("rejects %s of old SQL", status => {
    expect(changedHistoricalMigrations(`${status}\tprisma/migrations/old/migration.sql\r\n`)).toHaveLength(1);
  });
  it("rejects renames represented as delete/add by --no-renames", () => {
    expect(changedHistoricalMigrations("D\tprisma/migrations/old/migration.sql\nA\tprisma/migrations/renamed/migration.sql")).toHaveLength(1);
  });
  it.each(["", "HEAD", "--help", "a; echo secret", "0".repeat(40), "a".repeat(39)])("rejects unsafe base input %s", input => {
    expect(() => validateBaseSha(input)).toThrow();
  });
  it("accepts full commit hashes only", () => {
    expect(validateBaseSha("a".repeat(40))).toBe("a".repeat(40));
  });
});
