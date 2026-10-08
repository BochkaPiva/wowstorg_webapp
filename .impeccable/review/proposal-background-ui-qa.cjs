// Synthetic browser/API fixtures only. Never writes to the working database.
const { chromium } = require('C:/Users/Михаил/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const item = (id, title = 'Ведение мероприятия') => ({ id, offerId: null, selectionRole: 'PRIMARY', qty: 1, clientUnitPrice: 5000, internalUnitCost: 3000, priceTypeSnapshot: 'FIXED', unitLabel: 'час', contractorNameSnapshot: 'Демо-подрядчик', offerTitleSnapshot: title, offerDescriptionSnapshot: 'Программа, интерактивы и сопровождение для гостей.', clientNote: null, assetSnapshot: [{ url: '/brand/dino-order-detail.webp' }] });
const initial = () => ({ id: 'background-qa', title: 'Корпоратив для команды', status: 'DRAFT', revision: 4, clientIntro: null, clientOutro: null, owner: { type: 'STANDALONE', customer: null, leadCustomerName: 'Демо', convertedAt: null }, variants: [{ id: 'v', title: 'Основной вариант', isRecommended: true, sections: [{ id: 's', title: 'Программа', category: { id: 'cat', name: 'Ведущие' }, items: [item('i')] }, { id: 's2', title: 'Оборудование', category: { id: 'sound', name: 'Оборудование' }, items: [] }] }] });
async function main() {
  const capture = process.argv.includes('--capture');
  const mobileCaptureOnly = process.argv.includes('--recapture-mobile');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  let model = initial(), blockFirst = true, releaseFirst, reject = false, losses = 0, active = 0, maxActive = 0;
  const requests = [], receipts = new Map();
  const categories = [{ id: 'cat', name: 'Ведущие' }, { id: 'sound', name: 'Оборудование' }];
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()); let data = {};
    if (url.pathname === '/api/auth/me') data = { user: { id: 'background-user', displayName: 'Демо', role: 'WOWSTORG', login: 'demo' } };
    if (url.pathname === '/api/contractor-categories') data = { categories };
    if (url.pathname === '/api/contractors') data = { contractors: [{ id: 'c', name: 'Демо-подрядчик', photoUrl: '/brand/dino-order-detail.webp', offers: [1, 2].map(n => ({ id: 'offer' + n, title: n === 1 ? 'Живая музыка' : 'Световое шоу', description: 'Готовая программа для корпоративного мероприятия.', clientPrice: 10000 * n, clientPriceMax: null, priceType: 'FIXED', unitLabel: 'мероприятие', priceConfirmedAt: '2026-10-01', category: categories[0] })) }], nextCursor: null };
    if (url.pathname === '/api/proposals/background-qa') data = { proposal: model };
    if (url.pathname.endsWith('/mutations')) {
      const op = req.postDataJSON(); requests.push(op); active++; maxActive = Math.max(maxActive, active);
      if (blockFirst) { blockFirst = false; await new Promise(resolve => { releaseFirst = resolve; }); }
      if (reject) { reject = false; active--; return route.fulfill({ status: 409, json: { error: { message: 'КП изменилось у коллеги' } } }); }
      if (!receipts.has(op.mutationId)) {
        assert.equal(op.expectedRevision, model.revision);
        const before = structuredClone(model), sections = model.variants[0].sections;
        if (op.action === 'ADD_CATALOG_ITEM') sections.find(s => s.id === op.sectionId).items.push({ ...item('server-' + op.offerId, op.offerId === 'offer1' ? 'Живая музыка' : 'Световое шоу'), offerId: op.offerId });
        if (op.action === 'UPDATE_ITEM') Object.assign(sections.flatMap(s => s.items).find(i => i.id === op.itemId), { qty: op.qty, clientUnitPrice: op.clientUnitPrice, internalUnitCost: op.internalUnitCost, selectionRole: op.selectionRole, clientNote: op.clientNote });
        if (op.action === 'RESTORE_CHANGE') { const rev = model.revision; model = structuredClone(receipts.get(op.changeId).before); model.revision = rev; }
        model.revision++; receipts.set(op.mutationId, { before });
      }
      active--;
      if (losses > 0) { losses--; return route.abort('failed'); }
      data = { proposal: model, changeId: op.mutationId };
    }
    if (url.pathname === '/api/projects/project-qa') data = { project: { id: 'project-qa', title: 'Проект · демо', mode: 'FULL', status: 'LEAD', ball: 'CLIENT', archivedAt: null, leadCustomerName: 'Демо', customer: null, createdAt: '2026-10-08', updatedAt: '2026-10-08', owner: { id: 'background-user', displayName: 'Демо' }, createdBy: { id: 'background-user', displayName: 'Демо' }, revision: 0, members: [], eventDateConfirmed: false, eventStartDate: null, eventEndDate: null, orders: [], activityLogs: [], widgets: ['EVENT_BUILDER', 'ESTIMATE'].map((type, index) => ({ type, sortOrder: index, width: 12, isVisible: true, config: null })), _count: { orders: 0, tasks: 0, contacts: 0, projectFiles: 0, scheduleDays: 0 } }, features: { projectWorkspaceV2: true, projectEstimateGridV2: true } };
    if (url.pathname === '/api/projects/project-qa/proposals') data = { proposal: model };
    if (url.pathname === '/api/projects/project-qa/estimate') data = { versions: [], current: null };
    if (url.pathname.endsWith('/transfer-to-estimate')) data = { result: { transferred: 3, skipped: 0 } };
    await route.fulfill({ status: 200, json: data });
  });
  const ready = () => page.getByRole('heading', { name: 'Корпоратив для команды', exact: true }).waitFor();
  const openItem = () => page.getByRole('button', { name: /Ведение мероприятия Демо-подрядчик/ }).click();
  const price = () => page.getByLabel('Цена клиенту за единицу');
  const save = () => page.getByRole('button', { name: 'Сохранить', exact: true });
  const settled = () => page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(e => e.textContent === 'Сохранено'));
  await page.goto('http://localhost:3102/proposals/background-qa'); await ready();
  await page.getByRole('button', { name: 'Подобрать услугу', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить в раздел', exact: true }).nth(0).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(e => e.textContent.startsWith('Сохраняем')));
  assert.equal(await page.getByText('Ответ сервера не получен').count(), 0);
  await page.getByRole('button', { name: 'Добавить в раздел', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Уже в разделе', exact: true }).count(), 2);
  assert.equal(requests.length, 1);
  await page.getByRole('button', { name: 'Оборудование 0 услуг', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Оборудование', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: 'Программа 3 услуг', exact: true }).click();
  await openItem(); await price().fill('6500'); await save().click();
  assert.equal(await page.getByLabel('Цена клиенту за единицу').count(), 0);
  await openItem(); await price().fill('6600');
  releaseFirst(); await settled(); assert.equal(maxActive, 1);
  assert.equal(await price().inputValue(), '6600', 'background response must not discard a newer form');
  const beforeNativeUndo = requests.length; await price().press('Control+z'); assert.equal(requests.length, beforeNativeUndo);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  assert.deepEqual(requests.map(op => op.expectedRevision), [4, 5, 6]);
  assert.equal(model.variants[0].sections[0].items[0].clientUnitPrice, 6500);
  await page.getByRole('button', { name: 'Отменить действие', exact: true }).click(); await settled();
  assert.equal(model.variants[0].sections[0].items[0].clientUnitPrice, 5000);
  await page.getByRole('button', { name: 'Вернуть действие', exact: true }).click(); await settled();
  assert.equal(model.variants[0].sections[0].items[0].clientUnitPrice, 6500);
  // Lost response: commit once, lose all automatic retries, reload and explicitly verify the receipt.
  await openItem(); await price().fill('7000'); losses = 3; await save().click();
  await page.getByRole('button', { name: 'Проверить сохранение', exact: true }).waitFor();
  const lost = requests.at(-1), revision = model.revision;
  assert.deepEqual(requests.slice(-3).map(op => op.mutationId), [lost.mutationId, lost.mutationId, lost.mutationId]);
  await page.getByRole('button', { name: 'Сравнить варианты', exact: true }).click();
  await page.reload(); await ready(); await page.getByRole('button', { name: 'Проверить сохранение', exact: true }).click(); await settled();
  assert.equal(requests.at(-1).mutationId, lost.mutationId); assert.equal(model.revision, revision);
  // Conflict: retain submitted form payload and allow inspection, never automatically rebase.
  await openItem(); await price().fill('8000'); reject = true; await save().click();
  await page.getByRole('alert').filter({ hasText: 'КП изменилось у коллеги' }).waitFor();
  const journal = await page.evaluate(() => JSON.parse(localStorage.getItem('wowstorg:proposal-recovery:v1:background-user:background-qa')));
  assert.equal(journal.queued[0].operation.clientUnitPrice, 8000);
  const count = requests.length; await page.getByRole('button', { name: 'Вид для клиента', exact: true }).click(); assert.equal(requests.length, count);
  assert.equal(await page.getByRole('button', { name: 'Печать / PDF', exact: true }).isDisabled(), true);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Загрузить с сервера', exact: true }).click(); await settled();
  await page.getByRole('button', { name: 'Состав мероприятия', exact: true }).click(); await page.getByRole('button', { name: 'Подобрать услугу', exact: true }).click();
  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width === 390) assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= document.querySelector('[aria-label="Состав раздела"]').getBoundingClientRect().bottom + scrollY + 40), true, 'mobile document ends immediately after the canvas');
    if (width === 390 && (capture || mobileCaptureOnly)) {
      // Explicit clip avoids Chromium's fullPage resize changing dvh during capture.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      const session = await context.newCDPSession(page);
      const screenshot = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
      require('node:fs').writeFileSync(path.join(__dirname, `background-studio-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      await session.detach();
    } else if (capture) await page.screenshot({ path: path.join(__dirname, `background-studio-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  model.owner = { type: 'PROJECT', projectId: 'project-qa', title: 'Проект · демо', archivedAt: null };
  await page.goto('http://localhost:3102/projects/project-qa');
  await page.getByRole('button', { name: 'Открыть конструктор КП', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Смета пока не создана', exact: true }).waitFor();
  if (capture) await page.screenshot({ path: path.join(__dirname, 'background-project.png'), fullPage: true });
  await page.getByRole('button', { name: 'Открыть конструктор КП', exact: true }).click(); await ready();
  assert.equal(await page.getByRole('dialog', { name: 'Конструктор мероприятия' }).isVisible(), true);
  assert.equal(new URL(page.url()).pathname, '/projects/project-qa');
  assert.equal(await page.locator('[data-proposal-workspace]').count(), 1);
  await page.getByRole('button', { name: 'Подобрать услугу', exact: true }).click();
  if (capture) await page.screenshot({ path: path.join(__dirname, 'background-project-fullscreen.png'), fullPage: true });
  await page.keyboard.press('Escape'); await page.getByRole('heading', { name: 'Подбор услуг', exact: true }).waitFor({ state: 'hidden' }); assert.equal(await page.getByRole('dialog').count(), 1);
  await page.getByRole('button', { name: 'Вид для клиента', exact: true }).click();
  await page.emulateMedia({ media: 'print' }); const printed = await page.locator('body').innerText();
  assert.equal(printed.includes('Создать первую смету'), false, JSON.stringify(await page.evaluate(() => ({ text: document.body.innerText, children: [...document.body.children].map(e => ({ tag: e.tagName, class: e.className, display: getComputedStyle(e).display, studio: !!e.querySelector('[data-proposal-workspace]') })) })))); assert.equal(printed.includes('Внутренний расход'), false); assert.equal(printed.includes('Ведение мероприятия'), true);
  await page.emulateMedia({ media: 'screen' }); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Открыть конструктор КП', exact: true }).click(); await ready();
  await page.evaluate(() => { window.__estimateRefreshes = 0; window.addEventListener('project-activity-refresh', () => window.__estimateRefreshes++); });
  await page.getByRole('button', { name: 'В смету', exact: true }).click(); await page.getByRole('button', { name: 'Подтвердить перенос', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Добавлено в смету: 3' }).waitFor();
  assert.equal(await page.evaluate(() => window.__estimateRefreshes), 1, 'embedded transfer refreshes project estimate');
  assert.deepEqual(errors, []); await browser.close();
  console.log(JSON.stringify({ status: 'PASS', syntheticFixtures: true, assertions: ['serial outbox with revision 4/5/6', 'instant local previews', 'browse and edit during in-flight save', 'no false error banner', 'undo/redo after queue drains', 'same UUID retries and reload recovery', '409 retains submitted fields and blocks export', 'no overflow 1920/1440/390', 'project embedded fullscreen', 'Escape inspector then fullscreen', 'client-only embedded print', 'no page errors'] }));
}
main().catch(error => { console.error(error); process.exit(1); });
