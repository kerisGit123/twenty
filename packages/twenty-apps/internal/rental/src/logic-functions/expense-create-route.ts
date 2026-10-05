import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { EXPENSE_CREATE_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { personalOwnerId, propertyOwnerId } from 'src/logic-functions/utils/owner-sync';
import { inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';
import { EXPENSE_CATEGORIES } from 'src/shared/expense-categories';

type Body = {
  name?: string;
  expenseDate?: string;
  amount?: number;
  category?: string;
  method?: string;
  paidTo?: string;
  notes?: string;
  propertyId?: string | null;
  ownerId?: string | null;
};

const METHODS = ['BANK_TRANSFER', 'DUITNOW', 'CASH', 'CARD', 'OTHER'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// POST a new expense from the Expenses page. The workspace comes from the
// property when one is picked (else the chosen one, else Personal), and must
// be one of the caller's workspaces.
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;
  const amount = Number(body.amount);

  if (!body.name?.trim() || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(body.expenseDate ?? '')) {
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

    const { createExpense } = await client.mutation({
      createExpense: {
        __args: {
          data: {
            name: body.name.trim(),
            expenseDate: body.expenseDate,
            amount: { amountMicros: Math.round(amount * 1_000_000), currencyCode: 'MYR' },
            category: (EXPENSE_CATEGORIES.some((c) => c.value === body.category) ? body.category : 'OTHER') as never,
            method: (METHODS.includes(body.method ?? '') ? body.method : 'OTHER') as never,
            paidTo: body.paidTo?.trim() ?? '',
            notes: body.notes?.trim() ?? '',
            propertyId: body.propertyId || null,
            ownerId,
          },
        },
        id: true,
      },
    });

    return json({ success: true, id: createExpense?.id });
  } catch (error) {
    console.error('[rental] create expense failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: EXPENSE_CREATE_ROUTE_FUNCTION_ID,
  name: 'expense-create-route',
  description: "Adds an expense in one of the caller's workspaces.",
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/expenses/create', httpMethod: 'POST', isAuthRequired: true },
});
