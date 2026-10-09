import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { STOCK_CSV_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-stock';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';
import { loadStockData } from 'src/logic-functions/utils/stock-data';
import { DEFAULT_RULE, groupMovements, monthSheet, monthSheetCsv, orderPlanCsv, stockStatus } from 'src/shared/stock';

// GET /s/stock/csv?kind=month&month=2026-05&owner=<workspace>  the monthly restock sheet
// GET /s/stock/csv?kind=order&owner=<workspace>                the order plan (items to re-order)

const plain = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const query = event.queryStringParameters ?? {};
  const kind = query.kind === 'order' ? 'order' : 'month';
  const ownerId = query.owner ?? '';
  const month = query.month ?? todayIso().slice(0, 7);

  if (kind === 'month' && !/^\d{4}-\d{2}$/.test(month)) return plain('month must be like 2026-05.', 400);

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
