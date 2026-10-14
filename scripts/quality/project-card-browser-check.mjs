// UI fixtures only. Every API is intercepted; no production/working database writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[3] ?? "playwright");
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3128");
assert(["localhost", "127.0.0.1"].includes(base.hostname));
const user = { id: "qa", login: "qa", displayName: "QA · Михаил", role: "WOWSTORG" };
const stamp = "2026-10-14T00:00:00.000Z";
const financials = { clientSubtotal: 33000, internalSubtotal: 17000, cashInternalCostTax: 0, internalExpensesTotal: 17000, commission: 0, clientChargeTax: 0, revenueTotal: 33000, tax: 0, grossMargin: 16000, marginAfterTax: 16000, marginAfterTaxPct: 48.48 };
const localLine = { id: "local-line", position: 0, lineNumber: 1, name: "Навигационные стойки · QA", description: "Доставка и аренда стоек для мероприятия", lineType: "CONTRACTOR", costClient: "30000", costInternal: "17000", orderLineId: null, itemId: null, qty: 10, unit: "шт", unitPriceClient: 3000, internalExpenses: [], customValues: {} };
const person = { id: "r1", contractorId: null, name: "Октава · QA", responsibility: "Доставка и аренда оборудования", categoryNames: ["Оборудование"], contactName: "Юрий Шилов", phone: "+7 900 123-45-67", email: null, status: "PENDING", scheduleSlotId: null, arrivalNote: "Доставка к служебному входу, 08:30", internalNotes: null, revision: 0, photoUrl: null, updatedAt: stamp, scheduleLabel: null, latestEntry: { id: "old", body: "Обсудили состав оборудования. Ждём подтверждение цены и времени доставки.", status: "WAITING", createdAt: stamp, author: { id: "qa", displayName: user.displayName } } };
const other = { ...person, id: "r2", name: "Андрей Колотилин · QA", responsibility: "Ведение программы и работа с гостями", categoryNames: ["Ведущие"], phone: null, contactName: null, arrivalNote: null, status: "CONFIRMED", latestEntry: null };
const forbidden = [], errors = [];
let writes = 0;
await mkdir(".impeccable/review/project-card", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [1440, 2048, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
    let rows = structuredClone([person, other]), failEntry = true, attempts = [], boardEnabled = false;
    let order = { id: "order", status: "ESTIMATE_SENT", source: "GREENWICH_INTERNAL", updatedAt: stamp, createdAt: stamp, eventName: "Аренда оборудования · QA", readyByDate: "2026-10-19", startDate: "2026-10-20", endDate: "2026-10-20", rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING", payMultiplier: 1, clientPaymentMethod: "NON_CASH", rentalDiscountType: "NONE", deliveryEnabled: false, montageEnabled: false, demontageEnabled: false, lines: [{ id: "ol", itemId: "item", requestedQty: 2, pricePerDaySnapshot: 1500, warehouseComment: null, item: { id: "item", name: "Комплект стоек · QA", type: "ASSET", total: 10, inRepair: 0, broken: 0, missing: 0 } }] };
    let project = { id: "project", title: "Конференция команды · QA", mode: "FULL", status: "INTERNAL_PREP", ball: "WOWSTORG", archivedAt: null, eventStartDate: "2026-10-20", eventEndDate: "2026-10-20", eventDateConfirmed: true, createdAt: stamp, updatedAt: stamp, customer: { id: "customer", name: "QA · демонстрационные данные" }, owner: user, createdBy: user, revision: 0, members: [{ userId: "qa", displayName: user.displayName }], _count: { orders: 1, tasks: 0, contacts: 0, projectFiles: 0, scheduleDays: 0 }, estimateCurrent: { id: "version", versionNumber: 1 }, draftOrder: null, activityLogs: [], widgets: ["ESTIMATE", "ORDERS", "CONTRACTORS", "NOTES"].map((type, index) => ({ instanceKey: type.toLowerCase(), type, sortOrder: index, x: 0, y: index, width: 12, heightPreset: "AUTO", isVisible: true })) };
    project.members = [{ user, role: "OWNER" }];
    const version = { id: "version", versionNumber: 1, revision: 0, title: "Смета 1", note: null, sortOrder: 0, includeInProjectTotals: true, isPrimary: true, createdAt: stamp, createdBy: user, commissionEnabled: false, clientTaxEnabled: false, clientChargeTaxEnabled: false, customColumns: [] };
    const estimate = () => ({ projectTitle: project.title, versions: [{ ...version, financials }], current: { ...version, sections: [{ id: "local", sortOrder: 0, title: "Подрядчики · QA", kind: "CONTRACTOR", linkedOrderId: null, lines: [localLine] }, { id: "linked", sortOrder: 1, title: "Реквизит · QA", kind: "REQUISITE", linkedOrderId: "order", lines: [{ id: "est-ol", position: 0, lineNumber: 1, name: "Комплект стоек · QA", description: null, lineType: "RENTAL", costClient: String(order.lines[0].requestedQty * order.lines[0].pricePerDaySnapshot), costInternal: "0", orderLineId: "ol", itemId: "item" }] }] }, projectOrders: [{ ...order, assignedEstimate: { id: "version", versionNumber: 1, title: "Смета 1" } }] });
    await context.route("**/api/**", async route => {
      const req = route.request(), url = new URL(req.url()), method = req.method();
      let json;
      if (method === "GET" && url.pathname === "/api/auth/me") json = { user };
      else if (method === "GET" && url.pathname === "/api/me/notifications") json = { rows: [], unreadCount: 0, cursor: { id: "qa", createdAt: stamp } };
      else if (method === "GET" && url.pathname === "/api/me/push-subscriptions") json = { enabled: false, publicKey: null };
      else if (method === "GET" && url.pathname === "/api/projects/project") json = { project: { ...project, orders: [order], widgets: [...project.widgets, ...(boardEnabled ? [{ instanceKey: "board", type: "FREE_BOARD", width: 12, heightPreset: "LARGE", sortOrder: 8, isVisible: true }] : [])] }, features: { projectWorkspaceV2: true, projectEstimateGridV2: true } };
      else if (method === "GET" && url.pathname === "/api/projects/project/estimate") json = estimate();
      else if (url.pathname === "/api/projects/project/contractors" && method === "GET") json = { assignments: rows, scheduleSlots: [], proposal: null };
      else if (url.pathname.endsWith("/entries") && url.pathname.includes("/contractors/")) {
        const row = rows.find(row => url.pathname.includes(`/${row.id}/`));
        if (method === "GET") json = { entries: row.latestEntry ? [row.latestEntry] : [], nextCursor: null };
        else if (method === "POST") {
          const body = req.postDataJSON(); attempts.push(body); writes++;
          if (failEntry) { failEntry = false; await route.fulfill({ status: 500, json: { error: { message: "QA: связь прервалась. Повторите сохранение." } } }); return; }
          assert.equal(body.expectedRevision, row.revision); row.revision++;
          row.latestEntry = { id: body.id, body: body.body, status: body.status, createdAt: stamp, author: user }; json = { ok: true };
        }
      } else if (method === "PATCH" && url.pathname.includes("/contractors/")) {
        const row = rows.find(row => url.pathname.endsWith(`/${row.id}`)); const body = req.postDataJSON();
        assert.equal(body.expectedRevision, row.revision); Object.assign(row, body, { revision: row.revision + 1 }); writes++; json = { ok: true };
      } else if (method === "GET" && url.pathname === "/api/orders/order") json = { order };
      else if (method === "PATCH" && url.pathname === "/api/orders/order/warehouse-edit") {
        const body = req.postDataJSON(); assert.equal(body.expectedUpdatedAt, order.updatedAt); assert.equal(body.lines[0].pricePerDaySnapshot, 1700.5);
        order = { ...order, ...body, lines: [{ ...order.lines[0], ...body.lines[0] }], updatedAt: "2026-10-14T01:00:00.000Z", status: "SUBMITTED" }; writes++; json = { ok: true };
      } else if (method === "GET" && url.pathname === "/api/catalog/items") json = { items: [{ ...order.lines[0].item, pricePerDay: 100, availability: { availableNow: 10, availableForDates: 10 } }] };
      else if (method === "GET" && url.pathname.endsWith("/workspace")) json = { projectId: "project", revision: 0, items: [], widgets: [] };
      if (!json) { forbidden.push(`${method} ${url.pathname}`); await route.fulfill({ status: 501, json: { error: { message: "No QA fixture" } } }); return; }
      await route.fulfill({ json });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    async function capture(name) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(async () => { for (const image of document.images) image.loading = "eager"; await Promise.race([Promise.all([...document.images].map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 5000))]); });
      assert(await page.locator("img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
      await page.screenshot({ path: `.impeccable/review/project-card/${name}-${width}.png`, fullPage: true });
    }
    await page.goto(new URL("/projects/project", base).href);
    await page.getByRole("heading", { name: "Октава · QA", exact: true }).waitFor().catch(async error => { console.error(JSON.stringify({ errors, forbidden, text: await page.locator("body").innerText() })); throw error; });
    assert.equal(await page.getByRole("button", { name: "На доску", exact: true }).count(), 0);
    assert.equal(await page.locator('[data-widget="EVENT_BUILDER"]').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await capture("workspace");
    await page.getByRole("button", { name: "Действия: Октава · QA", exact: true }).click();
    const contractorMenu = page.getByRole("dialog", { name: "Действия: Октава · QA", exact: true });
    assert.equal(await contractorMenu.getByRole("button", { name: "На доску", exact: true }).count(), 0);
    await contractorMenu.getByRole("button", { name: "Изменить данные", exact: true }).click();
    const contractorEditor = page.getByRole("dialog", { name: "Редактирование: Октава · QA", exact: true });
    await contractorEditor.getByLabel("Телефон", { exact: true }).fill("+7 900 999-88-77");
    await contractorEditor.getByRole("button", { name: "Сохранить", exact: true }).click();
    await contractorEditor.waitFor({ state: "detached" });
    const notes = page.locator(".project-status-panel__field textarea").first();
    await notes.fill("Несохранённый контекст · QA");
    await page.getByRole("button", { name: "Общение и договорённости: Октава · QA", exact: true }).click();
    const journal = page.getByRole("region", { name: "Общение: Октава · QA", exact: true });
    await journal.getByText(person.latestEntry.body, { exact: true }).waitFor();
    await journal.getByLabel("Итог разговора: Октава · QA", { exact: true }).fill("Подтвердили 10 стоек, доставка в 08:30. Оплата после мероприятия.");
    await journal.getByLabel("Статус общения: Октава · QA", { exact: true }).selectOption("AGREED");
    await journal.getByRole("button", { name: "Записать итог", exact: true }).click();
    await journal.getByRole("alert").waitFor();
    await journal.getByRole("button", { name: "Записать итог", exact: true }).click();
    await journal.getByText("Запись сохранена", { exact: true }).waitFor();
    assert.equal(await notes.inputValue(), "Несохранённый контекст · QA", "Other module saves must retain context drafts");
    assert(await page.locator('[data-widget="CONTRACTORS"] > .project-workspace-widget__body').evaluate(node => node.scrollWidth <= node.clientWidth + 1), "Contractor content must not overflow its module");
    assert.equal(attempts[0].id, attempts[1].id, "Retry must reuse UUID");
    await capture("communication");
    await journal.getByRole("button", { name: "Свернуть", exact: true }).click();
    await page.getByRole("button", { name: "Действия: Андрей Колотилин · QA", exact: true }).click();
    await page.getByRole("button", { name: "Убрать из состава", exact: true }).click();
    await page.getByRole("button", { name: "Убрать", exact: true }).click();
    await page.getByText("Не участвуют · 1", { exact: true }).click();
    await page.getByRole("button", { name: "Действия: Андрей Колотилин · QA", exact: true }).click();
    await page.getByRole("button", { name: "Вернуть в состав", exact: true }).click();
    assert.equal(await page.locator('[data-estimate-section-id="linked"]').getByRole("button", { name: "Сохранить", exact: true }).count(), 0, "Saved order must not expose a redundant save button");
    await page.getByRole("button", { name: "Действия со связанной заявкой", exact: true }).click();
    const orderMenu = page.getByRole("dialog", { name: "Действия со связанной заявкой", exact: true });
    await orderMenu.getByRole("link", { name: "Открыть заявку", exact: true }).waitFor();
    assert(await orderMenu.evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; }));
    await page.keyboard.press("Escape");
    await page.locator('[data-estimate-section-id="linked"]').locator("summary").click({ position: { x: 10, y: 10 } });
    const tariff = page.getByLabel("Тариф за сутки: Комплект стоек · QA", { exact: true });
    await tariff.waitFor({ state: "visible" }); await tariff.fill("1700,50");
    await page.locator('[data-estimate-section-id="linked"]').getByRole("button", { name: "Сохранить", exact: true }).click();
    await tariff.waitFor(); await page.waitForFunction(() => document.querySelector('input[aria-label="Тариф за сутки: Комплект стоек · QA"]')?.value === "1700.5");
    await capture("tariff");
    await tariff.focus();
    await page.evaluate(() => { const rect = document.querySelector('[data-widget="ESTIMATE"]').getBoundingClientRect(); window.scrollBy(0, rect.top - 40); });
    assert(await page.evaluate(() => document.elementFromPoint(innerWidth - 120, 35)?.closest(".app-topbar") !== null), "Focused estimate must remain below sticky app header");
    await page.getByRole("button", { name: "Развернуть «Подрядчики проекта» на весь экран", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Подрядчики проекта", exact: true }); await dialog.waitFor();
    assert(await dialog.evaluate(node => node.getBoundingClientRect().top === 0));
    await dialog.getByRole("button", { name: "Вернуть «Подрядчики проекта» в карточку", exact: true }).click();
    await page.getByRole("button", { name: "Действия: Заявки", exact: true }).click();
    await page.getByRole("button", { name: "Свернуть содержимое", exact: true }).click();
    assert(await page.evaluate(() => Math.abs(document.querySelector('[data-widget="ORDERS"]').getBoundingClientRect().width - document.querySelector('[data-widget="ESTIMATE"]').getBoundingClientRect().width) < 2));
    assert.equal(new URL(page.url()).pathname, "/projects/project");
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  console.log(JSON.stringify({ passed: true, widths: [1440, 2048, 390], writes, scenarios: ["optional-builder", "board-disabled", "journal-in-place", "retry-UUID", "cancel-restore", "order-tariff-preview-save", "sticky-header-layer", "fullscreen", "no-navigation"], API: "intercepted QA fixtures, not production" }));
} finally { await browser.close(); }
