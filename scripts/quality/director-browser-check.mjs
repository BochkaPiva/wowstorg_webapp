// Local production-build UI check. All APIs are fulfilled fixtures; no remote DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[3] ?? "playwright");
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3128");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
const user = { id: "qa", displayName: "QA", role: "WOWSTORG", login: "qa", isActive: true, mustSetPassword: false };
const task = { id: "qa-task", title: "Подготовить предложение для Сбера · QA", description: "Два варианта бюджета к пятнице", directorRequest: { directorName: "Директор QA" }, color: "#f5c542", priority: "NORMAL", sortOrder: 0, startDate: null, dueDate: null, dueTime: null, reminderAt: null, reminderText: null, priorityStickerEnabled: false, priorityStickerConfigured: false, deadlineStickerEnabled: false, reminderStickerEnabled: false, assigneeStickerEnabled: false, completedAt: null, archivedAt: null, updatedAt: "2026-10-14", assignee: null, assignees: [], project: null, order: null, checklistItems: [], checklistTotal: 0, checklistDone: 0, commentCount: 0 };
const board = { id: "qa-board", title: "Рабочая доска · QA", description: null, isDefault: true, updatedAt: "2026-10-14", syncToken: "qa", columns: [{ id: "inbox", title: "Задачи", sortOrder: 0, isDone: false, tasks: [task] }, { id: "target", title: "В работе", sortOrder: 1, isDone: false, tasks: [] }] };
task.description = "Тестовое задание\n\nПроверить <текст> & переносы. " + "Подробности поручения 🦖: ".repeat(120) + "https://example.test/" + "long-url".repeat(35);
const policy = { confirmationResponseReward: 1, repeatMissedPenalty: -1, finalMissedPenalty: -2, overduePenaltyPerDay: -1, overduePenaltyCap: -20, perfectReturnReward: 1, dirtyPenaltyPerUnit: -1, repairPenaltyPerUnit: -2, brokenPenaltyPerUnit: -4, lostPenaltyPerUnit: -6, incidentPenaltyCap: -20, recoveryGraceDays: 7, recoveryDurationDays: 30, tiers: [{ id: "base", name: "Старт", minScore: 0, discountPercent: 10, sortOrder: 0 }, { id: "top", name: "Лучший", minScore: 90, discountPercent: 20, sortOrder: 1 }], updatedAt: "2026-10-14" };
const errors = [], forbidden = [], checks = [];
let writes = 0;
await mkdir(".impeccable/review", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1100 }, serviceWorkers: "block" });
    await context.addInitScript(() => localStorage.setItem("wowstorg-task-board-theme", "dark"));
    let settings = { revision: 0, directorUserId: null, telegramChatId: null, boardId: null, columnId: null };
    let releaseMove; const seenMove = new Promise(resolve => { releaseMove = resolve; });
    await context.route("**/api/**", async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === "PATCH" && url.pathname === "/api/admin/telegram/director") {
        assert.deepEqual(req.postDataJSON(), { expectedRevision: 0, directorUserId: "director", telegramChatId: "123", boardId: "qa-board", columnId: "inbox" });
        settings = { revision: 1, directorUserId: "director", telegramChatId: "123", boardId: "qa-board", columnId: "inbox" };
        writes += 1; await route.fulfill({ json: { revision: 1 } }); return;
      }
      if (req.method() === "POST" && url.pathname === "/api/admin/telegram/director") { writes += 1; await route.fulfill({ json: { ok: true } }); return; }
      if (req.method() === "POST" && url.pathname === "/api/admin/telegram/director/notify") {
        assert.deepEqual(req.postDataJSON(), { expectedRevision: 1, directorUserId: "director" }); writes += 1; await route.fulfill({ json: { ok: true } }); return;
      }
      if (req.method() === "PATCH" && url.pathname === "/api/tasks/tasks/qa-task") {
        assert.deepEqual(req.postDataJSON(), { columnId: "target", completed: false, sortOrder: 1000 }); writes += 1; releaseMove(route); return;
      }
      if (req.method() !== "GET") { forbidden.push(`${req.method()} ${url.pathname}`); await route.fulfill({ status: 405, json: { error: { message: "QA forbids writes" } } }); return; }
      let json;
      if (url.pathname === "/api/auth/me") json = { user };
      else if (url.pathname === "/api/me/notifications") json = { rows: [], unreadCount: 0, cursor: { id: "qa", createdAt: "2026-10-14" } };
      else if (url.pathname === "/api/me/push-subscriptions") json = { enabled: false, publicKey: null };
      else if (url.pathname === "/api/admin/telegram") json = { telegram: { hasBotToken: true, warehouseChatId: "QA", warehouseTopicId: null, webhookUrl: "https://example.test/api/telegram/webhook", webhookSecretConfigured: true }, greenwich: { activeUsers: 0, withTelegramChatId: 0, users: [] }, scenarios: [], ratingPolicy: policy, liveConfirmation: { orders: [], recent: [], checkpoints: [] } };
      else if (url.pathname === "/api/admin/telegram/director") json = { settings, users: [{ id: "director", displayName: "Директор QA", telegramChatId: "123" }], boards: [{ id: "qa-board", title: "Рабочая доска · QA", columns: [{ id: "inbox", title: "Задачи" }] }] };
      else if (url.pathname === "/api/tasks/boards") json = { boards: [{ ...board, _count: { tasks: 1, columns: 2 } }] };
      else if (url.pathname === "/api/tasks/meta") json = { users: [user], projects: [], orders: [] };
      else if (url.pathname === "/api/tasks/boards/qa-board") json = { board };
      else if (url.pathname === "/api/tasks/tasks/qa-task") json = { task: { ...task, column: { id: "inbox", title: "Задачи", isDone: false }, activities: [] } };
      else { forbidden.push(`GET ${url.pathname}`); await route.fulfill({ status: 501, json: { error: { message: "No QA fixture" } } }); return; }
      await route.fulfill({ json });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto(new URL("/admin/telegram", base).href);
    const panel = page.locator('section[aria-labelledby="director-settings-title"]');
    await panel.getByLabel("Директор", { exact: true }).selectOption("director");
    assert.equal(await panel.getByLabel("Личный Telegram ID").inputValue(), "123");
    await panel.screenshot({ path: `.impeccable/review/director-settings-${width}.png` });
    await panel.getByRole("button", { name: "Сохранить назначение", exact: true }).click();
    await panel.getByText(/Сохранено\. Директору/).waitFor();
    await panel.getByRole("button", { name: "Проверить меню бота", exact: true }).click();
    await panel.getByText("Меню команд подключено для личного чата директора.", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "Оповестить о назначении", exact: true }).click();
    await panel.getByText("Инструкция и кнопки отправлены директору в личный чат.", { exact: true }).waitFor();
    await panel.screenshot({ path: `.impeccable/review/director-appointment-${width}.png` });
    assert.ok(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await page.goto(new URL("/tasks", base).href);
    const card = page.locator('[data-task-card-id="qa-task"]'); await card.waitFor();
    const badge = card.locator(".task-director-badge"); assert.equal(await badge.isVisible(), true);
    assert.equal(await card.locator(".task-card__title").evaluate(node => getComputedStyle(node).color), "rgb(43, 33, 16)");
    const preview = card.locator(".task-card__description");
    assert.equal(await preview.textContent(), task.description);
    assert.equal(await preview.evaluate(node => getComputedStyle(node).webkitLineClamp), "3");
    assert.equal(await preview.evaluate(node => getComputedStyle(node).color), "rgb(43, 33, 16)");
    assert.ok(await card.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await card.screenshot({ path: `.impeccable/review/director-task-${width}.png` });
    await preview.click();
    const drawer = page.getByRole("dialog", { name: "Рабочее пространство задачи" });
    const fullDescription = drawer.locator(".task-drawer__description > p"); await fullDescription.waitFor();
    assert.equal(await fullDescription.textContent(), task.description);
    assert.ok(await fullDescription.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    if (width === 390) assert.equal(await fullDescription.evaluate(node => getComputedStyle(node).fontSize), "16px");
    await drawer.screenshot({ path: `.impeccable/review/director-description-drawer-${width}.png` });
    await page.keyboard.press("Escape"); await drawer.waitFor({ state: "detached" });
    const move = page.waitForRequest(req => req.method() === "PATCH" && new URL(req.url()).pathname === "/api/tasks/tasks/qa-task", { timeout: 15000 });
    await card.locator(".task-card__title").dragTo(page.locator(".task-column").nth(1)); await move;
    const pending = await seenMove; assert.equal(await badge.isVisible(), true);
    assert.equal(await card.evaluate(node => getComputedStyle(node).opacity), "1");
    await pending.fulfill({ json: { task } });
    await card.getByRole("button", { name: `Переименовать задачу «${task.title}»`, exact: true }).click();
    await card.getByRole("textbox", { name: "Название задачи", exact: true }).press("Escape"); assert.equal(await badge.isVisible(), true);
    checks.push({ width, savedSettings: true, explicitMenuCheck: true, persistentBadgeBeforeAndAfterMove: true, noStuckDrag: true, descriptionPreview: true, fullDescriptionOnOpen: true, noDescriptionOverflow: true });
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); assert.equal(writes, 8);
  console.log(JSON.stringify({ checks, fixtureWrites: writes, pageErrors: errors.length, forbiddenRequests: forbidden.length, target: base.origin }));
} finally { await browser.close(); }
