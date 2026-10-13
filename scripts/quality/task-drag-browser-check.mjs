// Local production-build smoke. All APIs are fulfilled fixtures; no DB writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[3] ?? "playwright");
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3128");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
const user = { id: "qa-drag", displayName: "QA", login: "qa", role: "WOWSTORG", isActive: true, mustSetPassword: false };
const task = { id: "qa-task", title: "Drag QA", description: null, priority: "NORMAL", color: "#334155", sortOrder: 0, startDate: null, dueDate: null, dueTime: null, reminderAt: null, reminderText: null, priorityStickerEnabled: false, priorityStickerConfigured: false, deadlineStickerEnabled: false, reminderStickerEnabled: false, assigneeStickerEnabled: false, completedAt: null, updatedAt: "2026-10-13", assignee: null, assignees: [], project: null, order: null, checklistItems: [], checklistTotal: 0, checklistDone: 0, commentCount: 0 };
const board = { id: "qa-board", title: "Drag board", description: null, isDefault: true, updatedAt: "2026-10-13", syncToken: "qa", columns: [{ id: "source", title: "Source", isDone: false, sortOrder: 0, tasks: [task] }, { id: "target", title: "Target", isDone: false, sortOrder: 1, tasks: [] }] };
const failures = [], errors = [], checks = [];
let mutationCount = 0;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
    await context.addInitScript(() => localStorage.setItem("wowstorg-task-board-theme", "dark"));
    let acknowledgeMove;
    const moveSeen = new Promise(resolve => { acknowledgeMove = resolve; });
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === "PATCH" && url.pathname === "/api/tasks/tasks/qa-task") {
        const payload = request.postDataJSON();
        assert.deepEqual(payload, { columnId: "target", completed: false, sortOrder: 1000 });
        mutationCount += 1;
        acknowledgeMove(route); return;
      }
      if (request.method() !== "GET") {
        failures.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({ status: 405, json: { error: { message: "Forbidden QA mutation" } } }); return;
      }
      let result;
      if (url.pathname === "/api/auth/me") result = { user };
      else if (url.pathname === "/api/me/notifications") result = { rows: [], unreadCount: 0, cursor: { id: "qa", createdAt: "2026-10-13" } };
      else if (url.pathname === "/api/me/push-subscriptions") result = { enabled: false, publicKey: null };
      else if (url.pathname === "/api/tasks/boards") result = { boards: [{ ...board, _count: { tasks: 1, columns: 2 } }] };
      else if (url.pathname === "/api/tasks/meta") result = { users: [user], projects: [], orders: [] };
      else if (url.pathname === "/api/tasks/boards/qa-board") result = { board };
      else { failures.push(`GET ${url.pathname}`); await route.fulfill({ status: 501, json: { error: { message: "Missing QA fixture" } } }); return; }
      await route.fulfill({ json: result });
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(new URL("/tasks", base).href);
    const card = page.locator('[data-task-card-id="qa-task"]');
    await card.waitFor();
    // Native HTML drag, not dispatchEvent: the source disappears on the drop.
    const moveRequest = page.waitForRequest(request => request.method() === "PATCH" && new URL(request.url()).pathname === "/api/tasks/tasks/qa-task", { timeout: 15000 });
    await card.locator(".task-card__title").dragTo(page.locator(".task-column").nth(1));
    await moveRequest;
    const pending = await moveSeen;
    await page.waitForFunction(() => !document.querySelector(".task-card-dragging,.task-drop-placeholder,.task-column.is-task-target"));
    assert.equal(await card.evaluate(node => getComputedStyle(node).opacity), "1");
    assert.equal(await page.locator(".task-column").nth(1).locator('[data-task-card-id="qa-task"]').count(), 1);
    await pending.fulfill({ json: { task } });
    // The same card is immediately usable without clicking a different task.
    await card.getByRole("button", { name: "Переименовать задачу «Drag QA»", exact: true }).click();
    await card.getByRole("textbox", { name: "Название задачи", exact: true }).press("Escape");
    assert.equal(await card.evaluate(node => getComputedStyle(node).opacity), "1");
    checks.push({ width, nativeCrossColumnDrop: true, opacityWhileSavePending: 1, sameCardUsable: true });
    await context.close();
  }
  assert.deepEqual(failures, []); assert.deepEqual(errors, []); assert.equal(mutationCount, 2);
  console.log(JSON.stringify({ checks, fixtureWrites: mutationCount, forbiddenRequests: failures.length, pageErrors: errors.length, target: base.origin }));
} finally { await browser.close(); }
