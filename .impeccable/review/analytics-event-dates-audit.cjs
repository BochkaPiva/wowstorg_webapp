// Read-only real database audit; exports are built/parsed in memory, never persisted.
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const Module = require('node:module'), resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...args); };
const { prisma } = require('../../src/server/db');
const { getAdminAnalyticsData } = require('../../src/server/admin-analytics');
const { buildAdminAnalyticsXlsx } = require('../../src/server/admin-analytics-xlsx');
const { analyticsCustomerRows } = require('../../src/lib/analytics-presentation');
const { sumAnalyticsMoney, projectActualDate } = require('../../src/lib/analytics-finance');
const ExcelJS = require('exceljs'), assert = require('node:assert/strict');
async function main() {
  for (const scope of [{ from: '2026-01-01', to: '2026-10-08' }, { from: '2026-01-01', to: '2026-10-09' }, { from: '2026-09-01', to: '2026-09-30' }]) {
    const data = await getAdminAnalyticsData(scope), sum = (rows, key) => sumAnalyticsMoney(rows.map(row => row[key]));
    assert.equal(sum(analyticsCustomerRows(data), 'actualRevenue'), data.overview.finance.fact.revenueTotal);
    assert.equal(sum(data.overview.timeline, 'revenue'), data.overview.finance.fact.revenueTotal);
    assert.equal(sum(data.overview.timeline, 'profit'), data.overview.finance.fact.profitTotal);
    for (const row of data.projects.pendingDates) {
      const inPeriod = projectActualDate(row) >= scope.from && projectActualDate(row) <= scope.to;
      assert.equal(data.facts.some(fact => fact.source === 'PROJECT' && fact.id === row.projectId), inPeriod);
    }
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buildAdminAnalyticsXlsx(data, 'global'));
    let exportedRevenue = 0; wb.getWorksheet('Динамика').eachRow((row, number) => { if (number >= 7) exportedRevenue = sumAnalyticsMoney([exportedRevenue, Number(row.getCell(2).value) || 0]); });
    assert.equal(exportedRevenue, data.overview.finance.fact.revenueTotal);
    console.log(JSON.stringify({ scope, revenue: data.overview.finance.fact.revenueTotal, pendingDates: data.projects.pendingDates.map(row => ({ title: row.title, closedDate: row.closedDate, included: data.projects.rows.some(p => p.projectId === row.projectId) })), customerChartExcelParity: true }));
  }
}
main().catch(error => { console.error('READ_ONLY_AUDIT_FAILED', error.code || error.name); process.exitCode = 1; }).finally(() => prisma.$disconnect());
