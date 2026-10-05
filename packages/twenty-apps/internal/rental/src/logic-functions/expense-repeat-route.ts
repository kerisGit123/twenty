import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { EXPENSE_REPEAT_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';
import { nextRepeatDate } from 'src/shared/repeating';

type Body = {
  expenseId?: string;
  action?: 'add' | 'stop';
  amount?: number; // RM etc.; default: same as last time
  date?: string; // default: the next due date
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// POST /expenses/repeat — a repeating bill fell due: add the next one (a copy
// on its due date, still repeating) or stop repeating.
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  if (!body.expenseId || (body.action !== 'add' && body.action !== 'stop')) {
    return json({ success: false, message: 'Pick a bill.' }, 400);
  }

  try {
    const client = appClient();
    const { expenses } = await client.query({
      expenses: {
        __args: { filter: { id: { eq: body.expenseId } }, first: 1 },
        edges: {
          node: {
            id: true,
            name: true,
            expenseDate: true,
            amount: { amountMicros: true, currencyCode: true },
            category: true,
            method: true,
            paidTo: true,
            propertyId: true,
            ownerId: true,
            repeatEvery: true,
            repeatHandled: true,
          },
        },
      },
    });
    const expense = expenses?.edges?.[0]?.node;

    if (!expense) return json({ success: false, message: 'Expense not found.' }, 404);
    if (!inScope(await resolveScope(client, context?.workspaceMemberId), expense.ownerId)) return json(NOT_ALLOWED, 403);

    if (body.action === 'stop') {
      await client.mutation({ updateExpense: { __args: { id: expense.id, data: { repeatEvery: 'NONE' } as never }, id: true } });

      return json({ success: true, message: `${expense.name} no longer repeats.` });
    }

    if (expense.repeatHandled || !expense.repeatEvery || expense.repeatEvery === 'NONE') {
      return json({ success: false, message: 'The next one was already added.' }, 409);
    }

    const amount = Number(body.amount);
    const { createExpense } = await client.mutation({
      createExpense: {
        __args: {
          data: {
            name: expense.name,
            expenseDate: /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date : nextRepeatDate(expense.expenseDate as string, expense.repeatEvery as string),
            amount: {
              amountMicros: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 1_000_000) : (expense.amount?.amountMicros ?? 0),
              currencyCode: expense.amount?.currencyCode || 'MYR',
            },
            category: expense.category,
            method: expense.method,
            paidTo: expense.paidTo ?? '',
            propertyId: expense.propertyId ?? null,
            ownerId: expense.ownerId ?? null,
            repeatEvery: expense.repeatEvery,
          } as never,
        },
        id: true,
      },
    });

    // The new one carries the series on; this one is done.
    await client.mutation({ updateExpense: { __args: { id: expense.id, data: { repeatHandled: true } as never }, id: true } });

    return json({ success: true, id: createExpense?.id, message: `Added ${expense.name}.` });
  } catch (error) {
    console.error('[rental] repeat expense failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: EXPENSE_REPEAT_ROUTE_FUNCTION_ID,
  name: 'expense-repeat-route',
  description: 'Adds the next bill of a repeating expense, or stops it repeating.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/expenses/repeat', httpMethod: 'POST', isAuthRequired: true },
});
