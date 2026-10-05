import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { STATEMENT_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { resolveScope } from 'src/logic-functions/utils/scope';
import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { loadStatementSource } from 'src/logic-functions/utils/statement-data';
import { loadTemplates } from 'src/logic-functions/utils/templates';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// POST { rentalId, year } -> { source, templates, accent }: what the tenant
// year statement is built from, and the statement templates to draw it with.
// POST { action: 'save', rentalId, tenantDetails, statementNote } -> saves the
// contract's letter details.
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as {
    action?: string;
    rentalId?: string;
    year?: number;
    tenantDetails?: string;
    statementNote?: string;
  };

  try {
    if (!body.rentalId) return json({ success: false, message: 'Pick a contract.' }, 400);

    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const year = Number(body.year ?? new Date().getFullYear());
    const source = await loadStatementSource(client, scope, body.rentalId, Number.isInteger(year) ? year : new Date().getFullYear());

    if (!source) return json({ success: false, message: "You don't have access to this contract." }, 403);

    if (body.action === 'save') {
      await client.mutation({
        updateRental: {
          __args: {
            id: body.rentalId,
            data: { tenantDetails: body.tenantDetails ?? '', statementNote: body.statementNote ?? '' } as never,
          },
          id: true,
        },
      });

      return json({ success: true });
    }

    const [templates, settings] = await Promise.all([loadTemplates(client, 'STATEMENT'), loadReceiptSettings(client)]);

    return json({ success: true, source, templates, accent: (settings?.accentColor as string | null) ?? 'BLACK' });
  } catch (error) {
    console.error('[rental] statement failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: STATEMENT_ROUTE_FUNCTION_ID,
  name: 'statement-route',
  description: "Data for a tenant's year statement, and saves its letter details.",
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/statements/year', httpMethod: 'POST', isAuthRequired: true },
});
