import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';
import { LEDGER_RECORD_ROUTE_ID } from 'src/constants/universal-identifiers';
import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { monthStart } from 'src/logic-functions/utils/dates';
import {
  createDraftRentPayment,
  findRentPaymentForMonth,
  loadRental,
} from 'src/logic-functions/utils/rental-service';

type LedgerRecordBody = {
  rentalId?: string;
  month?: string; // any date in the rent month, 'YYYY-MM-DD'
  amount?: number; // RM
  paidOn?: string;
  method?: string;
  notes?: string;
  receiptDate?: string | null; // YYYY-MM-DD to back-date the receipt; empty = issue date
  action?: 'preview' | 'issue' | 'send';
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Record payment from the Rent Ledger: reuse the month's draft (or create
// one), save the form, then preview, issue or send the receipt.
const handler = async (
  event: RoutePayload,
  context?: { workspaceMemberId?: string | null },
): Promise<Response> => {
  const body = (event.body ?? {}) as LedgerRecordBody;
  const action = body.action ?? 'send';

  if (!body.rentalId || !body.month) {
    return json({ success: false, message: 'Choose a rental and a month.' }, 400);
  }
  if (!body.amount || body.amount <= 0) {
    return json({ success: false, message: 'Enter the amount received.' }, 400);
  }

  try {
    const client = appClient();
    const rental = await loadRental(client, body.rentalId);

    if (!rental) return json({ success: false, message: 'Rental not found.' }, 404);
    if (!inScope(await resolveScope(client, context?.workspaceMemberId), rental.property?.ownerId)) {
      return json(NOT_ALLOWED, 403);
    }

    const month = monthStart(body.month);
    const existing = await findRentPaymentForMonth(client, rental.id, month);

    if (existing && existing.status !== 'DRAFT') {
      return json(
        {
          success: false,
          message: `This month already has receipt ${existing.receiptNumber}. Use "Correct receipt" to change it.`,
        },
        409,
      );
    }

    const paymentId =
      existing?.id ?? (await createDraftRentPayment(client, rental, month, body.method));

    if (!paymentId) return json({ success: false, message: 'Could not create the payment.' }, 500);

    await client.mutation({
      updateRentPayment: {
        __args: {
          id: paymentId,
          data: {
            amount: { amountMicros: Math.round(body.amount * 1_000_000), currencyCode: 'MYR' },
            paidOn: body.paidOn || null,
            ...(body.method ? { method: body.method } : {}),
            notes: body.notes ?? '',
            receiptDate: /^\d{4}-\d{2}-\d{2}$/.test(body.receiptDate ?? '') ? body.receiptDate : null,
          } as never,
        },
        id: true,
      },
    });

    const result = await receiptHandler(action, paymentId, context?.workspaceMemberId ?? undefined);

    return json({ ...result, paymentId }, result.success ? 200 : (result.status ?? 400));
  } catch (error) {
    console.error('[rental] ledger record failed:', error);

    return json(
      {
        success: false,
        message: `Something went wrong: ${error instanceof Error ? error.message : String(error)}`,
      },
      500,
    );
  }
};

export default defineLogicFunction({
  universalIdentifier: LEDGER_RECORD_ROUTE_ID,
  name: 'ledger-record-route',
  description: 'Records a rent payment from the Rent Ledger and previews, issues or sends its receipt.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/ledger/record', httpMethod: 'POST', isAuthRequired: true },
});
