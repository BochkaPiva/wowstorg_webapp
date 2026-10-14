// Native browser fixtures; all APIs intercepted. No working DB or storage writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[3] ?? "playwright");
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3128");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
const user = { id: "qa", login: "qa", displayName: "QA", role: "WOWSTORG" };
const categories = [{ id: "cat", name: "Мебель" }, { id: "decor", name: "Декор" }];
const collections = [{ id: "collection", name: "Конференция", isActive: true }];
const first = { id: "chair", name: "Стул складной · QA", description: "Высота — 72 см. Сидушка — 38 × 38 см.", type: "ASSET", isActive: true, internalOnly: false, pricePerDay: "150", purchasePricePerUnit: "1181", total: 24, inRepair: 1, broken: 0, missing: 0, photo1Key: "fixture", categories: [{ categoryId: "cat", category: { name: "Мебель" } }], collections: [{ collectionId: "collection", position: 0 }], updatedAt: "2026-10-14T00:00:00.000Z", createdAt: "2026-09-01T00:00:00Z" };
const entries = [first, { ...first, id: "grass", name: "Газон 3 × 6 м · QA", description: "Покрытие для фотозоны и выездного мероприятия", pricePerDay: "5000", total: 1, inRepair: 0, missing: 1, photo1Key: null, categories: [], collections: [], updatedAt: "2026-10-13T00:00:00.000Z" }, { ...first, id: "long", name: "Стойка для большого экрана и оборудования с длинным названием · QA", pricePerDay: "750", description: "Комплект из стойки, креплений и кабель-канала.", total: 4, inRepair: 0, broken: 1, purchasePricePerUnit: null, photo1Key: null }, { ...first, id: "table", name: "Стол круглый · QA", pricePerDay: "1500", total: 12, inRepair: 0, photo1Key: null }];
const errors = [], forbidden = [], checks = [];
let writes = 0;
await mkdir(".impeccable/review/inventory-crud", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [1440, 1920, 390]) {
    let items = structuredClone(entries), failPhoto = true, creates = 0, revision = 0;
    const context = await browser.newContext({ viewport: { width, height: 1100 }, serviceWorkers: "block" });
    await context.route("**/api/**", async route => {
      const req = route.request(), url = new URL(req.url()), method = req.method();
      let json;
      if (method === "GET" && url.pathname === "/api/auth/me") json = { user };
      else if (method === "GET" && url.pathname === "/api/me/notifications") json = { rows: [], unreadCount: 0, cursor: { id: "qa", createdAt: "2026-10-14" } };
      else if (method === "GET" && url.pathname === "/api/me/push-subscriptions") json = { enabled: false, publicKey: null };
      else if (method === "GET" && url.pathname === "/api/inventory/positions") json = url.searchParams.has("options") ? { categories, collections } : { items: items.filter(item => (!url.searchParams.has("query") || item.name.toLowerCase().includes(url.searchParams.get("query").toLowerCase())) && (url.searchParams.get("includeInactive") === "true" || item.isActive) && (!url.searchParams.has("internalOnly") || item.internalOnly === (url.searchParams.get("internalOnly") === "true"))) };
      else if (url.pathname.endsWith("/photo")) {
        if (method === "GET") { await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#eee7ff"/><path d="M65 50h70v60H65zM70 110v45M130 110v45M65 110h70" fill="none" stroke="#6125ad" stroke-width="10"/></svg>' }); return; }
        if (method === "POST") { writes++; if (failPhoto) { failPhoto = false; await route.fulfill({ status: 500, json: { error: { message: "Фото не загрузилось. Попробуйте ещё раз." } } }); return; } items.find(item => item.id === "created").photo1Key = "fixture"; json = { ok: true }; }
      } else if (url.pathname.startsWith("/api/inventory/positions/")) {
        const item = items.find(item => item.id === url.pathname.split("/").at(-1));
        if (method === "GET") json = { item, categories, collections };
        else if (method === "PATCH") { const body = req.postDataJSON(); assert.equal(body.expectedUpdatedAt, item.updatedAt); assert.deepEqual(body.collectionIds, ["collection"]); Object.assign(item, body, { updatedAt: `2026-10-14T01:00:0${++revision}.000Z` }); writes++; json = { ok: true, updatedAt: item.updatedAt }; }
        else if (method === "DELETE") { writes++; await route.fulfill({ status: 409, json: { error: { message: "Позиция используется в истории заявок." } } }); return; }
      } else if (method === "POST" && url.pathname === "/api/inventory/positions") {
        const body = req.postDataJSON(); creates++; assert.equal(creates, 1); assert.deepEqual(body.categoryIds, ["cat"]); assert.deepEqual(body.collectionIds, ["collection"]); assert.equal(body.pricePerDay, 125.5);
        items.unshift({ ...first, ...body, id: "created", photo1Key: null, categories: [{ categoryId: "cat", category: { name: "Мебель" } }], collections: [{ collectionId: "collection", position: 0 }], updatedAt: "2026-10-14T02:00:00.000Z" }); writes++; json = { id: "created", updatedAt: "2026-10-14T02:00:00.000Z" };
      }
      if (!json) { forbidden.push(`${method} ${url.pathname}`); await route.fulfill({ status: 501, json: { error: { message: "No QA fixture" } } }); return; }
      await route.fulfill({ json });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    async function capture(name) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(async () => { for (const image of document.images) image.loading = "eager"; await Promise.race([Promise.all([...document.images].map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 5000))]); });
      assert.equal(await page.locator("img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true, "Capture must not contain broken images");
      await page.screenshot({ path: `.impeccable/review/inventory-crud/${name}-${width}.png`, fullPage: true });
    }
    await page.goto(new URL("/inventory/positions", base).href);
    await page.getByRole("button", { name: `Редактировать ${first.name}`, exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await capture("list");
    const fixturePhoto = await page.locator("article").filter({ has: page.getByRole("link", { name: first.name, exact: true }) }).locator("img").screenshot();
    await page.getByLabel("Сортировка позиций").selectOption("price-desc");
    assert.equal(await page.locator("article").first().getByRole("link").first().textContent(), entries[1].name);
    await page.getByRole("button", { name: `Редактировать ${first.name}`, exact: true }).click();
    const editor = page.getByRole("form", { name: `Редактирование: ${first.name}`, exact: true });
    await editor.getByLabel("Название", { exact: true }).fill("Стул обновлённый · QA"); await editor.getByLabel("Цена аренды / сутки, ₽", { exact: true }).fill("175");
    assert.ok(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await capture("edit");
    await editor.getByRole("button", { name: "Сохранить", exact: true }).click(); await editor.waitFor({ state: "detached" }); await page.getByText("«Стул обновлённый · QA» сохранена.", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/inventory/positions");
    await page.getByRole("button", { name: "Удалить Стул обновлённый · QA", exact: true }).click();
    await page.getByRole("button", { name: "Удалить", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Позиция используется" }).waitFor();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByRole("button", { name: "Новая позиция", exact: true }).click();
    const create = page.getByRole("form", { name: "Новая позиция", exact: true });
    await create.getByLabel("Название", { exact: true }).fill("Новая стойка · QA"); await create.getByLabel("Описание", { exact: true }).fill("Для выездных мероприятий. Кабели входят в комплект.");
    await create.getByLabel("Цена аренды / сутки, ₽", { exact: true }).fill("125,5"); await create.getByLabel("Всего", { exact: true }).fill("6");
    await create.locator("summary").filter({ hasText: "Категории" }).click(); await create.getByLabel("Мебель", { exact: true }).check();
    await create.locator("summary").filter({ hasText: "Подборки" }).click(); await create.getByLabel("Конференция", { exact: true }).check();
    await create.locator('input[type="file"]').setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: fixturePhoto });
    await capture("create");
    await create.getByRole("button", { name: "Добавить позицию", exact: true }).click(); await create.getByText("Данные позиции уже сохранены.", { exact: false }).waitFor();
    await create.getByRole("button", { name: "Сохранить", exact: true }).click(); await create.waitFor({ state: "detached" }); await page.getByRole("link", { name: "Новая стойка · QA", exact: true }).waitFor();
    assert.equal(creates, 1); assert.equal(new URL(page.url()).pathname, "/inventory/positions");
    await page.getByLabel("Поиск позиций", { exact: true }).fill("Новая стойка"); await page.waitForFunction(() => document.querySelectorAll("article").length === 1);
    checks.push({ width, inlineSaveCollapsed: true, sorting: true, linkedDeleteRejected: true, oneFormCreation: true, photoRetryWithoutDuplicate: true, liveSearch: true }); await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  console.log(JSON.stringify({ checks, fixtureWrites: writes, pageErrors: errors.length, forbiddenRequests: forbidden.length }));
} finally { await browser.close(); }
