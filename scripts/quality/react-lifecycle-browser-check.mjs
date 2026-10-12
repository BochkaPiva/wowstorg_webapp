// Optional browser smoke against a local production build. ALL API traffic is
// intercepted; unknown routes/mutations fail the check, never reach a database.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[3] ?? "playwright");
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3128");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname), "Only a local build may be checked");
const user = { id: "qa-lifecycle", displayName: "QA · проверка", login: "qa-lifecycle", role: "WOWSTORG", isActive: true, mustSetPassword: false };
const item = { id: "qa-item", name: "QA · позиция", description: null, type: "BULK", isActive: true, internalOnly: false, pricePerDay: "100", purchasePricePerUnit: "500", total: 8, inRepair: 0, broken: 0, missing: 0, photo1Key: null, categories: [], collections: [], updatedAt: "2026-10-12T00:00:00.000Z" };
const saved = { id: "qa", name: "Архив QA", view: "archive", kind: "project", phase: "DONE", from: "2026-09-01", to: "2026-09-30", sort: "amount" };
const calls = [], writes = [], unknown = [], errors = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.addInitScript(({ saved }) => {
    localStorage.setItem("wowstorg.work.saved-views.v1", JSON.stringify([null, saved]));
  }, { saved });
  await context.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), method: request.method() });
    if (request.method() !== "GET") {
      writes.push(url.pathname);
      await route.fulfill({ status: 405, json: { error: { message: "QA forbids writes" } } });
      return;
    }
    let result;
    if (url.pathname === "/api/auth/me") result = { user };
    else if (url.pathname === "/api/me/notifications") result = { rows: [], unreadCount: 0, cursor: { id: "qa", createdAt: "2026-10-12T00:00:00.000Z" } };
    else if (url.pathname === "/api/me/push-subscriptions") result = { enabled: false, publicKey: null };
    else if (url.pathname === "/api/customers") result = { customers: [{ id: "one", name: "Авангард" }, { id: "two", name: "Сбер" }] };
    else if (url.pathname === "/api/work-queue") result = { items: [], meta: { total: 0, projects: 0, standaloneOrders: 0, estimates: 0, undated: 0, from: "2026-09-01", to: "2026-09-30" } };
    else if (url.pathname === "/api/inventory/positions") result = { items: [item] };
    else if (url.pathname === "/api/inventory/positions/qa-item") result = { item, categories: [] };
    else if (url.pathname === "/api/inventory/positions/qa-item/related") result = { relations: [] };
    else if (url.pathname === "/api/inventory/positions/export") { await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "" }); return; }
    else { unknown.push(url.pathname); await route.fulfill({ status: 501, json: { error: { message: "No QA fixture" } } }); return; }
    await route.fulfill({ json: result });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(new URL("/work", base).href);
  await page.getByRole("button", { name: "Архив QA", exact: true }).waitFor();
  await Promise.all([page.waitForResponse(response => response.url().includes("/api/work-queue?") && new URL(response.url()).searchParams.get("view") === "archive"), page.getByRole("button", { name: "Архив QA", exact: true }).click()]);
  const scoped = calls.filter(call => call.path === "/api/work-queue").at(-1).params;
  assert.deepEqual(scoped, { view: "archive", kind: "project", phase: "DONE", from: "2026-09-01", to: "2026-09-30" });
  await page.getByRole("button", { name: "Начать проект", exact: true }).click();
  const customer = page.locator("#create-work-customer");
  await customer.fill("А"); await customer.press("ArrowDown");
  assert.equal(await customer.getAttribute("aria-activedescendant"), "create-work-customer-options-0");
  await customer.fill("Сб");
  assert.equal(await customer.getAttribute("aria-activedescendant"), null);
  await customer.press("ArrowDown"); await customer.press("Enter");
  assert.equal(await customer.inputValue(), "Сбер");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });

  await page.goto(new URL("/inventory/positions", base).href);
  await page.getByText(item.name, { exact: true }).waitFor();
  const before = calls.filter(call => call.path === "/api/inventory/positions").length;
  await page.locator("#pos-list-search").fill("стол");
  await page.waitForTimeout(300); // Assert that typing alone does not dispatch a search.
  assert.equal(calls.filter(call => call.path === "/api/inventory/positions").length, before);
  await Promise.all([page.waitForResponse(response => response.url().includes("/api/inventory/positions?") && new URL(response.url()).searchParams.get("query") === "стол"), page.locator("#pos-list-search").press("Enter")]);
  await page.locator("#pos-list-search").fill("свет");
  await Promise.all([page.waitForResponse(response => response.url().includes("/api/inventory/positions?") && new URL(response.url()).searchParams.get("internalOnly") === "true"), page.getByRole("button", { name: "Внутренние", exact: true }).click()]);
  assert.equal(calls.filter(call => call.path === "/api/inventory/positions").at(-1).params.query, "свет");

  await page.goto(new URL("/inventory/positions/qa-item", base).href);
  await page.locator("#pos-name").waitFor();
  assert.equal(await page.locator("#pos-price").inputValue(), "100");
  assert.equal(await page.locator("#pos-purchase").inputValue(), "500");
  await page.locator("#pos-name").fill("QA · несохранённый черновик");
  await page.locator("#pos-description").fill("Другой ввод вызывает render формы");
  assert.equal(await page.locator("#pos-name").inputValue(), "QA · несохранённый черновик");
  assert.deepEqual(writes, []);
  assert.deepEqual(unknown, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: ["saved-view scope", "native create dialog + keyboard customer selection", "explicit inventory search and visibility scope", "position prices and draft"], apiCalls: calls.length, writes: writes.length, pageErrors: errors.length, target: base.origin }));
} finally { await browser.close(); }
