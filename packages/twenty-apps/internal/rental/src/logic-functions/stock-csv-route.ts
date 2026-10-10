import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { STOCK_CSV_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-stock';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';
import { loadStockData } from 'src/logic-functions/utils/stock-data';
import { DEFAULT_RULE, groupMovements, monthSheet, monthSheetCsv, orderPlanCsv, stockStatus } from 'src/shared/stock';
import { stockMonthFileName, stockMonthWorkbook } from 'src/shared/stock-excel';

// GET /s/stock/csv?kind=month&month=2026-05&owner=<workspace>  the monthly restock sheet
// GET /s/stock/csv?kind=order&owner=<workspace>                the order plan (items to re-order)
// GET /s/stock/csv?kind=xlsx&month=2026-05&owner=<workspace>  the restock sheet as Excel, like the paper 订货单

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);

// Route bodies travel as text, so the file goes as base64 inside a page that
// rebuilds it in the browser and downloads it (with a button as a fallback).
const downloadPage = (fileName: string, bytes: Uint8Array) => {
  const base64 = Buffer.from(bytes).toString('base64');
  const name = escapeHtml(fileName);

  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${name}</title>
<body style="font-family:system-ui,sans-serif;padding:32px;color:#222">
<h3 style="margin:0 0 8px">${name}</h3>
<p style="color:#666;margin:0 0 16px">The download should start by itself. If it doesn't, use the button.</p>
<a id="file" download="${name}" style="display:inline-block;padding:10px 16px;background:#3b5bdb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Download Excel file</a>
<script>
  const bytes = Uint8Array.from(atob('${base64}'), (ch) => ch.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.getElementById('file');
  link.href = url;
  link.click();
</script>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
};

const plain = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const query = event.queryStringParameters ?? {};
  const kind = query.kind === 'order' ? 'order' : query.kind === 'xlsx' ? 'xlsx' : 'month';
  const ownerId = query.owner ?? '';
  const month = query.month ?? todayIso().slice(0, 7);

  if (kind !== 'order' && !/^\d{4}-\d{2}$/.test(month)) return plain('month must be like 2026-05.', 400);

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (ownerId && !inScope(scope, ownerId)) return plain("You don't have access to this workspace.", 403);

    const data = await loadStockData(client, scope);
    const items = data.items.filter((item) => !ownerId || item.ownerId === ownerId);
    const byItem = groupMovements(data.movements);
    const today = todayIso();
    let body: string;
    let name: string;

    if (kind === 'xlsx') {
      const owner = data.owners.find((o) => o.id === ownerId);
      const bytes = stockMonthWorkbook(items, byItem, month, (id) => data.owners.find((o) => o.id === id)?.rule ?? DEFAULT_RULE, {
        company: owner?.name ?? (scope.all ? 'All workspaces' : 'My workspaces'),
        generatedOn: today,
      });

      return downloadPage(stockMonthFileName(month), bytes);
    }

    if (kind === 'month') {
      // Discontinued items only appear in months they still moved in.
      const sheet = monthSheet(items, byItem, month);

      sheet.rows = sheet.rows.filter((r) => r.item.status !== 'DISCONTINUED' || r.opening || r.purchased || r.consumption || r.closing);
      body = monthSheetCsv(sheet);
      name = `stock-${month}`;
    } else {
      const rows = items
        .filter((item) => item.status !== 'DISCONTINUED')
        .map((item) => stockStatus(item, byItem.get(item.id) ?? [], data.owners.find((o) => o.id === item.ownerId)?.rule ?? DEFAULT_RULE, today))
        .filter((s) => s.suggestedCartons > 0);

      body = orderPlanCsv(rows);
      name = `stock-order-${today}`;
    }

    return new Response(`\uFEFF${body}\r\n`, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` },
    });
  } catch (error) {
    console.error('[rental] stock csv failed:', error);

    return plain(`Could not build the file: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: STOCK_CSV_ROUTE_FUNCTION_ID,
  name: 'stock-csv-route',
  description: 'Downloads the monthly stock sheet or the order plan as CSV.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/stock/csv', httpMethod: 'GET', isAuthRequired: true },
});
