// Read-only audit: invokes the production read-model; never writes business data.
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...args);
};
const { prisma } = require('../../src/server/db');
const { getAdminAnalyticsData } = require('../../src/server/admin-analytics');
const { analyticsCustomerRows, completeAnalyticsTimeline } = require('../../src/lib/analytics-presentation');
const assert = require('node:assert/strict');
const { sumAnalyticsMoney } = require('../../src/lib/analytics-finance');
const sum = (rows, field) => sumAnalyticsMoney(rows.map(row => row[field]));
function assertTotals(data) {
  const customers = analyticsCustomerRows(data);
  assert.equal(sum(customers,'actualRevenue'), data.overview.finance.fact.revenueTotal);
  assert.equal(sum(customers,'activeRevenue'), data.overview.finance.forecast.revenueTotal);
  assert.equal(sum(data.overview.timeline,'revenue'), data.overview.finance.fact.revenueTotal);
  assert.equal(sum(data.overview.timeline,'profit'), data.overview.finance.fact.profitTotal);
  assert.equal(sumAnalyticsMoney(data.overview.finance.bonuses.factShares),data.overview.finance.bonuses.factPool);
  assert(data.projects.unassigned.every(project => !data.facts.some(fact => fact.source==='PROJECT' && fact.id===project.projectId)));
}

