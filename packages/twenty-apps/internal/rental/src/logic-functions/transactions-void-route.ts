import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { TRANSACTIONS_VOID_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';

// POST /s/transactions/void { paymentId, reason }: voids an issued receipt
// (it keeps its number) and notes why on the payment, so the receipt
// register shows the reason.

const json = (body: { success: boolean; message: string }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as { paymentId?: string; reason?: string };
  const reason = (body.reason ?? '').trim().slice(0, 300);

  if (!body.paymentId) return json({ success: false, message: 'No payment selected.' }, 400);
  if (!reason) return json({ success: false, message: 'Say why the receipt is void.' }, 400);

  try {
    // Checks the caller's access and that the receipt can be voided.
    const result = await receiptHandler('void', body.paymentId, context?.workspaceMemberId ?? undefined);

    if (!result.success) return json(result, result.status ?? 400);

    const client = appClient();
    const { rentPayments } = await client.query({
      rentPayments: { __args: { filter: { id: { eq: body.paymentId } }, first: 1 }, edges: { node: { notes: true } } },
    });
    const notes = (rentPayments?.edges?.[0]?.node?.notes as string | null) ?? '';

    await client.mutation({
      updateRentPayment: {
        __args: { id: body.paymentId, data: { notes: [notes, `Voided ${todayIso()}: ${reason}`].filter(Boolean).join('\n') } },
        id: true,
      },
    });

    return json(result);
  } catch (error) {
    console.error('[rental] void with reason failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: TRANSACTIONS_VOID_ROUTE_FUNCTION_ID,
  name: 'transactions-void-route',
  description: 'Voids an issued receipt from the Transactions page and records why.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/transactions/void', httpMethod: 'POST', isAuthRequired: true },
});
