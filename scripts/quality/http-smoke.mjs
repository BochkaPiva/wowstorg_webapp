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
// A fixture secret on loopback only. The bot token stays empty: no Telegram sends.
cleanEnv.TELEGRAM_WEBHOOK_SECRET = "ci-local-director-only";
const server = spawn(process.execPath, [fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url)),
  "start", "--hostname", "127.0.0.1", "--port", "3217"], { env: cleanEnv, stdio: "inherit", windowsHide: true });
const users = [];
const budgetKeys = [];
const budgetKey = (scope, ...parts) => `auth:${scope}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
let standaloneId;
let directorBoardId;
let inventoryItemId, inventoryCategoryId, inventoryCollectionId;
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
  await request("/api/inventory/positions?options=true", cookies.GREENWICH, null, 403);
  await request("/api/inventory/positions", cookies.GREENWICH, { name: "Forbidden", type: "ASSET", total: 1, pricePerDay: 0 }, 403);
  const inventoryCategory = await db.category.create({ data: { name: "Inventory CI", slug: `ci-${randomUUID()}` } });
  inventoryCategoryId = inventoryCategory.id;
  inventoryCollectionId = (await db.collection.create({ data: { name: "Inventory CI collection" } })).id;
  const inventoryInput = { name: "Inventory CI item", type: "ASSET", total: 8, inRepair: 1, broken: 1, missing: 1, pricePerDay: 125.5, categoryIds: [inventoryCategoryId], collectionIds: [inventoryCollectionId] };
  const inventoryCreated = await (await request("/api/inventory/positions", cookie, inventoryInput)).json();
  inventoryItemId = inventoryCreated.id;
  const inventoryPath = `/api/inventory/positions/${inventoryItemId}`;
  await db.collectionItem.update({ where: { collectionId_itemId: { collectionId: inventoryCollectionId, itemId: inventoryItemId } }, data: { position: 9 } });
  const inventory = await (await request(inventoryPath, cookie)).json();
  assert.equal(inventory.item.total, 8); assert.equal(inventory.item.missing, 1);
  assert.deepEqual(inventory.item.categories, [{ categoryId: inventoryCategoryId }]);
  assert.equal(inventory.item.collections[0].collectionId, inventoryCollectionId);
  assert.equal((await db.lossRecord.findFirstOrThrow({ where: { itemId: inventoryItemId } })).qty, 1);
  async function inventoryWrite(method, body, expected) {
    const response = await fetch(base + inventoryPath, { method, headers: { cookie, Origin: base, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, expected); return response.json();
  }
  const inventorySaved = await inventoryWrite("PATCH", { name: "Inventory CI renamed", pricePerDay: 150, expectedUpdatedAt: inventory.item.updatedAt, collectionIds: [inventoryCollectionId] }, 200);
  assert(inventorySaved.updatedAt);
  assert.equal((await db.collectionItem.findUniqueOrThrow({ where: { collectionId_itemId: { collectionId: inventoryCollectionId, itemId: inventoryItemId } } })).position, 9, "Saving inventory must not reorder retained collections");
  await inventoryWrite("PATCH", { name: "Stale overwrite", expectedUpdatedAt: inventory.item.updatedAt }, 409);
  await inventoryWrite("DELETE", null, 409); // Loss history protects linked inventory from removal.
  const itemCount = await db.item.count();
  await request("/api/inventory/positions", cookie, { ...inventoryInput, categoryIds: ["missing-category"] }, 409);
  assert.equal(await db.item.count(), itemCount, "Invalid membership must roll back the whole creation");
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
  // Full director path on the disposable PostgreSQL DB, with no external bot.
  await request("/api/admin/telegram/director", cookies.GREENWICH, null, 403);
  await request("/api/admin/telegram/director/notify", cookies.GREENWICH, { expectedRevision: 0, directorUserId: "not-allowed" }, 403);
  const taskBoard = await db.workTaskBoard.create({ data: { title: "CI director board", createdById: identities.WOWSTORG.id,
    columns: { create: [{ title: "Inbox", sortOrder: 0, createdById: identities.WOWSTORG.id }, { title: "Doing", sortOrder: 1000, createdById: identities.WOWSTORG.id }] } }, include: { columns: { orderBy: { sortOrder: "asc" } } } });
  directorBoardId = taskBoard.id;
  const directorConfig = await (await request("/api/admin/telegram/director", cookie)).json();
  const configResponse = await fetch(base + "/api/admin/telegram/director", { method: "PATCH", headers: { cookie, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: directorConfig.settings.revision, directorUserId: identities.WOWSTORG.id, telegramChatId: "606060", boardId: taskBoard.id, columnId: taskBoard.columns[0].id }) });
  assert.equal(configResponse.status, 200);
  async function directorUpdate(messageId, text, fromId = 606060) {
    return fetch(base + "/api/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": cleanEnv.TELEGRAM_WEBHOOK_SECRET },
      body: JSON.stringify({ update_id: messageId, message: { message_id: messageId, text, chat: { id: 606060, type: "private" }, from: { id: fromId, is_bot: false } } }) });
  }
  assert.equal((await directorUpdate(1, "/task")).status, 200);
  const taskReply = await directorUpdate(2, "CI director task\nText description"); assert.equal(taskReply.status, 200); assert.equal((await taskReply.json()).created, true);
  const duplicates = await Promise.all([directorUpdate(2, "CI director task\nText description"), directorUpdate(2, "CI director task\nText description")]);
  assert(duplicates.every(response => response.status === 200));
  assert.equal(await db.workTask.count({ where: { boardId: taskBoard.id } }), 1, "Repeated webhook must not duplicate a task");
  await directorUpdate(3, "/task forged sender", 999999);
  assert.equal(await db.workTask.count({ where: { boardId: taskBoard.id } }), 1, "Foreign sender must not create a task");
  const directorTask = await db.workTask.findFirstOrThrow({ where: { boardId: taskBoard.id } });
  assert.equal(directorTask.description, "Text description", "Telegram task description must be stored in full");
  const privateView = await fetch(base + "/api/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": cleanEnv.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ callback_query: { id: "ci-detail", data: `director:task:${directorTask.id}`, from: { id: 606060 }, message: { message_id: 10, chat: { id: 606060, type: "private" } } } }) });
  assert.equal(privateView.status, 200); assert.equal((await privateView.json()).director, true);
  assert.equal(await db.workTask.count({ where: { boardId: taskBoard.id } }), 1, "Viewing a task must not create another task");
  const moveReplies = await Promise.all([1,2].map(() => fetch(`${base}/api/tasks/tasks/${directorTask.id}`, { method: "PATCH", headers: { cookie, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ columnId: taskBoard.columns[1].id, completed: false, sortOrder: 1000 }) })));
  assert(moveReplies.every(response => response.status === 200));
  assert.equal(await db.workTaskActivity.count({ where: { taskId: directorTask.id, kind: "MOVED" } }), 1, "A repeated move must not emit a second transition");
  const movedDirectorTask = (await (await request(`/api/tasks/tasks/${directorTask.id}`, cookie)).json()).task;
  assert.deepEqual(movedDirectorTask.directorRequest, { directorName: "CI Test" }, "Source DTO must not expose private Telegram IDs");
  assert.equal(movedDirectorTask.description, "Text description", "Description must survive board/API moves");
  await db.workTask.delete({ where: { id: directorTask.id } });
  await directorUpdate(2, "CI director task\nText description");
  assert.equal(await db.workTask.count({ where: { boardId: taskBoard.id } }), 0, "A deleted task must not reappear from a repeated webhook");
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
  console.log("HTTP smoke passed: origin/header boundaries, real login/roles, inventory create/membership/loss-history/CAS/delete/rollback, mutations/retry/conflict, PDF/PPTX, analytics, director webhook/task/retry/committed-move/source-privacy/deletion, session revocation, concurrent auth limits/expiry/cleanup and logout.");
} finally {
  server.kill();
  if (inventoryItemId) { await db.lossRecord.deleteMany({ where: { itemId: inventoryItemId } }); await db.item.delete({ where: { id: inventoryItemId } }); }
  if (inventoryCategoryId) await db.category.delete({ where: { id: inventoryCategoryId } });
  if (inventoryCollectionId) await db.collection.delete({ where: { id: inventoryCollectionId } });
  if (standaloneId) await db.standaloneProposal.delete({ where: { id: standaloneId } });
  if (directorBoardId) {
    await db.telegramDirectorSettings.updateMany({ where: { directorUserId: { in: users } }, data: { directorUserId: null, telegramChatId: null, boardId: null, columnId: null, pendingAfterMessageId: null, pendingExpiresAt: null, lastMessageId: null } });
    await db.telegramDirectorInbox.deleteMany({ where: { directorUserId: { in: users } } });
    await db.workTask.deleteMany({ where: { boardId: directorBoardId } });
    await db.workTaskBoard.delete({ where: { id: directorBoardId } });
  }
  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
  if (budgetKeys.length) await db.authRateLimit.deleteMany({ where:{ key:{ in:budgetKeys } } });
  await db.$disconnect();
}