async function main() {
  if (process.argv.includes('--boundaries')) {
    const ExcelJS = require('exceljs');
    const { buildAdminAnalyticsXlsx } = require('../../src/server/admin-analytics-xlsx');
    for (const scope of [{ from: '2026-07-01', to: '2026-07-31' }, { from: '2026-08-01', to: '2026-08-31' }]) {
      const data = await getAdminAnalyticsData(scope);
    assertTotals(data);
      const timeline = completeAnalyticsTimeline(data.overview.timeline, scope.from, scope.to);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await buildAdminAnalyticsXlsx(data, 'global'));
      const excelDynamics = [];
      workbook.getWorksheet('Динамика').eachRow((row, number) => {
        if (number >= 7 && /^\d{4}-\d{2}$/.test(String(row.getCell(1).value))) excelDynamics.push({ month: row.getCell(1).value, revenue: row.getCell(2).value, projectsRevenue: row.getCell(5).value });
      });
      console.log(JSON.stringify({ boundaryCheck: { scope, fact: data.overview.finance.fact.revenueTotal, uiTimeline: timeline, excelDynamics, panda: data.projects.rows.filter(row => row.title.includes('Панда')).map(row => ({ title: row.title, revenue: row.financials.revenueTotal })), bonuses: data.overview.finance.bonuses } }));
    }
    return;
  }
  for (const to of process.argv.includes('--details') ? [] : ['2026-07-23', '2026-09-07', '2026-10-08']) {
    const scope = { from: '2026-01-01', to };
    const data = await getAdminAnalyticsData(scope);
    assertTotals(data);
    const customers = analyticsCustomerRows(data).sort((a, b) => b.actualRevenue - a.actualRevenue);
    const timeline = completeAnalyticsTimeline(data.overview.timeline, scope.from, scope.to);
    console.log(JSON.stringify({
      scope, fact: data.overview.finance.fact, forecast: data.overview.finance.forecast,
      customersFact: sum(customers, 'actualRevenue'), chartFact: sum(timeline, 'revenue'),
      leaders: customers.slice(0, 6).map(row => ({ name: row.customerName, total: row.actualRevenue, projects: row.actualProjects, orders: row.closedOrdersFactRevenue, forecast: row.activeRevenue })),
      projectCounts: { total: data.projects.rows.length, completed: data.projects.rows.filter(r => r.status === 'COMPLETED').length, missingEstimateCompleted: data.projects.rows.filter(r => r.status === 'COMPLETED' && !r.hasPrimaryEstimate).length, allRiskRows: data.projects.rows.filter(r => r.risks.length).length, returnedRisks: data.projects.risks.length },
      orders: data.requisites.kpi,
      items: { priced: data.requisites.profitability.rows.length, revenueTop: data.requisites.tops.topByRevenue.length, issuedTop: data.requisites.tops.topByIssued.length },
      outsideChart: data.overview.timeline.filter(row => row.month < scope.from.slice(0, 7) || row.month > scope.to.slice(0, 7)),
    }));
  }
  const projects = await prisma.project.findMany({ where: { mode: 'FULL' }, select: { title: true, status: true, customerId: true, eventStartDate: true, eventEndDate: true, estimateVersions: { select: { versionNumber: true, isPrimary: true, includeInProjectTotals: true } } } });
  console.log(JSON.stringify({ projectQuality: {
    noEventDates: projects.filter(p => !p.eventStartDate && !p.eventEndDate).map(p => ({ title: p.title, status: p.status })),
    noCustomer: projects.filter(p => !p.customerId).map(p => ({ title: p.title, status: p.status })),
    multipleIncludedEstimates: projects.filter(p => p.estimateVersions.filter(v => v.includeInProjectTotals).length > 1).map(p => ({ title: p.title, versions: p.estimateVersions })),
  } }));
  if (!process.argv.includes('--details')) return;
  const all = await getAdminAnalyticsData({});
  assertTotals(all);
  const scope = { from: '2026-01-01', to: '2026-10-08' };
  const dated = await getAdminAnalyticsData(scope);
  const missingDates = all.projects.unassigned.filter(row => row.status === 'COMPLETED');
  console.log(JSON.stringify({ completedWithoutDates: missingDates.map(row => ({ title: row.title, customer: row.customerName, revenue: row.financials.revenueTotal, profit: row.financials.marginAfterTax, hasEstimate: row.hasPrimaryEstimate })), excludedRevenueWithoutDates: sum(missingDates.map(r => r.financials), 'revenueTotal') }));
  const lineOrders = await prisma.order.findMany({ where: { status: 'CLOSED', projectId: null, endDate: { gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2026-10-09T00:00:00Z') } }, select: { lines: { select: { itemId: true, requestedQty: true, issuedQty: true } } } });
  const issuedItems = new Set(lineOrders.flatMap(order => order.lines.map(line => line.itemId)));
  const tableItems = new Set(dated.requisites.items.map(row => row.itemId));
  console.log(JSON.stringify({ requisitesCompleteness: { actuallyUsedItems: issuedItems.size, tableItems: tableItems.size, usedItemsMissingFromTable: [...issuedItems].filter(id => !tableItems.has(id)).length, pricedItems: dated.requisites.profitability.rows.length, purchaseTotal: dated.requisites.profitability.summary.totalPurchaseCost, revenueTracked: dated.requisites.profitability.summary.totalRevenue, labelledGrossProfit: dated.requisites.profitability.summary.totalGrossProfit }, multiMonthCompletedProjects: all.projects.rows.filter(row => row.status === 'COMPLETED' && row.eventStartDate && row.eventEndDate && row.eventStartDate.slice(0, 7) !== row.eventEndDate.slice(0, 7)).map(row => ({ title: row.title, from: row.eventStartDate, to: row.eventEndDate, revenue: row.financials.revenueTotal })) }));
  const customers = await prisma.customer.findMany({ select: { id: true, name: true, normalizedName: true, mergedIntoId: true } });
  const idsWithMoney = new Set(all.customers.rows.filter(row => row.ltvMixed !== 0).map(row => row.customerId));
  const duplicateNames = new Map();
  for (const row of customers.filter(row => !row.mergedIntoId && idsWithMoney.has(row.id))) {
    const key = row.normalizedName || row.name.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
    const group = duplicateNames.get(key) || []; group.push(row.name); duplicateNames.set(key, group);
  }
  console.log(JSON.stringify({ customerIdentity: { sameNormalizedNameWithMoney: [...duplicateNames.values()].filter(group => group.length > 1), mergedCardsWithMoney: customers.filter(row => row.mergedIntoId && idsWithMoney.has(row.id)).length } }));
  const { buildProjectEstimateReadModel } = require('../../src/server/projects/estimate-read-model');
  for (const row of dated.projects.rows.filter(row => row.status !== 'CANCELLED' && row.hasPrimaryEstimate)) {
    const estimate = await buildProjectEstimateReadModel({ projectId: row.projectId });
    const included = estimate.versions.filter(version => version.includeInProjectTotals);
    const estimateRevenue = sum(included.map(version => version.financials), 'revenueTotal');
    const estimateProfit = sum(included.map(version => version.financials), 'marginAfterTax');
    console.log(JSON.stringify({ estimateParity: { title: row.title, analyticsRevenue: row.financials.revenueTotal, estimateRevenue, analyticsProfit: row.financials.marginAfterTax, estimateProfit, deltaRevenue: row.financials.revenueTotal - estimateRevenue, deltaProfit: row.financials.marginAfterTax - estimateProfit } }));
  }
}
main().catch(error => { console.error('READ_ONLY_AUDIT_FAILED', error.code || error.name); process.exitCode = 1; }).finally(() => prisma.$disconnect());
