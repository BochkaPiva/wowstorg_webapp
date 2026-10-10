// Real Next.js HTTP -> Prisma -> PostgreSQL test. Never runs against a working DB.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
delete cleanEnv.VERCEL; // Loopback tests are not behind the Vercel trusted proxy.
for (const key of Object.keys(cleanEnv)) {
  if (/^(TELEGRAM_|SUPABASE_|REMINDERS_|INVENTORY_AUDIT_|CRON_SECRET)/.test(key)) cleanEnv[key] = "";
}
const server = spawn(process.execPath, [fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url)),
  "start", "--hostname", "127.0.0.1", "--port", "3217"], { env: cleanEnv, stdio: "inherit", windowsHide: true });
const users = [];
const budgetKeys = [];
const budgetKey = (scope, ...parts) => `auth:${scope}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
let standaloneId;
async function request(path, cookie, body, expected = 200) {
  const result = await fetch(base + path, { method: body ? "POST" : "GET", headers: {
    ...(cookie ? { cookie } : {}), ...(body ? { "Content-Type": "application/json", Origin: base } : {}),
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
  const page = await fetch(base);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'self'/);
  for (const path of ["/api/auth/login", "/api/auth/first-login", "/api/auth/logout", "/api/proposals"]) {
    const denied = await fetch(base + path, { method: "POST", headers: {
      Origin: "https://untrusted.example", "Content-Type": "application/json",
    }, body: "{}" });
    assert.equal(denied.status, 403, `Cross-origin ${path} must be blocked before the handler`);
  }
  await request("/api/proposals", null, null, 401);
  const password = randomUUID();
  const passwordHash = await hash(password, 4);
  const cookies = {};
  const identities = {};
  for (const role of ["WOWSTORG", "GREENWICH"]) {
    const user = await db.user.create({ data: { login: `smoke-${randomUUID()}`, passwordHash, displayName: "CI Test", role } });
    users.push(user.id);
    budgetKeys.push(budgetKey("account", user.login), budgetKey("pair", "non-vercel", user.login));
    identities[role] = user;
    const login = await request("/api/auth/login", null, { login: user.login, password });
    assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
    cookies[role] = login.headers.get("set-cookie").split(";")[0];
  }
  await request("/api/proposals", cookies.GREENWICH, null, 403);
  await request("/api/admin/analytics", cookies.GREENWICH, null, 403);
  const cookie = cookies.WOWSTORG;
  const before = await db.standaloneProposal.count();
  const deniedMutation = await fetch(base + "/api/proposals", { method: "POST", headers: {
    cookie, Origin: "https://untrusted.example", "Content-Type": "application/json",
  }, body: JSON.stringify({ title: "Must not be created" }) });
  assert.equal(deniedMutation.status, 403);
  assert.equal(await db.standaloneProposal.count(), before, "Rejected mutation must not write to the DB");
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
  // Exercise admin changes through HTTP, not direct DB mutations. All users are owned fixtures.
  const employee = identities.GREENWICH;
  async function editEmployee(body) {
    const response = await fetch(`${base}/api/admin/users/${employee.id}`, { method: "PATCH", headers: {
      cookie, Origin: base, "Content-Type": "application/json",
    }, body: JSON.stringify(body) });
    assert.equal(response.status, 200, "Admin security change should succeed");
    assert.equal(await db.session.count({ where: { userId: employee.id } }), 0, "Old sessions must be revoked");
  }
  const newPassword = randomUUID();
  await editEmployee({ password: newPassword });
  await request("/api/proposals", cookies.GREENWICH, null, 401);
  const relogin = await request("/api/auth/login", null, { login: employee.login, password: newPassword });
  const renewedCookie = relogin.headers.get("set-cookie").split(";")[0];
  await editEmployee({ isActive: false });
  await editEmployee({ isActive: true });
  await request("/api/proposals", renewedCookie, null, 401);
  await editEmployee({ mustSetPassword: true });
  await request("/api/auth/login", null, { login: employee.login, password: newPassword }, 403);
  await request("/api/auth/first-login", null, { login: employee.login, password: newPassword, passwordConfirm: newPassword });
  await request("/api/auth/first-login", null, { login: employee.login, password: newPassword, passwordConfirm: newPassword }, 400);
  // Real concurrent HTTP requests exercise the shared atomic DB counters, not mocks.
  const identity = identities.WOWSTORG;
  const accountKey = budgetKey("account", identity.login);
  const pairKey = budgetKey("pair", "non-vercel", identity.login);
  const attempts = await Promise.all(Array.from({ length:12 }, () => fetch(base + "/api/auth/login", {
    method:"POST", headers:{ "Content-Type":"application/json", Origin:base },
    body:JSON.stringify({ login:identity.login, password:"wrong-password" }),
  })));
  assert.equal(attempts.filter(r => r.status === 401).length, 7, "One prior login leaves seven attempts in the window");
  assert.equal(attempts.filter(r => r.status === 429).length, 5, "Concurrent overflow must be throttled");
  assert(attempts.filter(r => r.status === 429).every(r => Number(r.headers.get("Retry-After")) > 0));
  await request("/api/auth/first-login", null, { login:identity.login, password, passwordConfirm:password }, 429);
  await request("/api/proposals", cookie); // Existing sessions remain usable while login is throttled.
  const pair = await db.authRateLimit.findUniqueOrThrow({ where:{ key:pairKey } });
  assert.equal(pair.attempts, 9, "Blocked traffic must not grow the counter indefinitely");
  await db.authRateLimit.updateMany({ where:{ key:{ in:[accountKey,pairKey] } }, data:{ expiresAt:new Date(0) } });
  await request("/api/auth/login", null, { login:identity.login, password });
  assert.equal((await db.authRateLimit.findUniqueOrThrow({ where:{ key:pairKey } })).attempts, 1);
  await db.authRateLimit.update({ where:{ key:accountKey }, data:{ attempts:40 } });
  await request("/api/auth/login", null, { login:identity.login, password }, 429);
  const staleKey = budgetKey("account", `stale-${randomUUID()}`);
  budgetKeys.push(staleKey);
  await db.authRateLimit.create({ data:{ key:staleKey, attempts:1, expiresAt:new Date(0) } });
  const ipKey = budgetKey("ip", "non-vercel");
  await db.authRateLimit.update({ where:{ key:ipKey }, data:{ attempts:60 } });
  const malformed = await fetch(base + "/api/auth/login", { method:"POST", headers:{ Origin:base }, body:"invalid" });
  assert.equal(malformed.status, 429, "IP gate must run before body parsing");
  assert.equal(await db.authRateLimit.count({ where:{ key:staleKey } }), 0, "Expired counters are cleaned up");
  await db.authRateLimit.update({ where:{ key:ipKey }, data:{ expiresAt:new Date(0) } });
  await request("/api/auth/logout", cookie, {});
  await request("/api/proposals", cookie, null, 401);
  console.log("HTTP smoke passed: origin/header boundaries, real login/roles, mutations/retry/conflict, PDF/PPTX, analytics, session revocation, concurrent auth limits/expiry/cleanup and logout.");
} finally {
  server.kill();
  if (standaloneId) await db.standaloneProposal.delete({ where: { id: standaloneId } });
  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
  if (budgetKeys.length) await db.authRateLimit.deleteMany({ where:{ key:{ in:budgetKeys } } });
  await db.$disconnect();
}
