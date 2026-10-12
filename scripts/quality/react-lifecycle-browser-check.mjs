// Optional browser smoke against a local production build. ALL API traffic is
// intercepted; unknown routes/mutations fail the check, never reach a database.
// The proposal case allows exactly two validated, fulfilled fixture POSTs.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[3] ?? "playwright");
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3128");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname), "Only a local build may be checked");
const user = { id: "qa-lifecycle", displayName: "QA · проверка", login: "qa-lifecycle", role: "WOWSTORG", isActive: true, mustSetPassword: false };
const item = { id: "qa-item", name: "QA · позиция", description: null, type: "BULK", isActive: true, internalOnly: false, pricePerDay: "100", purchasePricePerUnit: "500", total: 8, inRepair: 0, broken: 0, missing: 0, photo1Key: null, categories: [], collections: [], updatedAt: "2026-10-12T00:00:00.000Z" };
const saved = { id: "qa", name: "Архив QA", view: "archive", kind: "project", phase: "DONE", from: "2026-09-01", to: "2026-09-30", sort: "amount" };
const project = { id: "qa-project", title: "QA · проект", mode: "FULL", leadCustomerName: null, status: "LEAD", ball: "CLIENT", archivedAt: null, archiveNote: null, eventStartDate: null, eventEndDate: null, eventDateConfirmed: false, updatedAt: "2026-10-12T00:00:00.000Z", customer: null, owner: user, _count: { orders: 0 }, finance: { revenueTotal: 123, marginAfterTax: 100, marginAfterTaxPct: 81 } };
const task = { id: "qa-task", title: "QA · задача", description: null, priority: "NORMAL", color: "#334155", sortOrder: 0, startDate: null, dueDate: null, dueTime: null, reminderAt: "2026-10-20T07:00:00.000Z", reminderText: "QA", priorityStickerEnabled: false, priorityStickerConfigured: false, deadlineStickerEnabled: false, reminderStickerEnabled: true, assigneeStickerEnabled: false, completedAt: null, updatedAt: "2026-10-13T00:00:00.000Z", assignee: null, assignees: [], project: null, order: null, checklistItems: [], checklistTotal: 0, checklistDone: 0, commentCount: 0 };
const taskBoard = { id: "qa-board", title: "QA · доска", description: null, isDefault: true, updatedAt: "2026-10-13T00:00:00.000Z", syncToken: "qa", columns: [{ id: "qa-open", title: "В работе", isDone: false, sortOrder: 0, tasks: [task] }] };
const proposalItem = { id: "qa-existing", offerId: null, selectionRole: "PRIMARY", qty: 1, clientUnitPrice: 100, internalUnitCost: 20, priceTypeSnapshot: "FIXED", unitLabel: "шт.", contractorNameSnapshot: "QA · подрядчик", offerTitleSnapshot: "QA · существующая услуга", offerDescriptionSnapshot: "Описание", clientNote: null, assetSnapshot: null };
const proposal = { id: "qa-proposal", title: "QA · КП", revision: 10, status: "DRAFT", clientIntro: "Клиентский текст", clientOutro: null, owner: { type: "STANDALONE", customer: null, leadCustomerName: null, convertedAt: null }, variants: [{ id: "qa-variant", title: "Основной", isRecommended: true, sections: [{ id: "qa-section", title: "Оборудование QA", category: { id: "qa-category", name: "Оборудование QA" }, items: [proposalItem] }] }] };
const proposalContractor = { id: "qa-contractor", name: "Подрядчик QA", photoUrl: null, offers: [{ id: "qa-offer", title: "Услуга QA", description: "Каталожный текст", clientPrice: 300, clientPriceMax: null, priceType: "FIXED", unitLabel: "шт.", priceConfirmedAt: "2026-10-13", category: { id: "qa-category", name: "Оборудование QA" } }] };
const fixtureWrites = [];
const estimateOnly = process.argv.includes("--estimate-only");
const estimateLine = { id: "qa-line", position: 0, lineNumber: 1, name: "QA line", description: null, lineType: "OTHER", costClient: "100", costInternal: "20", unit: "шт", qty: 1, unitPriceClient: 100, internalExpenses: [], customValues: {}, itemId: null, orderLineId: null };
const estimateFinance = { revenueTotal: 100, marginAfterTax: 80, marginAfterTaxPct: 80 };
const estimate = { projectTitle: "QA estimate", projectOrders: [], versions: [{ id: "qa-version", versionNumber: 1, title: "QA estimate", isPrimary: true, sortOrder: 1, includeInProjectTotals: true, createdAt: "2026-10-13", createdBy: { displayName: "QA" }, financials: estimateFinance }], current: { id: "qa-version", versionNumber: 1, revision: 10, title: "QA estimate", commissionEnabled: false, clientTaxEnabled: false, clientChargeTaxEnabled: false, customColumns: [], sections: [{ id: "qa-section", title: "QA section", sortOrder: 1, kind: "LOCAL", linkedOrderId: null, lines: [estimateLine] }] } };
let releaseProposalAdd;
const proposalAddSeen = new Promise(resolve => { releaseProposalAdd = resolve; });
const calls = [], writes = [], unknown = [], errors = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.addInitScript(({ saved }) => {
    localStorage.setItem("wowstorg.work.saved-views.v1", JSON.stringify([null, saved]));
  }, { saved });
  await context.route(new URL("/qa-task-host", base).href, route => route.fulfill({ contentType: "text/html", body: `<html><body><iframe title="Embedded tasks" style="width:1200px;height:900px" src="${new URL("/tasks?embed=1&projectId=qa-project", base).href}"></iframe></body></html>` }));
  await context.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), method: request.method() });
    if (estimateOnly && request.method() === "PATCH" && url.pathname === "/api/standalone-estimates/qa-estimate/estimate") {
      const command = request.postDataJSON(); fixtureWrites.push(command);
      assert.equal(fixtureWrites.length, 1); assert.equal(command.versionNumber, 1);
      assert.equal(command.expectedRevision, undefined);
      assert.deepEqual({ qty: command.localSections[0].lines[0].qty, price: command.localSections[0].lines[0].unitPriceClient, total: command.localSections[0].lines[0].costClient }, { qty: 2, price: 150, total: 300 });
      await route.fulfill({ json: { revision: 11 } }); return;
    }
    if (request.method() === "POST" && url.pathname === "/api/proposals/qa-proposal/mutations") {
      const command = request.postDataJSON(); fixtureWrites.push(command);
      assert.match(command.mutationId, /^[0-9a-f-]{36}$/);
      if (fixtureWrites.length === 1) {
        assert.deepEqual({ action: command.action, sectionId: command.sectionId, offerId: command.offerId, expectedRevision: command.expectedRevision }, { action: "ADD_CATALOG_ITEM", sectionId: "qa-section", offerId: "qa-offer", expectedRevision: 10 });
        assert.equal(command.assetSnapshot, undefined); releaseProposalAdd(route); return;
      }
      assert.equal(fixtureWrites.length, 2);
      assert.deepEqual({ action: command.action, itemId: command.itemId, expectedRevision: command.expectedRevision }, { action: "REMOVE_ITEM", itemId: "qa-created", expectedRevision: 11 });
      await route.fulfill({ json: { proposal: { ...proposal, revision: 12 }, changeId: "6a3be23d-93f1-4041-a99a-b19ef6f1cc3c" } }); return;
    }
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
    else if (url.pathname === "/api/projects") result = { projects: [project] };
    else if (url.pathname === "/api/projects/meta") result = { users: [user], currentUserId: user.id, templates: [] };
    else if (url.pathname === "/api/standalone-estimates/qa-estimate") result = { estimate: { id: "qa-estimate", title: "QA estimate", leadCustomerName: "QA", convertedAt: null, convertedProjectId: null, createdAt: "2026-10-13", updatedAt: "2026-10-13", customer: null, owner: user } };
    else if (url.pathname === "/api/standalone-estimates/qa-estimate/estimate") result = estimate;
    else if (url.pathname === "/api/catalog/items") result = { items: [{ ...item, photo2Key: null, availability: { availableNow: 5, availableForDates: 5 } }], pagination: { page: 1, pageSize: 32, total: 1, totalPages: 1 } };
    else if (url.pathname === "/api/catalog/categories") result = { categories: [] };
    else if (url.pathname === "/api/catalog/kits") result = { kits: [] };
    else if (url.pathname === "/api/catalog/related") result = { groups: [] };
    else if (url.pathname === "/api/users/greenwich") result = { users: [] };
    else if (url.pathname === "/api/tasks/boards") result = { boards: [{ ...taskBoard, _count: { tasks: 1, columns: 1 } }] };
    else if (url.pathname === "/api/tasks/meta") result = { users: [user], projects: [], orders: [] };
    else if (url.pathname === "/api/tasks/boards/qa-board") result = { board: taskBoard };
    else if (url.pathname === "/api/proposals/qa-proposal") result = { proposal };
    else if (url.pathname === "/api/contractor-categories") result = { categories: [{ id: "qa-category", name: "Оборудование QA" }] };
    else if (url.pathname === "/api/contractors") result = { contractors: [proposalContractor], nextCursor: null };
    else if (url.pathname === "/api/inventory/positions") result = { items: [item] };
    else if (url.pathname === "/api/inventory/positions/qa-item") result = { item, categories: [] };
    else if (url.pathname === "/api/inventory/positions/qa-item/related") result = { relations: [] };
    else if (url.pathname === "/api/inventory/positions/qa-item/photo") { await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#eee"/></svg>' }); return; }
    else if (url.pathname === "/api/inventory/positions/export") { await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "" }); return; }
    else { unknown.push(url.pathname); await route.fulfill({ status: 501, json: { error: { message: "No QA fixture" } } }); return; }
    await route.fulfill({ json: result });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  if (estimateOnly) {
    await page.goto(new URL("/estimates/qa-estimate", base).href);
    const quantity = page.locator('[data-estimate-line="qa-line"][data-estimate-column="qty"]');
    await quantity.waitFor(); await quantity.fill("2");
    const price = page.locator('[data-estimate-line="qa-line"][data-estimate-column="unitPriceClient"]'); await price.fill("150");
    await page.getByRole("button", { name: "Отменить последнее изменение", exact: true }).click();
    assert.equal(await price.inputValue(), "100"); assert.equal(await quantity.inputValue(), "2");
    await page.getByRole("button", { name: "Вернуть отменённое изменение", exact: true }).click();
    assert.equal(await price.inputValue(), "150");
    await page.waitForFunction(() => localStorage.getItem("project-estimate-draft:qa-estimate:v1") === null);
    assert.equal(fixtureWrites.length, 1);
  }
  if (!process.argv.includes("--proposal-only") && !estimateOnly) {
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

  await page.goto(new URL("/projects?tab=archive&q=September&sort=title_asc&stage=completion&ball=NONE", base).href);
  await page.getByText(project.title, { exact: true }).waitFor();
  assert.deepEqual(calls.filter(call => call.path === "/api/projects").at(-1).params, { archive: "1", sort: "title_asc", q: "September", stage: "completion", ball: "NONE" });
  assert.equal(await page.getByRole("searchbox", { name: "Найти проект" }).inputValue(), "September");
  await page.getByRole("searchbox", { name: "Найти проект" }).fill("October");
  await page.waitForURL(url => url.searchParams.get("q") === "October");
  await page.getByRole("button", { name: "Активные", exact: true }).click();
  await page.waitForURL(url => !url.searchParams.has("tab"));
  assert.equal(await page.getByRole("searchbox", { name: "Найти проект" }).inputValue(), "October");
  assert.equal(await page.getByRole("combobox", { name: "Сортировка", exact: true }).inputValue(), "updated_desc");

  await page.goto(new URL("/catalog", base).href);
  await page.getByRole("button", { name: "В корзину", exact: true }).waitFor();
  await page.getByRole("button", { name: "В корзину", exact: true }).click();
  const catalogQuantity = page.locator('.mk-card input[aria-label="Количество"]');
  await catalogQuantity.fill("2"); await catalogQuantity.press("Enter");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("cart") ?? "[]")[0]?.qty === 2);
  await page.goto(new URL("/cart", base).href);
  const cartQuantity = page.locator('.cart-row input[aria-label="Количество"]');
  await cartQuantity.waitFor(); assert.equal(await cartQuantity.inputValue(), "2");
  await cartQuantity.focus(); await cartQuantity.blur();
  assert.equal(await cartQuantity.inputValue(), "2");
  await page.getByRole("button", { name: "Увеличить", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("cart") ?? "[]")[0]?.qty === 3);
  assert.equal(await cartQuantity.inputValue(), "3");

  await page.goto(new URL("/qa-task-host", base).href);
  const frame = page.frameLocator("iframe");
  await frame.locator('.task-card').waitFor();
  assert.deepEqual(calls.filter(call => call.path === "/api/tasks/boards/qa-board").at(-1).params, { projectId: "qa-project", includeClosedProjectTasks: "1", archived: "0" });
  await frame.getByRole("button", { name: "Действия с задачей", exact: true }).click();
  await frame.locator('.task-popover').waitFor();
  assert.equal(await page.locator('.task-popover').count(), 0);
  await frame.getByRole("button", { name: "✎ Переименовать и настроить", exact: true }).click();
  const taskDialog = page.getByRole("dialog"); await taskDialog.waitFor();
  assert.equal(await frame.getByRole("dialog").count(), 0);
  await taskDialog.locator("textarea").first().fill("QA · черновик");
  await taskDialog.locator("textarea").nth(1).fill("Другой ввод");
  assert.equal(await taskDialog.locator("textarea").first().inputValue(), "QA · черновик");
  await taskDialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await taskDialog.waitFor({ state: "hidden" });
  }
  if (!estimateOnly) {
  await page.goto(new URL("/proposals/qa-proposal", base).href);
  await page.getByRole("heading", { name: proposal.title, exact: true }).waitFor();
  await page.getByRole("button", { name: "Подобрать услуги: Оборудование QA", exact: true }).first().click();
  const picker = page.getByRole("dialog", { name: "Подбор услуг", exact: true }); await picker.waitFor();
  const checkbox = picker.getByRole("checkbox", { name: "Выбрать Услуга QA — Подрядчик QA", exact: true }); await checkbox.check();
  const pendingRoute = await proposalAddSeen;
  assert.equal(await checkbox.isChecked(), true); assert.equal(await page.getByRole("button", { name: "Скачать КП", exact: true }).isDisabled(), true);
  await checkbox.uncheck(); assert.equal(await checkbox.isChecked(), false); assert.equal(fixtureWrites.length, 1);
  const deleted = page.waitForResponse(response => response.url().endsWith("/api/proposals/qa-proposal/mutations") && response.request().postDataJSON()?.action === "REMOVE_ITEM");
  const acknowledged = structuredClone(proposal); acknowledged.revision = 11;
  acknowledged.variants[0].sections[0].items.push({ ...proposalItem, id: "qa-created", offerId: "qa-offer", offerTitleSnapshot: "Услуга QA", contractorNameSnapshot: "Подрядчик QA", clientUnitPrice: 300 });
  await pendingRoute.fulfill({ json: { proposal: acknowledged, changeId: "7579cd94-47b2-4f4d-a356-9aee0f3552a3" } }); await deleted;
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wowstorg:proposal-recovery:v1:qa-lifecycle:qa-proposal") ?? "{}").pending === null);
  assert.equal(await checkbox.isChecked(), false); assert.equal(fixtureWrites.length, 2);
  await picker.getByRole("button", { name: "Готово", exact: true }).click(); await picker.waitFor({ state: "hidden" });
  await page.locator("button").filter({ has: page.getByRole("heading", { name: "QA · существующая услуга", exact: true }) }).click();
  const settings = page.getByRole("dialog", { name: "Параметры КП", exact: true }); await settings.waitFor();
  await settings.locator('textarea[name="note"]').fill("QA · несохранённый комментарий"); await settings.locator('input[name="qty"]').fill("2");
  assert.equal(await settings.locator('textarea[name="note"]').inputValue(), "QA · несохранённый комментарий");
  page.once("dialog", dialog => dialog.accept()); await settings.getByRole("button", { name: "Закрыть", exact: true }).click(); await settings.waitFor({ state: "hidden" });
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(unknown, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: estimateOnly ? ["native estimate grid, same-frame draft, undo/redo, validated autosave, journal cleanup"] : process.argv.includes("--proposal-only") ? ["native proposal popover, ADD/deselect/acknowledged REMOVE, immutable IDs/CAS, retained item draft"] : ["saved-view scope", "native create dialog + keyboard customer selection", "explicit inventory search and visibility scope", "position prices and draft", "project URL filters, debounced query acknowledgement and tab scope", "actual catalog card to cart quantity restore, blur and increment", "native iframe task scope, local menu and parent form draft", "native proposal picker and serialized fixture mutations"], apiCalls: calls.length, fixtureWrites: fixtureWrites.length, forbiddenWrites: writes.length, pageErrors: errors.length, target: base.origin }));
} finally { await browser.close(); }
