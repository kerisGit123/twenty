import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { TAX_PACK_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { loadYearData } from 'src/logic-functions/page-data/year-data';
import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';
import { expenseCategory } from 'src/shared/expense-categories';
import { buildTaxPack, TAX_CLASSES } from 'src/shared/lhdn';

// GET /s/reports/tax?year=2026&owner=<workspace id>: the year's rental income
// and allowable expenses per property, laid out for Form BE/B (section 4(d)
// rents) — a printable working sheet for you or your tax agent.

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const html = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const query = event.queryStringParameters ?? {};
  const year = Number(query.year ?? new Date().getFullYear());
  const ownerId = query.owner ?? '';

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return html('<p>Pick a year like 2026.</p>', 400);

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (ownerId && !inScope(scope, ownerId)) return html("<p>You don't have access to this workspace.</p>", 403);

    const [data, settings, { owners }] = await Promise.all([
      loadYearData(client, scope, year),
      loadReceiptSettings(client),
      // Only look the workspace up when one is picked (an empty id isn't a valid filter).
      ownerId
        ? client.query({ owners: { __args: { filter: { id: { eq: ownerId } }, first: 1 }, edges: { node: { name: true } } } })
        : Promise.resolve({ owners: null }),
    ]);
    const workspace = ownerId ? owners?.edges?.[0]?.node?.name ?? 'Workspace' : scope.all ? 'All workspaces' : 'All my workspaces';
    const pack = buildTaxPack(data, ownerId);
    const propertyName = (id: string | null) => data.properties.find((p) => p.id === id)?.name ?? '—';
    const notes = TAX_CLASSES.filter((c) => c.note && pack.properties.some((p) => p.lines.some((l) => l.key === c.key)));

    const propertyTable = pack.properties
      .map(
        (p) => `
<h3>${escape(p.name)}</h3>
<table>
  <tr><td>Gross rent received <span class="ms">Sewa kasar diterima</span></td><td class="n">${rm(p.income)}</td></tr>
  ${p.lines.map((l) => `<tr><td class="ind">Less: ${escape(l.label)} <span class="ms">${escape(l.ms)}</span> <span class="muted">(${l.count})</span></td><td class="n">(${rm(l.amount)})</td></tr>`).join('')}
  <tr class="total"><td>Net rental ${p.net < 0 ? 'loss' : 'income'} <span class="ms">Pendapatan sewa bersih</span></td><td class="n ${p.net < 0 ? 'neg' : ''}">${rm(p.net)}</td></tr>
  ${p.capital ? `<tr><td class="muted">Not deductible — renovation & furniture (capital)</td><td class="n muted">${rm(p.capital)}</td></tr>` : ''}
  ${p.other ? `<tr><td class="muted">Other property spending, not on LHDN's list — check with your tax agent</td><td class="n muted">${rm(p.other)}</td></tr>` : ''}
</table>`,
      )
      .join('');

    const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rental income ${year} (LHDN) — ${escape(workspace)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2328; margin: 32px auto; max-width: 820px; padding: 0 16px; font-size: 13px; line-height: 1.45; }
  h1 { font-size: 21px; margin: 0; } h2 { font-size: 15px; margin: 26px 0 8px; } h3 { font-size: 14px; margin: 18px 0 6px; }
  .sub { color: #6b7280; margin: 4px 0 18px; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
  th { background: #f6f7f9; font-size: 12px; color: #6b7280; } .n { text-align: right; white-space: nowrap; }
  .ind { padding-left: 20px; } .ms { color: #6b7280; font-size: 11.5px; } .muted { color: #6b7280; }
  .neg { color: #c62828; } tr.total td { font-weight: 700; border-top: 2px solid #1f2328; }
  .box { border: 2px solid #1f2328; border-radius: 8px; padding: 12px 14px; margin: 14px 0; }
  .box b { font-size: 18px; } .warn { background: #fff8e1; border: 1px solid #f3d27a; border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
  .print { float: right; padding: 6px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; cursor: pointer; }
  ul { margin: 6px 0; padding-left: 18px; } li { margin: 3px 0; }
  @media print { .print { display: none; } body { margin: 0; } }
</style></head><body>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
<h1>Rental income ${year} — for your tax return</h1>
<div class="sub">${settings?.businessName?.trim() ? `${escape(settings.businessName.trim())} · ` : ''}${escape(workspace)} · rent by date received</div>

<div class="box">
  Net rental income for Form BE / B, <b>section 4(d) Rents</b> (Pendapatan sewa, perenggan 4(d)):<br>
  <b>${rm(pack.taxable)}</b>
  ${pack.net < 0 ? `<div class="muted">Overall a rental loss of ${rm(-pack.net)} — it can't be set against other income such as salary.</div>` : ''}
</div>

<table>
  <tr><th>Property</th><th class="n">Rent received</th><th class="n">Allowable expenses</th><th class="n">Net</th></tr>
  ${pack.properties.map((p) => `<tr><td>${escape(p.name)}</td><td class="n">${rm(p.income)}</td><td class="n">${rm(p.deductible)}</td><td class="n ${p.net < 0 ? 'neg' : ''}">${rm(p.net)}</td></tr>`).join('')}
  <tr class="total"><td>Total</td><td class="n">${rm(pack.income)}</td><td class="n">${rm(pack.deductible)}</td><td class="n">${rm(pack.net)}</td></tr>
</table>
${pack.properties.length === 0 ? '<p class="muted">No rent received or property expenses recorded in this year.</p>' : ''}

<h2>By property</h2>
${propertyTable}

${notes.length ? `<h2>Check before you file</h2><ul>${notes.map((c) => `<li><b>${escape(c.label)}:</b> ${escape(c.note ?? '')}</li>`).join('')}</ul>` : ''}

${
  pack.noBill.length
    ? `<div class="warn"><b>${pack.noBill.length} claim${pack.noBill.length === 1 ? '' : 's'} without a bill.</b> LHDN can reject expenses you can't prove — attach the bill, or leave them out.
<table>${pack.noBill.map((e) => `<tr><td>${day(e.date)}</td><td>${escape(e.name || expenseCategory(e.category).label)}</td><td>${escape(propertyName(e.propertyId))}</td><td class="n">${rm(e.amount)}</td></tr>`).join('')}</table></div>`
    : ''
}
${
  pack.unlinked.length
    ? `<div class="warn"><b>${pack.unlinked.length} property cost${pack.unlinked.length === 1 ? '' : 's'} not linked to a property</b> — they aren't counted above. Link each to its property on the Expenses page.
<table>${pack.unlinked.map((e) => `<tr><td>${day(e.date)}</td><td>${escape(e.name || expenseCategory(e.category).label)}</td><td>${escape(expenseCategory(e.category).label)}</td><td class="n">${rm(e.amount)}</td></tr>`).join('')}</table></div>`
    : ''
}

<h2>Notes</h2>
<ul class="muted">
  <li>Allowable expenses follow LHDN Public Ruling 12/2018 (Rental Income): assessment, quit rent, loan interest, fire insurance, repairs & maintenance, service charge & sinking fund, rent collection, and renewal fees.</li>
  <li>Deposits are not income unless kept (e.g. forfeited or used for rent) — rent paid from a deposit is already included above.</li>
  <li>Expenses in other currencies are left out. Amounts are as recorded — this is a working sheet, not tax advice.</li>
</ul>
</body></html>`;

    return html(page);
  } catch (error) {
    console.error('[rental] tax pack failed:', error);

    return html('<p>Could not build the tax pack.</p>', 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: TAX_PACK_ROUTE_FUNCTION_ID,
  name: 'tax-pack-route',
  description: 'Printable rental income working sheet for the LHDN tax return (section 4(d)).',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/reports/tax', httpMethod: 'GET', isAuthRequired: true },
});
