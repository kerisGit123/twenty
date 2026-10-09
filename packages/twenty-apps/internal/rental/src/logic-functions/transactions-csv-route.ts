import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { TRANSACTIONS_CSV_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadTransactionsData } from 'src/logic-functions/page-data/transactions-data';
import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';
import { moneyInCsv, moneyOutCsv, receiptsCsv } from 'src/shared/transactions';

// GET /s/transactions/csv?tab=in|out|receipts&from=YYYY-MM-DD&to=YYYY-MM-DD&owner=<workspace id>
// The Transactions page's current tab as a CSV file (opens in Excel / Google Sheets).

const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const NAMES = { in: 'money-in', out: 'money-out', receipts: 'receipts' } as const;

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const query = event.queryStringParameters ?? {};
  const tab = (query.tab ?? 'in') as keyof typeof NAMES;
  const ownerId = query.owner ?? '';

  if (!(tab in NAMES)) return text('tab must be in, out or receipts.', 400);
  if (!isIsoDate(query.from) || !isIsoDate(query.to)) return text('from and to must be YYYY-MM-DD dates.', 400);

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (ownerId && !inScope(scope, ownerId)) return text("You don't have access to this workspace.", 403);

    const data = await loadTransactionsData(client, scope, query.from, query.to);
    const mine = <T extends { ownerId: string | null }>(rows: T[]) => (ownerId ? rows.filter((row) => row.ownerId === ownerId) : rows);
    const body = tab === 'in' ? moneyInCsv(mine(data.moneyIn)) : tab === 'out' ? moneyOutCsv(mine(data.moneyOut)) : receiptsCsv(mine(data.moneyIn));

    // The byte-order mark makes Excel read Chinese and Malay names correctly.
    return new Response(`\uFEFF${body}\r\n`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${NAMES[tab]}-${query.from}-to-${query.to}.csv"`,
      },
    });
  } catch (error) {
    console.error('[rental] transactions csv failed:', error);

    return text(`Could not build the file: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: TRANSACTIONS_CSV_ROUTE_FUNCTION_ID,
  name: 'transactions-csv-route',
  description: "Downloads the Transactions page's money in, money out or receipt register as CSV.",
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/transactions/csv', httpMethod: 'GET', isAuthRequired: true },
});
