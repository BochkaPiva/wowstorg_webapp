// Synthetic QA fixtures only; all APIs intercepted, no working database writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[3] ?? "playwright");
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3128");
assert(["localhost", "127.0.0.1"].includes(base.hostname));
const output = ".impeccable/review/catalog-header";
const recaptureCarts = process.argv.includes("--recapture-carts");
await mkdir(output, { recursive: true });
const categories = ["Мебель", "Игры", "Детский реквизит", "Техническое оснащение и сопровождение"].map((name, i) => ({ id: `c${i}`, name, slug: `c${i}` }));
const names = ["Стул складной · QA", "Навигационная стойка · QA", "Стол для регистрации · QA", "Игровой комплект · QA", "Сценический реквизит · QA"];
const items = names.map((name, i) => ({ id: `i${i}`, name, description: "Демонстрационная позиция для проверки интерфейса", type: "ASSET", pricePerDay: "950", photo1Key: null, photo2Key: null, total: 20, inRepair: 0, broken: 0, missing: 0, availability: { availableNow: 20, availableForDates: 20 } }));
const cases = [
  { name: "grinvich-1440", width: 1440, role: "GREENWICH", route: "/catalog" },
  { name: "grinvich-1536", width: 1536, role: "GREENWICH", route: "/catalog" },
  { name: "grinvich-2117", width: 2117, role: "GREENWICH", route: "/catalog" },
  { name: "grinvich-390", width: 390, role: "GREENWICH", route: "/catalog" },
  { name: "warehouse-1440", width: 1440, role: "WOWSTORG", route: "/catalog" },
  { name: "project-1440", width: 1440, role: "WOWSTORG", route: "/catalog?projectId=qa" },
  { name: "demo-390", width: 390, role: "WOWSTORG", route: "/catalog?projectId=qa&projectMode=demo" },
  { name: "supplement-1440", width: 1440, role: "WOWSTORG", route: "/catalog?quickParentId=qa" },
];
const errors = [], unexpected = [], measurements = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const scenario of cases) {
    if (recaptureCarts && !scenario.name.startsWith("grinvich")) continue;
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.width === 1536 ? 1024 : 1000 }, hasTouch: scenario.width === 390, serviceWorkers: "block" });
    const queries = [];
    await context.addInitScript(() => {
      for (const [key, value] of Object.entries({ catalog_startDate: "2030-10-20", catalog_endDate: "2030-10-22", catalog_readyByDate: "2030-10-19", catalog_rentalStartPart: "MORNING", catalog_rentalEndPart: "EVENING" })) localStorage.setItem(key, value);
    });
    await context.route("**/api/**", async route => {
      const req = route.request(), url = new URL(req.url()); let json;
      if (req.method() !== "GET") { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 501, json: { error: { message: "No mutation fixture" } } }); }
      if (url.pathname.startsWith("/api/inventory/positions/") && url.pathname.endsWith("/photo")) return route.fulfill({ status: 302, headers: { location: "/brand/headers/dino-inventory.webp" } });
      if (url.pathname === "/api/auth/me") json = { user: { id: "qa", login: "qa", displayName: "QA · синтетические данные", role: scenario.role } };
      else if (url.pathname === "/api/me/notifications") json = { rows: [], unreadCount: 0, cursor: { id: "qa", createdAt: "2026-10-14T00:00:00Z" } };
      else if (url.pathname === "/api/me/push-subscriptions") json = { enabled: false, publicKey: null };
      else if (url.pathname === "/api/catalog/categories") json = { categories };
      else if (url.pathname === "/api/catalog/kits") json = { kits: [] };
      else if (url.pathname === "/api/catalog/related") json = { suggestions: [], groups: [] };
      else if (url.pathname === "/api/catalog/items") {
        queries.push(Object.fromEntries(url.searchParams));
        const rows = url.searchParams.get("query") === "empty" ? [] : items.filter(item => !url.searchParams.has("ids") || url.searchParams.get("ids").split(",").includes(item.id));
        json = { items: rows, pagination: { page: 1, pageSize: 32, total: rows.length, totalPages: 1 } };
      } else if (url.pathname === "/api/projects/qa") json = { project: { title: "Проект с длинным названием для проверки компактного каталога · QA", eventStartDate: "2030-10-20", eventEndDate: "2030-10-22", eventDateConfirmed: true } };
      else if (url.pathname === "/api/projects/qa/draft-order") json = { draftOrder: { lines: [] } };
      else if (url.pathname === "/api/orders/qa/quick-supplement/parent") json = { readyByDate: "2030-10-19", startDate: "2030-10-20", endDate: "2030-10-22", rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING" };
      if (!json) { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 501, json: { error: { message: "No QA fixture" } } }); }
      return route.fulfill({ json });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    async function capture(name) {
      await page.evaluate(async () => { window.scrollTo({ top: 0, behavior: "instant" }); for (const card of document.querySelectorAll(".mk-card,.mk-kit")) card.style.contentVisibility = "visible"; for (const img of document.images) img.loading = "eager"; await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      await page.waitForFunction(() => window.scrollY === 0 && Math.abs(document.querySelector(".app-topbar").getBoundingClientRect().top) < 1);
      assert(await page.locator("img").evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)));
      await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
      if (name === "grinvich-1536") await page.screenshot({ path: ".impeccable/review/hero-repro.png", animations: "disabled" });
    }
    await page.goto(new URL(scenario.route, base).href);
    await page.locator(".mk-head .mk-title").waitFor(); await page.getByText(names[0], { exact: true }).first().waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await page.locator('.mk-chipRow').evaluate(el => el.getBoundingClientRect().width > 100), "Category filters must remain visible, including mobile");
    assert(await page.locator('.mk-headDino').evaluate(el => el.getBoundingClientRect().bottom <= el.closest('.mk-headIntro').parentElement.getBoundingClientRect().bottom + 1), "Complete scene must finish above search");
    const geometry = await page.evaluate(() => ({ heroHeight: document.querySelector(".mk-headIntro").getBoundingClientRect().height, headerHeight: document.querySelector(".mk-head").getBoundingClientRect().height, firstCardTop: document.querySelector(".mk-card").getBoundingClientRect().top, hero: getComputedStyle(document.querySelector(".mk-headIntro")).backgroundImage }));
    assert(await page.locator('.mk-headIntro').evaluate(node => getComputedStyle(node.parentElement).backgroundImage === "none"), "Chosen timeline must replace the old hero banner");
    if (scenario.width > 1000 && !scenario.route.includes("projectId")) assert(geometry.firstCardTop < 900, "Equipment must appear in the first desktop viewport");
    if (!scenario.route.includes("demo") && !scenario.route.includes("quickParent")) assert.equal(await page.getByLabel("Подготовить к", { exact: true }).count(), 1);
    if (scenario.name === "grinvich-1536") assert.equal(await page.locator('[data-in-range="true"][role="status"]').innerText(), "3 дня аренды");
    measurements.push({ scenario: scenario.name, ...geometry });
    if (!recaptureCarts) await capture(scenario.name);
    if (scenario.name.startsWith("grinvich")) {
      const viewport = page.getByRole("region", { name: "Временная шкала аренды", exact: true });
      const stored = () => page.evaluate(() => ["catalog_readyByDate","catalog_startDate","catalog_endDate"].map(key => localStorage.getItem(key)));
      const initial = await stored();
      const heightBeforePan = await page.locator('.mk-head').evaluate(el => el.getBoundingClientRect().height);
      const layoutGeometry = () => page.evaluate(() => Object.fromEntries(['.mk-head','.mk-catalogNav','.mk-card','[class*="times"]','[data-in-range]'].map(selector => {
        const node = document.querySelector(selector), rect = node.getBoundingClientRect();
        // Product content-visibility may resolve its intrinsic height on focus;
        // the header owns the card's position, not its lazy-rendered contents.
        return [selector, selector === '.mk-card' ? { y: rect.top + scrollY } : { y: rect.top + scrollY, height: rect.height }];
      })));
      const stableGeometry = await layoutGeometry();
      const assertStable = async () => assert.deepEqual(await layoutGeometry(), stableGeometry, "Panning, dragging and short periods must not move the catalogue");
      const originalScroll = await viewport.evaluate(el => el.scrollLeft);
      for (const fraction of [.5, 1.1, 7, .2, 3.8, 0]) {
        await viewport.evaluate((el, value) => { el.scrollLeft = value.base + value.fraction * Number.parseFloat(getComputedStyle(el).getPropertyValue('--day-width')); }, { base: originalScroll, fraction });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await assertStable(); assert.deepEqual(await stored(), initial);
      }
      const firstDay = await page.locator('[data-date]').first().getAttribute('data-date');
      await page.getByRole("button", { name: "Шкала: позже на неделю", exact: true }).click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert(Math.abs(await page.locator('.mk-head').evaluate(el => el.getBoundingClientRect().height) - heightBeforePan) < 1, "Browsing the axis must never change header height");
      if (["grinvich-1440", "grinvich-390"].includes(scenario.name)) await capture(`${scenario.name}-panned`);
      assert.deepEqual(await stored(), initial, "Scrolling is never a mutation");
      await viewport.evaluate(el => { el.scrollLeft = el.scrollWidth - el.clientWidth - 10; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
      await page.waitForFunction(first => document.querySelector('[data-date]')?.getAttribute('data-date') !== first, firstDay);
      assert.equal(await page.locator('[data-date]').count(), 121, "Calendar DOM stays bounded");
      assert.deepEqual(await stored(), initial);
      await page.getByRole("button", { name: "К датам", exact: true }).click();
      if (scenario.name === "grinvich-1536") {
        await viewport.evaluate(el => {
          const start = [...el.querySelectorAll('[data-date]')].findIndex(day => day.getAttribute('data-date') === localStorage.getItem('catalog_startDate'));
          el.scrollLeft = (start + .5) * Number.parseFloat(getComputedStyle(el).getPropertyValue('--day-width'));
        });
        await page.locator('[data-in-range][role="status"]').waitFor({ state: "visible" });
        await assertStable();
        assert.deepEqual(await stored(), initial, "Partial-day panning only changes the attached count presentation");
        await page.getByRole("button", { name: "К датам", exact: true }).click();
      }
      const endingMarker = page.getByRole("slider", { name: "Окончание аренды: переместить дату", exact: true });
      if (scenario.width > 1000) {
        const box = await endingMarker.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 112, box.y + box.height / 2, { steps: 5 });
        assert.deepEqual(await stored(), initial, "Drag preview does not write dates");
        await assertStable();
        assert.equal(await page.getByLabel("Окончание аренды", { exact: true }).inputValue(), "23.10.2030");
        await page.keyboard.press("Escape"); await page.mouse.up(); assert.deepEqual(await stored(), initial);
        const again = await endingMarker.boundingBox();
        await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2); await page.mouse.down();
        await page.mouse.move(again.x + again.width / 2 + 112, again.y + again.height / 2, { steps: 5 }); await page.mouse.up();
        await page.waitForFunction(() => localStorage.getItem("catalog_endDate") === "2030-10-23");
        const endField = page.getByLabel("Окончание аренды", { exact: true }); await endField.fill("22.10.2030"); await endField.press("Tab");
      } else {
        await endingMarker.focus(); await endingMarker.press("ArrowRight");
        await page.waitForFunction(() => localStorage.getItem("catalog_endDate") === "2030-10-23");
        await endingMarker.press("ArrowLeft");
        const rect = await viewport.boundingBox(), cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: rect.x + rect.width - 40, y: rect.y + 45 }] });
        for (let i = 1; i <= 5; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: rect.x + rect.width - 40 - i * 30, y: rect.y + 45 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        assert.deepEqual(await stored(), initial, "Touch scrolling leaves dates unchanged");
        await page.getByRole("button", { name: "К датам", exact: true }).click();
      }
      for (const label of ["Подготовить к", "Начало аренды", "Окончание аренды"]) {
        const trigger = page.getByRole("button", { name: `Открыть календарь: ${label}`, exact: true });
        await trigger.focus(); await page.keyboard.press("Enter");
        const picker = page.getByRole("dialog", { name: `Календарь: ${label}`, exact: true }); await picker.waitFor();
        assert(await picker.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
        await page.keyboard.press("Escape"); await picker.waitFor({ state: "detached" });
        assert(await trigger.evaluate(node => node === document.activeElement));
      }
      const partGroup = page.getByRole("group", { name: "Начало аренды: время", exact: true });
      const evening = partGroup.getByRole("button", { name: "Вечером", exact: true });
      await evening.click(); assert.equal(await evening.getAttribute("aria-pressed"), "true");
      await page.waitForFunction(() => localStorage.getItem("catalog_rentalStartPart") === "EVENING");
      if (["grinvich-1440", "grinvich-390"].includes(scenario.name)) await capture(`${scenario.name}-time-switch`);
      assert.equal(await page.getByRole("listbox").count(), 0);
      const morning = partGroup.getByRole("button", { name: "Утром", exact: true });
      await evening.press("ArrowLeft"); assert.equal(await morning.getAttribute("aria-pressed"), "true");
      await page.waitForFunction(() => localStorage.getItem("catalog_rentalStartPart") === "MORNING");
      const readiness = page.getByLabel("Подготовить к", { exact: true });
      await readiness.fill("18.10.2030"); await readiness.press("Tab");
      await page.waitForFunction(() => localStorage.getItem("catalog_readyByDate") === "2030-10-18");
      const ending = page.getByLabel("Окончание аренды", { exact: true });
      await ending.fill("19.10.2030"); await ending.press("Tab"); await page.waitForFunction(() => localStorage.getItem("catalog_endDate") === "2030-10-20");
      assert.equal(await page.getByRole("group", { name: "Начало аренды: время", exact: true }).count(), 0);
      await assertStable();
      if (["grinvich-1440", "grinvich-390"].includes(scenario.name)) await capture(`${scenario.name}-single-day`);
      await ending.fill("22.10.2030"); await ending.press("Tab");
      const search = page.getByRole("textbox", { name: "Поиск по каталогу", exact: true });
      await search.fill("empty"); await page.waitForFunction(() => document.querySelectorAll(".mk-card").length === 0);
      await page.getByRole("button", { name: "Очистить поиск", exact: true }).click(); await page.getByText(names[0], { exact: true }).first().waitFor();
      await page.getByRole("tab", { name: "Пакеты", exact: true }).click();
      assert.equal(await page.getByRole("tab", { name: "Пакеты", exact: true }).getAttribute("aria-selected"), "true");
      await page.getByRole("tab", { name: "Позиции", exact: true }).click(); await page.getByText(names[0], { exact: true }).first().waitFor();
      await page.locator(".mk-card").first().getByRole("button", { name: "В корзину", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".mk-headCart")?.getAttribute("data-filled") === "true");
      assert.equal(await page.locator(".mk-headCart strong").innerText(), "1");
      assert(queries.some(query => query.rentalStartPartOfDay === "EVENING"));
      await page.waitForFunction(() => !document.querySelector(".mk-cartFeedback"));
      await capture(`${scenario.name}-cart`);
    } else if (scenario.name.startsWith("demo") || scenario.name.startsWith("supplement")) {
      assert.equal(await page.getByLabel("Начало аренды", { exact: true }).count(), 0);
      if (scenario.name.startsWith("demo")) assert(queries.every(query => !query.startDate && !query.endDate));
    }
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: true, measurements, cases: measurements.length, errors, unexpected, API: "intercepted QA fixtures only" }));
} finally { await browser.close(); }
