// Synthetic API only: no project dates or production data are changed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Михаил/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixtureSource = fs.readFileSync(path.join(__dirname, 'analytics-ui-qa.cjs'), 'utf8').split('async function main(){')[0];
const fixture = new Function('require', fixtureSource + '\nreturn data;')(require);
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
      let saved = false, fail = false, reads = 0; const writes = [], errors = [];
      const sports = { ...fixture.projects.rows[1], projectId: 'sports-demo', title: 'Спорт_зоны — демо', status: 'COMPLETED', archived: true, eventStartDate: null, eventEndDate: null, closedDate: '2026-10-09', eventDateConfirmed: false };
      await context.addInitScript(() => localStorage.setItem('wowstorg.analytics.scopes.v3', JSON.stringify(Object.fromEntries(['overview', 'projects', 'customers', 'requisites', 'bonuses', 'reconciliation'].map(key => [key, key === 'bonuses' ? { from: '2026-10-01', to: '2026-10-09' } : { from: '2026-09-01', to: '2026-09-30' }])))));
      await context.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname === '/api/auth/me') return route.fulfill({ json: { user: { id: 'demo', displayName: 'Демо', role: 'WOWSTORG', login: 'demo' } } });
        if (url.pathname === '/api/admin/analytics') {
          reads++;
          const data = JSON.parse(JSON.stringify(fixture));
          const row = { ...sports, ...(saved ? { eventStartDate: '2026-09-12', eventEndDate: '2026-09-13', eventDateConfirmed: true } : {}) };
          data.projects.unassigned = []; data.projects.pendingDates = saved ? [] : [row];
          data.projects.rows = saved ? [row] : []; data.projects.risks = [];
          return route.fulfill({ json: data });
        }
        if (url.pathname === '/api/projects/sports-demo/event-dates' && request.method() === 'PATCH') {
          const body = request.postDataJSON(); writes.push(body);
          assert.deepEqual(body, { eventStartDate: '2026-09-12', eventEndDate: '2026-09-13', expectedStartDate: saved ? '2026-09-12' : null, expectedEndDate: saved ? '2026-09-13' : null });
          if (fail) return route.fulfill({ status: 409, json: { error: { message: 'Даты уже изменились. Обновите аналитику и повторите.' } } });
          saved = true; return route.fulfill({ json: { ok: true } });
        }
        assert.equal(request.method(), 'GET', `Unexpected mutation: ${url.pathname}`);
        return route.fulfill({ json: {} });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://localhost:3102/admin/analytics');
      await page.getByText('Уточните даты мероприятия: 1').waitFor();
      const nav = page.getByRole('navigation', { name: 'Разделы аналитики' });
      await nav.getByRole('button', { name: 'Бонусы', exact: true }).click();
      await page.getByRole('heading', { name: 'Расчёт за период' }).waitFor();
      await nav.getByRole('button', { name: 'Обзор', exact: true }).click();
      await page.getByText('Уточните даты мероприятия: 1').click();
      await page.getByRole('button', { name: 'Уточнить даты: Спорт_зоны — демо', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Даты мероприятия: Спорт_зоны — демо' });
      await dialog.waitFor(); assert.equal(await dialog.getByLabel('Начало мероприятия').inputValue(), '');
      await dialog.getByLabel('Начало мероприятия').fill('2026-09-12');
      assert.equal(await dialog.getByLabel('Окончание мероприятия').inputValue(), '2026-09-12');
      await dialog.getByLabel('Окончание мероприятия').fill('2026-09-13');
      await page.evaluate(() => document.fonts.ready);
      const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 951);
      assert.ok(await dialog.getByRole('button', { name: 'Сохранить даты' }).isVisible());
      await page.screenshot({ path: path.join(__dirname, `analytics-event-dates-${width}.png`) });
      fail = true;
      await dialog.getByRole('button', { name: 'Сохранить даты' }).click();
      await dialog.getByRole('alert').waitFor(); assert.ok(await dialog.isVisible());
      assert.equal(await dialog.getByLabel('Начало мероприятия').inputValue(), '2026-09-12');
      fail = false; const priorReads = reads;
      await dialog.getByRole('button', { name: 'Сохранить даты' }).click();
      await dialog.waitFor({ state: 'detached' });
      await page.waitForFunction(() => !document.body.textContent.includes('Уточните даты мероприятия:'));
      assert.ok(reads > priorReads, 'Saving invalidates and refetches analytics');
      const beforeBonusReads = reads;
      await nav.getByRole('button', { name: 'Бонусы', exact: true }).click();
      await page.getByRole('heading', { name: 'Расчёт за период' }).waitFor();
      assert.ok(reads > beforeBonusReads, 'Previously cached independent period was invalidated too');
      await page.getByRole('navigation', { name: 'Разделы аналитики' }).getByRole('button', { name: 'Проекты', exact: true }).click();
      const editor = page.getByRole('button', { name: 'Уточнить даты: Спорт_зоны — демо', exact: true });
      await editor.click(); await dialog.waitFor();
      assert.equal(await dialog.getByLabel('Начало мероприятия').inputValue(), '2026-09-12');
      assert.equal(await dialog.getByLabel('Окончание мероприятия').inputValue(), '2026-09-13');
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      assert.ok(await editor.evaluate(el => el === document.activeElement), 'Escape restores focus');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []); assert.equal(writes.length, 2);
      console.log(JSON.stringify({ width, conflictPreservesForm: true, successfulSaveRefreshesReports: true, otherCachedPeriodsInvalidated: true, archiveDatesEditable: true, popupFits: true, errors }));
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
