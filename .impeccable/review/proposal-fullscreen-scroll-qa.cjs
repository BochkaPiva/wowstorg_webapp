// Real project/fullscreen UI, synthetic APIs only; never writes to the database.
const { chromium } = require('C:/Users/Михаил/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const projectId = 'qa-proposal-scroll';
const widgets = ['EVENT_BUILDER', 'FREE_BOARD', 'ESTIMATE', 'ORDERS'].map((type, sortOrder) => ({ type, instanceKey: type, sortOrder, width: 12, heightPreset: 'AUTO', isVisible: true }));
const project = { id: projectId, title: 'Демо · прокрутка КП', mode: 'FULL', status: 'LEAD', ball: 'CLIENT', archivedAt: null, eventStartDate: null, eventEndDate: null, eventDateNote: null, eventDateConfirmed: false, openBlockers: null, internalSummary: null, createdAt: '2026-10-01', updatedAt: '2026-10-09', customer: null, owner: { id: 'qa', displayName: 'Демо' }, createdBy: { id: 'qa', displayName: 'Демо' }, revision: 0, members: [{ userId: 'qa', role: 'OWNER', user: { id: 'qa', displayName: 'Демо' } }], widgets, _count: { orders: 0, tasks: 0, contacts: 0, projectFiles: 0, scheduleDays: 0 }, orders: [], activityLogs: [] };
const proposal = { id: 'scroll', title: 'Демо · длинное предложение', status: 'DRAFT', revision: 0, clientIntro: null, clientOutro: null, owner: { type: 'PROJECT', projectId, title: project.title, archivedAt: null }, variants: [{ id: 'v', title: 'Основной вариант', isRecommended: true, sections: Array.from({ length: 6 }, (_, s) => ({ id: 's' + s, title: 'Раздел ' + (s + 1), category: null, items: Array.from({ length: 3 }, (_, i) => ({ id: `i${s}-${i}`, offerId: null, selectionRole: 'PRIMARY', qty: 1, clientUnitPrice: 15000, internalUnitCost: 10000, priceTypeSnapshot: 'FIXED', unitLabel: 'мероприятие', contractorNameSnapshot: 'Демо · подрядчик', offerTitleSnapshot: `Услуга ${s + 1}.${i + 1}`, offerDescriptionSnapshot: 'Программа мероприятия и техническое сопровождение.', clientNote: null, assetSnapshot: [] })) })) }] };

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const errors = [];
    await context.route('**/api/**', async route => {
      assert.equal(route.request().method(), 'GET', 'QA must not change any data');
      const url = new URL(route.request().url()); let json = {};
      if (url.pathname === '/api/auth/me') json = { user: { id: 'qa', displayName: 'Демо', role: 'WOWSTORG', login: 'qa' } };
      else if (url.pathname === `/api/projects/${projectId}`) json = { project, features: { projectWorkspaceV2: true, projectEstimateGridV2: true } };
      else if (url.pathname.endsWith('/proposals') || url.pathname === '/api/proposals/scroll') json = { proposal };
      else if (url.pathname === '/api/contractor-categories') json = { categories: [] };
      else if (url.pathname.endsWith('/workspace/items')) json = { board: { widgetId: 'b', widgetRevision: 0, readOnly: false, items: [], invalidItemIds: [], linkables: { tasks: [], orders: [], files: [], estimateSections: [], contractors: [], contacts: [], scheduleSlots: [], proposals: [] } } };
      else if (url.pathname.endsWith('/estimate')) json = { versions: [], current: null };
      else if (url.pathname === '/api/me/notifications') json = { notifications: [], unreadCount: 0 };
      await route.fulfill({ status: 200, json });
    });
    for (const width of [2486, 1440, 390]) {
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://localhost:3102/projects/${projectId}?workspace=v2`);
      await page.getByRole('button', { name: 'Открыть конструктор КП', exact: true }).click();
      const overlay = page.getByRole('dialog', { name: 'Конструктор мероприятия', exact: true });
      await overlay.getByRole('heading', { name: proposal.title, exact: true }).waitFor();
      const body = overlay.locator('.project-workspace-widget__body');
      const metrics = await body.evaluate(node => ({ overflowY: getComputedStyle(node).overflowY, height: node.clientHeight, contentHeight: node.scrollHeight, documentY: window.scrollY }));
      console.log(width, metrics);
      if (process.argv.includes('--observe')) { await page.close(); continue; }
      assert.equal(metrics.overflowY, 'auto');
      assert(metrics.contentHeight > metrics.height, 'Long proposal must overflow');
      await body.hover({ position: { x: width > 600 ? 500 : 250, y: 400 } });
      await page.mouse.wheel(0, 1200);
      await page.waitForFunction(() => document.querySelector('[data-expanded="true"] > .project-workspace-widget__body').scrollTop > 100);
      assert.equal(await page.evaluate(() => window.scrollY), metrics.documentY, 'Background must not scroll');
      await overlay.getByRole('heading', { name: 'Раздел 6', exact: true }).scrollIntoViewIfNeeded();
      assert(await overlay.getByRole('heading', { name: 'Раздел 6', exact: true }).isVisible());
      await page.screenshot({ path: path.join(__dirname, `proposal-fullscreen-scroll-${width}.png`) });
      await overlay.getByRole('button', { name: 'Вернуть «Конструктор мероприятия» в карточку', exact: true }).click();
      assert.equal(await page.evaluate(() => document.body.classList.contains('project-workspace-expanded')), false);
      // Canvas keeps its own pan/zoom; an outer scrollbar must not interfere.
      await page.getByRole('button', { name: 'Развернуть «Свободная доска» на весь экран', exact: true }).click();
      assert.equal(await page.locator('[data-widget="FREE_BOARD"][data-expanded="true"] > .project-workspace-widget__body').evaluate(node => getComputedStyle(node).overflowY), 'hidden');
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log(process.argv.includes('--observe') ? 'Fullscreen overflow observation complete (no interaction assertions).' : 'Fullscreen scroll QA passed: desktop/mobile wheel, last section, background lock, close, board isolation.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
