import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function changedHistoricalMigrations(diff) {
  return diff.split(/\r?\n/).filter(Boolean).filter(line => {
    const [status, path] = line.split("\t");
    return status !== "A" && /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(path ?? "");
  });
}

export function validateBaseSha(sha) {
  if (!/^[a-f0-9]{40}$/i.test(sha ?? "") || /^0+$/.test(sha)) {
    throw new Error("A non-zero 40-character base commit SHA is required");
  }
  return sha;
}

function main() {
  const base = validateBaseSha(process.argv[2]);
  const diff = execFileSync("git", ["diff", "--name-status", "--no-renames", base, "HEAD", "--", "prisma/migrations"],
    { encoding: "utf8", windowsHide: true });
  const changed = changedHistoricalMigrations(diff);
  if (changed.length) {
    console.error("Applied migration SQL is immutable. Add a new migration instead:");
    changed.forEach(line => console.error(line));
    process.exitCode = 1;
  } else {
    console.log("Migration history: no existing SQL files modified, renamed or deleted.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
