import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { PAGE_DATA_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadExpensesData } from 'src/logic-functions/page-data/expenses-data';
import { loadLedgerData } from 'src/logic-functions/page-data/ledger-data';
import { loadTodayData } from 'src/logic-functions/page-data/today-data';
import { loadYearData } from 'src/logic-functions/page-data/year-data';
import { appClient } from 'src/logic-functions/utils/app-client';
import { resolveScope } from 'src/logic-functions/utils/scope';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

// POST { page: 'ledger' | 'expenses', from, to }, { page: 'today' } or { page: 'year', year }.
// Data for the rental pages, read as the app and cut down to the caller's
// workspaces — staff can't read the tables directly.
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as { page?: string; from?: unknown; to?: unknown; year?: unknown };

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (body.page === 'today') return json({ success: true, data: await loadTodayData(client, scope) });
    if (body.page === 'year') {
      const year = Number(body.year);

      if (!Number.isInteger(year) || year < 2000 || year > 2100) return json({ success: false, message: 'year must be like 2026.' }, 400);

      return json({ success: true, data: await loadYearData(client, scope, year) });
    }

    if (!isIsoDate(body.from) || !isIsoDate(body.to)) {
      return json({ success: false, message: 'from and to must be YYYY-MM-DD dates.' }, 400);
    }
    if (body.page === 'ledger') return json({ success: true, data: await loadLedgerData(client, scope, body.from, body.to) });
    if (body.page === 'expenses') return json({ success: true, data: await loadExpensesData(client, scope, body.from, body.to) });

    return json({ success: false, message: 'Unknown page.' }, 400);
  } catch (error) {
    console.error('[rental] page data failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: PAGE_DATA_ROUTE_FUNCTION_ID,
  name: 'page-data-route',
  description: "Loads the rental pages' data, limited to the caller's workspaces.",
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/pages/data', httpMethod: 'POST', isAuthRequired: true },
});
