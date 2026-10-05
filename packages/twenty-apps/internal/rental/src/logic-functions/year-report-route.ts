import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { YEAR_REPORT_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadYearData } from 'src/logic-functions/page-data/year-data';
import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';
import { summariseYear } from 'src/shared/year-summary';

// GET /s/reports/year?year=2026&owner=<workspace id>: the Year summary as a
// plain printable page (the browser's Print → Save as PDF makes the PDF).

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const query = event.queryStringParameters ?? {};
  const year = Number(query.year ?? new Date().getFullYear());
  const ownerId = query.owner ?? '';

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return html('<p>Pick a year like 2026.</p>', 400);

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (ownerId && !inScope(scope, ownerId)) return html("<p>You don't have access to this workspace.</p>", 403);

    const [data, { owners }] = await Promise.all([
      loadYearData(client, scope, year),
      // Only look the workspace up when one is picked (an empty id isn't a valid filter).
      ownerId
        ? client.query({ owners: { __args: { filter: { id: { eq: ownerId } }, first: 1 }, edges: { node: { name: true } } } })
        : Promise.resolve({ owners: null }),
    ]);
    const workspace = ownerId ? owners?.edges?.[0]?.node?.name ?? 'Workspace' : scope.all ? 'All workspaces' : 'All my workspaces';
    const s = summariseYear(data, ownerId);
    const net = (value: number) => `<td class="n ${value < 0 ? 'neg' : ''}">${rm(value)}</td>`;
    const change = (now: number, before: number) =>
      before === 0 ? `nothing in ${year - 1}` : `${now >= before ? '+' : '−'}${Math.abs(((now - before) / Math.abs(before)) * 100).toFixed(0)}% vs ${year - 1}`;

    const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Year summary ${year} — ${escape(workspace)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2328; margin: 32px auto; max-width: 820px; padding: 0 16px; font-size: 13px; }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 15px; margin: 28px 0 8px; }
  .sub { color: #6b7280; margin: 4px 0 20px; }
  table { width: 100%; border-collapse: collapse; } th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
  th { background: #f6f7f9; font-size: 12px; color: #6b7280; } .n { text-align: right; white-space: nowrap; }
  .neg { color: #c62828; } tr.total td { font-weight: 700; border-top: 2px solid #1f2328; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; } .kpi b { display: block; font-size: 18px; margin-top: 2px; }
  .muted { color: #6b7280; } .print { float: right; padding: 6px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; cursor: pointer; }
  @media print { .print { display: none; } body { margin: 0; } }
</style></head><body>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
<h1>Year summary ${year}</h1>
<p class="sub">${escape(workspace)} · printed ${new Date().toISOString().slice(0, 10)}</p>
<div class="kpis">
  <div class="kpi">Rent received<b>${rm(s.current.rent)}</b><span class="muted">${change(s.current.rent, s.previous.rent)}</span></div>
  <div class="kpi">Expenses<b>${rm(s.current.expenses)}</b><span class="muted">${change(s.current.expenses, s.previous.expenses)}</span></div>
  <div class="kpi">Net<b class="${s.current.net < 0 ? 'neg' : ''}">${rm(s.current.net)}</b><span class="muted">${year - 1}: ${rm(s.previous.net)}</span></div>
</div>
${s.deposits > 0 ? `<p class="muted">Deposits received in ${year}: ${rm(s.deposits)} (held for tenants, not income).</p>` : ''}
${s.missingBills > 0 ? `<p class="muted">${s.missingBills} of ${s.expenseCount} expenses have no bill attached.</p>` : ''}
<h2>Month by month</h2>
<table><tr><th>Month</th><th class="n">Rent received</th><th class="n">Expenses</th><th class="n">Net</th></tr>
${s.months.map((m) => `<tr><td>${m.month}</td><td class="n">${rm(m.rent)}</td><td class="n">${rm(m.expenses)}</td>${net(m.net)}</tr>`).join('')}
<tr class="total"><td>Total</td><td class="n">${rm(s.current.rent)}</td><td class="n">${rm(s.current.expenses)}</td>${net(s.current.net)}</tr></table>
<h2>Expenses by category</h2>
<table><tr><th>Group</th><th>Category</th><th class="n">Amount</th></tr>
${s.groups.flatMap((g) => g.categories.map((cat) => `<tr><td>${escape(g.label)}</td><td>${escape(cat.label)}</td><td class="n">${rm(cat.amount)}</td></tr>`)).join('') || '<tr><td colspan="3" class="muted">No expenses.</td></tr>'}
<tr class="total"><td colspan="2">Total</td><td class="n">${rm(s.current.expenses)}</td></tr></table>
<h2>By property</h2>
<table><tr><th>Property</th><th class="n">Rent received</th><th class="n">Expenses</th><th class="n">Net</th></tr>
${s.properties.map((p) => `<tr><td>${escape(p.name)}</td><td class="n">${rm(p.rent)}</td><td class="n">${rm(p.expenses)}</td>${net(p.net)}</tr>`).join('')}
<tr class="total"><td>Total</td><td class="n">${rm(s.current.rent)}</td><td class="n">${rm(s.current.expenses)}</td>${net(s.current.net)}</tr></table>
</body></html>`;

    return html(page);
  } catch (error) {
    console.error('[rental] year report failed:', error);

    return html(`<p>Could not build the report: ${escape(error instanceof Error ? error.message : String(error))}</p>`, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: YEAR_REPORT_ROUTE_FUNCTION_ID,
  name: 'year-report-route',
  description: 'The Year summary as a printable page, limited to the caller\'s workspaces.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/reports/year', httpMethod: 'GET', isAuthRequired: true },
});
