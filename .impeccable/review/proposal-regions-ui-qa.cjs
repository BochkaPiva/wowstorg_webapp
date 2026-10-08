// Isolated synthetic fixtures: browser requests never reach the working database.
const { chromium } = require('C:/Users/Михаил/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = __dirname;
const service = (id, title, price = null, role = 'PRIMARY') => ({ id, offerId: null, selectionRole: role, qty: 1, clientUnitPrice: price, internalUnitCost: null, priceTypeSnapshot: price === null ? 'ON_REQUEST' : 'FIXED', unitLabel: 'мероприятие', contractorNameSnapshot: 'Демо-подрядчик', offerTitleSnapshot: title, offerDescriptionSnapshot: 'Программа и сопровождение для гостей мероприятия.', clientNote: null, assetSnapshot: [{ url: '/brand/dino-order-detail.webp' }] });
const categories = [{ id: 'venue', name: 'Локации' }, { id: 'host', name: 'Ведущие' }, { id: 'tech', name: 'Оборудование' }];
const model = { id: 'regions-qa', title: 'Корпоратив для команды', status: 'DRAFT', revision: 1, clientIntro: null, clientOutro: null, owner: { type: 'PROJECT', projectId: 'regions-project', title: 'Проект · демо', archivedAt: null }, variants: [{ id: 'v', title: 'Основной вариант', isRecommended: true, sections: [
  { id: 's', title: 'Локации', category: categories[0], items: [service('i', 'Площадка парка')] },
  { id: 's2', title: 'Ведущие', category: categories[1], items: [service('i2', 'Ведение мероприятия'), service('i3', 'Интеллектуальные игры'), service('i4', 'Кавер-группа', null, 'ALTERNATIVE')] },
  { id: 's3', title: 'Оборудование', category: categories[2], items: [] },
] }] };
async function capture(page, name) {
  if (process.argv.includes('--layout-only')) return;
  await page.evaluate(async () => { await Promise.race([Promise.all([document.fonts.ready, ...[...document.images].filter(image => image.loading !== 'lazy').map(image => image.decode().catch(() => {}))]), new Promise(resolve => setTimeout(resolve, 2000))]); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.evaluate(() => window.scrollTo(0, 0));
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: page.viewportSize().width, height: await page.evaluate(() => Math.max(document.documentElement.scrollHeight, innerHeight)), scale: 1 } });
  require('node:fs').writeFileSync(path.join(root, name), Buffer.from(data, 'base64'));
  await cdp.detach();
}
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  let current = structuredClone(model);
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') writes.push(url.pathname);
    let data = {};
    if (url.pathname === '/api/auth/me') data = { user: { id: 'u', displayName: 'Демо', role: 'WOWSTORG', login: 'demo' } };
    if (url.pathname === '/api/contractor-categories') data = { categories };
    if (url.pathname === '/api/contractors') data = { contractors: [{ id: 'c', name: 'Демо-подрядчик', photoUrl: '/brand/dino-order-detail.webp', offers: [{ id: 'o', title: 'Загородная площадка', description: 'Площадка для корпоративного мероприятия.', clientPrice: null, clientPriceMax: null, priceType: 'ON_REQUEST', unitLabel: 'день', priceConfirmedAt: null, category: categories[0] }] }], nextCursor: null };
    if (url.pathname === '/api/proposals/regions-qa' || url.pathname.endsWith('/proposals')) data = { proposal: current };
    if (url.pathname === '/api/projects/regions-project') data = { project: { id: 'regions-project', title: 'Проект · демо', mode: 'FULL', status: 'LEAD', ball: 'CLIENT', archivedAt: null, leadCustomerName: 'Демо', customer: null, createdAt: '2026-10-08', updatedAt: '2026-10-08', owner: { id: 'u', displayName: 'Демо' }, createdBy: { id: 'u', displayName: 'Демо' }, revision: 0, members: [], eventDateConfirmed: false, eventStartDate: null, eventEndDate: null, orders: [], activityLogs: [], widgets: ['EVENT_BUILDER', 'ESTIMATE'].map((type, index) => ({ type, sortOrder: index, width: 12, isVisible: true, config: null })), _count: { orders: 0, tasks: 0, contacts: 0, projectFiles: 0, scheduleDays: 0 } }, features: { projectWorkspaceV2: true, projectEstimateGridV2: true } };
    if (url.pathname.endsWith('/estimate')) data = { versions: [], current: null };
    await route.fulfill({ status: 200, json: data });
  });
  const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const ready = () => page.getByRole('heading', { name: current.title, exact: true }).waitFor();
  await page.goto('http://localhost:3102/proposals/regions-qa'); await ready();
  await page.getByRole('complementary', { name: 'Структура мероприятия' }).getByText('Бюджет уточняется', { exact: true }).waitFor();
  await capture(page, 'regions-studio-1920.png'); await overflow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Подобрать услугу', exact: true }).click();
  await page.getByRole('heading', { name: 'Подбор услуг', exact: true }).waitFor();
  await capture(page, 'regions-studio-drawer-1440.png'); await overflow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (process.argv.includes('--layout-only')) { await browser.close(); return; }
  await capture(page, 'regions-studio-390.png'); await overflow();
  // Visual/DOM order must agree on mobile: outline, canvas, inspector.
  const order = await page.locator('[data-proposal-workspace] aside, [data-proposal-workspace] section[aria-label="Состав раздела"]').evaluateAll(nodes => nodes.map(e => ({ label: e.getAttribute('aria-label'), y: e.getBoundingClientRect().top })));
  assert(order.every((entry, index) => !index || entry.y >= order[index - 1].y));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3102/projects/regions-project');
  const summary = page.locator('[data-proposal-summary]'); await summary.waitFor();
  await summary.getByText('Бюджет уточняется', { exact: true }).waitFor();
  assert((await summary.innerText()).includes('1 вариант · 3 раздела'));
  assert((await summary.innerText()).includes('Услуги ещё не подобраны'));
  assert(!(await summary.innerText()).includes('0,00'));
  await capture(page, 'regions-project-1920.png'); await summary.screenshot({ path: path.join(root, 'regions-widget-1920.png') }); await overflow();
  await page.setViewportSize({ width: 2482, height: 1399 });
  await page.getByRole('button', { name: 'Открыть конструктор КП', exact: true }).click(); await ready();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const embeddedSizes = await page.getByRole('region', { name: 'Управление КП', exact: true }).evaluate(e => ({ band: e.getBoundingClientRect().height, variant: e.querySelector('[aria-label="Варианты КП"] button').getBoundingClientRect().height }));
  assert(embeddedSizes.band <= 260, `embedded command band must remain compact: ${embeddedSizes.band}`);
  assert(embeddedSizes.variant >= 40 && embeddedSizes.variant <= 44, `variant control intrinsic height: ${embeddedSizes.variant}`);
  await page.getByRole('dialog').screenshot({ path: path.join(root, 'regions-embedded-2482.png') }); await overflow();
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await summary.screenshot({ path: path.join(root, 'regions-widget-390.png') }); await overflow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Container-sized widget on a wide screen, not merely a viewport media query.
  await summary.evaluate(e => { e.style.width = '500px'; });
  await summary.screenshot({ path: path.join(root, 'regions-widget-narrow.png') });
  current.variants[0].sections[0].items[0].clientUnitPrice = 45000;
  current.variants[0].sections[0].items[0].priceTypeSnapshot = 'FROM';
  await page.reload(); await page.locator('[data-proposal-summary]').getByText(/от.*45/).waitFor();
  await page.locator('[data-proposal-summary]').screenshot({ path: path.join(root, 'regions-widget-partial.png') });
  current.variants[0].sections = [];
  await page.reload(); await page.locator('[data-proposal-summary]').getByText('Состав ещё не выбран').waitFor();
  await page.locator('[data-proposal-summary]').screenshot({ path: path.join(root, 'regions-widget-empty.png') });
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  await browser.close();
  console.log(JSON.stringify({ status: 'PASS', syntheticFixtures: true, embeddedSizes, assertions: ['1920/1440/390/2482 no overflow', 'intrinsic fullscreen command/control heights', 'mobile DOM and visual order agree', 'project sections and selected services', 'no false zero budget', 'unknown/partial/preliminary/empty', 'narrow container reflow', 'no API mutations', 'no browser errors'] }));
}
main().catch(error => { console.error(error); process.exit(1); });
