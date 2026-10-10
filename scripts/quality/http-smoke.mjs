// Real Next.js HTTP -> Prisma -> PostgreSQL test. Never runs against a working DB.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import JSZip from "jszip";

nextEnv.loadEnvConfig(process.cwd());
const database = new URL(process.env.DATABASE_URL);
assert(["localhost", "127.0.0.1"].includes(database.hostname), "Only loopback test databases are allowed");
assert(["/wowstorg_ci", "/security_fresh_utf8"].includes(database.pathname), "Only named disposable databases are allowed");
const db = new PrismaClient();
const base = "http://127.0.0.1:3217";
const cleanEnv = { ...process.env, DATABASE_URL: database.toString(), DIRECT_URL: database.toString(),
  NEXT_PUBLIC_APP_URL: base, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(cleanEnv)) {
  if (/^(TELEGRAM_|SUPABASE_|REMINDERS_|INVENTORY_AUDIT_|CRON_SECRET)/.test(key)) cleanEnv[key] = "";
}
const server = spawn(process.execPath, [fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url)),
  "start", "--hostname", "127.0.0.1", "--port", "3217"], { env: cleanEnv, stdio: "inherit", windowsHide: true });
const users = [];
let standaloneId;
async function request(path, cookie, body, expected = 200) {
  const result = await fetch(base + path, { method: body ? "POST" : "GET", headers: {
    ...(cookie ? { cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
  assert.equal(result.status, expected, `${path} returned ${result.status}`);
  return result;
}
try {
  let started = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error("Test server exited before startup");
    try { if ((await fetch(base + "/api/auth/me")).status === 200) { started = true; break; } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(started, "Test server did not start");
  await request("/api/proposals", null, null, 401);
  const password = randomUUID();
  const passwordHash = await hash(password, 4);
  const cookies = {};
  for (const role of ["WOWSTORG", "GREENWICH"]) {
    const user = await db.user.create({ data: { login: `smoke-${randomUUID()}`, passwordHash, displayName: "CI Test", role } });
    users.push(user.id);
    const login = await request("/api/auth/login", null, { login: user.login, password });
    assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
    cookies[role] = login.headers.get("set-cookie").split(";")[0];
  }
  await request("/api/proposals", cookies.GREENWICH, null, 403);
  await request("/api/admin/analytics", cookies.GREENWICH, null, 403);
  const cookie = cookies.WOWSTORG;
  const created = await (await request("/api/proposals", cookie, { title: "Тестовое КП CI" })).json();
  const proposal = created.proposal;
  assert(proposal?.id && proposal.variants.length === 1);
  standaloneId = proposal.owner.standaloneProposalId;
  const mutationPath = `/api/proposals/${proposal.id}/mutations`;
  const sectionCommand = { action: "ADD_SECTION", title: "Шоу", variantId: proposal.variants[0].id,
    expectedRevision: 0, mutationId: randomUUID() };
  const added = await (await request(mutationPath, cookie, sectionCommand)).json();
  const retried = await (await request(mutationPath, cookie, sectionCommand)).json();
  assert.equal(retried.proposal.revision, 1, "A retry must not apply twice");
  await request(mutationPath, cookie, { ...sectionCommand, mutationId: randomUUID(), title: "Конфликт" }, 409);
  const itemCommand = { action: "ADD_MANUAL_ITEM", sectionId: added.proposal.variants[0].sections[0].id,
    title: "Выступление артиста", description: "Описание программы для клиента", clientUnitPrice: 12000,
    internalUnitCost: 7000, expectedRevision: 1, mutationId: randomUUID() };
  const updated = await (await request(mutationPath, cookie, itemCommand)).json();
  assert.equal(updated.proposal.revision, 2);
  assert.equal(await db.proposalMutationReceipt.count({ where: { proposalId: proposal.id } }), 2);
  const exportCommand = { expectedRevision: 2, variantId: proposal.variants[0].id, exportId: randomUUID() };
  const snapshot = await (await request(`/api/proposals/${proposal.id}/exports`, cookie, exportCommand)).json();
  const snapshotRetry = await (await request(`/api/proposals/${proposal.id}/exports`, cookie, exportCommand)).json();
  assert.equal(snapshot.snapshotId, snapshotRetry.snapshotId);
  const saved = await db.projectProposalSnapshot.findUniqueOrThrow({ where: { id: snapshot.snapshotId } });
  assert(!JSON.stringify(saved.clientData).includes("internalUnitCost"), "Internal cost must not reach client snapshot");
  const pdf = await request(`/api/proposals/${proposal.id}/exports/${snapshot.snapshotId}?format=pdf`, cookie);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
  const pptx = await request(`/api/proposals/${proposal.id}/exports/${snapshot.snapshotId}?format=pptx`, cookie);
  const zip = await JSZip.loadAsync(await pptx.arrayBuffer());
  assert(zip.file("ppt/presentation.xml"), "PPTX must contain a presentation");
  await request("/api/admin/analytics?from=2026-01-01&to=2026-12-31", cookie);
  await request("/api/auth/logout", cookie, {});
  await request("/api/proposals", cookie, null, 401);
  console.log("HTTP smoke passed: real login/roles, mutations/retry/conflict, PDF/PPTX, analytics and logout.");
} finally {
  server.kill();
  if (standaloneId) await db.standaloneProposal.delete({ where: { id: standaloneId } });
  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
