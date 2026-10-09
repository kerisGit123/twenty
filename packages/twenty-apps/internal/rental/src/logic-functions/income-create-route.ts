import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { INCOME_CREATE_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { personalOwnerId, propertyOwnerId } from 'src/logic-functions/utils/owner-sync';
import { inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';
import { CURRENCIES } from 'src/shared/currencies';
import { INCOME_CATEGORIES, INCOME_METHODS } from 'src/shared/income-categories';

type Body = {
  name?: string;
  incomeDate?: string;
  amount?: number;
  currency?: string;
  category?: string;
  method?: string;
  receivedFrom?: string;
  notes?: string;
  propertyId?: string | null;
  ownerId?: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// POST a new income record from the Transactions page. The workspace comes
// from the property when one is picked (else the chosen one, else Personal),
// and must be one of the caller's workspaces.
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;
  const amount = Number(body.amount);

  if (!body.name?.trim() || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(body.incomeDate ?? '')) {
    return json({ success: false, message: 'Add a description, a date and an amount.' }, 400);
  }

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const ownerId =
      (body.propertyId ? await propertyOwnerId(client, body.propertyId) : null) ??
      body.ownerId ??
      (await personalOwnerId(client));

    if (!inScope(scope, ownerId)) {
      return json(
        scope.all ? NOT_ALLOWED : { ...NOT_ALLOWED, message: 'Pick one of your workspaces (or a property in one).' },
        403,
      );
    }

    const { createIncome } = await client.mutation({
      createIncome: {
        __args: {
          data: {
            name: body.name.trim(),
            incomeDate: body.incomeDate,
            amount: {
              amountMicros: Math.round(amount * 1_000_000),
              currencyCode: CURRENCIES.some((x) => x.code === body.currency) ? body.currency : 'MYR',
            },
            category: (INCOME_CATEGORIES.some((c) => c.value === body.category) ? body.category : 'OTHER') as never,
            method: (INCOME_METHODS.some((m) => m.value === body.method) ? body.method : 'OTHER') as never,
            receivedFrom: body.receivedFrom?.trim() ?? '',
            notes: body.notes?.trim() ?? '',
            propertyId: body.propertyId || null,
            ownerId,
          },
        },
        id: true,
      },
    });

    return json({ success: true, id: createIncome?.id, message: 'Income recorded.' });
  } catch (error) {
    console.error('[rental] create income failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: INCOME_CREATE_ROUTE_FUNCTION_ID,
  name: 'income-create-route',
  description: "Records income (not a rent receipt) in one of the caller's workspaces.",
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/income/create', httpMethod: 'POST', isAuthRequired: true },
});
