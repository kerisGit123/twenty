import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';
import { LEDGER_RECORD_ROUTE_ID } from 'src/constants/universal-identifiers';
import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { monthStart } from 'src/logic-functions/utils/dates';
import {
  createDraftRentPayment,
  loadRental,
  rentalRentForMonth,
  keepOneDraft,
  rentPaymentsForMonth,
} from 'src/logic-functions/utils/rental-service';
import { settleMonth } from 'src/shared/rent-month';

type LedgerRecordBody = {
  rentalId?: string;
  month?: string; // any date in the rent month, 'YYYY-MM-DD'
  amount?: number; // RM
  paidOn?: string;
  method?: string;
  notes?: string;
  receiptDate?: string | null; // YYYY-MM-DD to back-date the receipt; empty = issue date
  // waive: don't charge the month (or what's left of it); unwaive: undo.
  action?: 'preview' | 'issue' | 'send' | 'waive' | 'unwaive';
};

const money = (rm: number) => ({ amountMicros: Math.round(rm * 1_000_000), currencyCode: 'MYR' });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Record payment from the Rent Ledger: reuse the month's draft (or create
// one), save the form, then preview, issue or send the receipt. A part-paid
// month takes another payment (its own receipt) until it's paid in full.
// Also waives a month, or undoes that.
const handler = async (
  event: RoutePayload,
  context?: { workspaceMemberId?: string | null },
): Promise<Response> => {
  const body = (event.body ?? {}) as LedgerRecordBody;
  const action = body.action ?? 'send';

  if (!body.rentalId || !body.month) {
    return json({ success: false, message: 'Choose a rental and a month.' }, 400);
  }
  const waiving = action === 'waive' || action === 'unwaive';

  const amount = Number(body.amount);

  if (!waiving && (typeof body.amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
    return json({ success: false, message: 'Enter the amount received.' }, 400);
  }
  if (amount > 10_000_000) return json({ success: false, message: 'That amount looks too large — check it.' }, 400);
  if (body.paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(body.paidOn)) return json({ success: false, message: 'Pick a valid paid-on date.' }, 400);
  if ((body.notes ?? '').length > 1000) return json({ success: false, message: 'Notes are too long (1,000 characters at most).' }, 400);

  try {
    const client = appClient();
    const rental = await loadRental(client, body.rentalId);

    if (!rental) return json({ success: false, message: 'Rental not found.' }, 404);
    if (!inScope(await resolveScope(client, context?.workspaceMemberId), rental.property?.ownerId)) {
      return json(NOT_ALLOWED, 403);
    }

    const month = monthStart(body.month);
    const rows = await rentPaymentsForMonth(client, rental.id, month);
    const waiver = rows.find((row) => row.status === 'WAIVED');
    const drafts = rows.filter((row) => row.status === 'DRAFT');
    const settlement = settleMonth(rentalRentForMonth(rental, month), rows);

    if (action === 'unwaive') {
      if (!waiver) return json({ success: false, message: 'This month isn’t waived.' }, 400);
      await client.mutation({ deleteRentPayment: { __args: { id: waiver.id }, id: true } });

      return json({ success: true, message: 'Waiver removed — the month is owed again.' });
    }
    if (waiver) return json({ success: false, message: 'This month is waived. Undo the waiver first.' }, 409);

    if (action === 'waive') {
      if (settlement.state === 'paid') return json({ success: false, message: 'This month is already paid in full.' }, 409);

      const { createRentPayment } = await client.mutation({
        createRentPayment: {
          __args: {
            data: {
              status: 'WAIVED',
              paymentType: 'RENT',
              rentalId: rental.id,
              propertyId: rental.propertyId ?? null,
              tenantId: rental.tenantId ?? null,
              ownerId: rental.property?.ownerId ?? null,
              rentPeriod: month,
              amount: money(settlement.remaining),
              notes: body.notes ?? '',
            } as never,
          },
          id: true,
        },
      });

      // The month's unused draft isn't needed any more.
      for (const draft of drafts) await client.mutation({ deleteRentPayment: { __args: { id: draft.id }, id: true } });

      return json({
        success: Boolean(createRentPayment?.id),
        paymentId: createRentPayment?.id,
        message: settlement.received > 0 ? 'The rest of the month is waived.' : 'Month waived — no rent charged.',
      });
    }

    if (settlement.state === 'paid') {
      const numbers = rows.filter((row) => row.receiptNumber).map((row) => row.receiptNumber).join(', ');

      return json(
        { success: false, message: `This month is already paid (receipt ${numbers}). Use "Correct receipt" to change it.` },
        409,
      );
    }

    let paymentId = drafts[0]?.id ?? (await createDraftRentPayment(client, rental, month, body.method));

    if (!paymentId) return json({ success: false, message: 'Could not create the payment.' }, 500);

    // Two clicks at once can each make a draft: keep the first, drop the other.
    if (!drafts.length) paymentId = await keepOneDraft(client, rental.id, month, paymentId);

    await client.mutation({
      updateRentPayment: {
        __args: {
          id: paymentId,
          data: {
            amount: money(body.amount ?? 0),
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
  description: 'Records a rent payment from the Rent Ledger (previews, issues or sends its receipt), or waives a month.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/ledger/record', httpMethod: 'POST', isAuthRequired: true },
});
