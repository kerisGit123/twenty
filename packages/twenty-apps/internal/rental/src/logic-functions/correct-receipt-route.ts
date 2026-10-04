import { defineLogicFunction } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { CORRECT_RECEIPT_ROUTE_ID } from 'src/constants/universal-identifiers';
import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { jsonRoute } from 'src/logic-functions/utils/json-route';

// Issued receipts aren't edited in place: the old one is voided (it keeps
// its number) and an editable Draft copy is created to fix and send.
const correctReceipt = async (paymentId: string, memberId?: string) => {
  if (!paymentId) return { success: false, status: 400, message: 'No payment selected.' };

  const client = new CoreApiClient();
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: { filter: { id: { eq: paymentId } }, first: 1 },
      edges: {
        node: {
          id: true,
          status: true,
          receiptNumber: true,
          paymentType: true,
          amount: { amountMicros: true, currencyCode: true },
          paidOn: true,
          rentPeriod: true,
          method: true,
          notes: true,
          rentalId: true,
          propertyId: true,
          tenantId: true,
        },
      },
    },
  });
  const payment = rentPayments?.edges?.[0]?.node;

  if (!payment?.id) return { success: false, status: 404, message: 'Payment not found.' };
  if (payment.status !== 'ISSUED' && payment.status !== 'SENT') {
    return {
      success: false,
      status: 400,
      message:
        payment.status === 'VOID'
          ? 'This receipt is already void.'
          : 'This is still a draft. Edit it directly, then send the receipt.',
    };
  }

  const { createRentPayment } = await client.mutation({
    createRentPayment: {
      __args: {
        data: {
          status: 'DRAFT',
          paymentType: payment.paymentType,
          amount: {
            amountMicros: payment.amount?.amountMicros ?? null,
            currencyCode: payment.amount?.currencyCode || 'MYR',
          },
          paidOn: payment.paidOn,
          rentPeriod: payment.rentPeriod,
          method: payment.method,
          notes: payment.notes
            ? `${payment.notes} (corrects ${payment.receiptNumber})`
            : `Corrects ${payment.receiptNumber}`,
          rentalId: payment.rentalId,
          propertyId: payment.propertyId,
          tenantId: payment.tenantId,
        },
      },
      id: true,
    },
  });

  const voided = await receiptHandler('void', payment.id, memberId);

  if (!voided.success) return voided;

  return {
    success: true,
    draftPaymentId: createRentPayment?.id,
    message: `${payment.receiptNumber} is void. A draft copy is ready in Payments: fix it, then send the new receipt.`,
  };
};

export default defineLogicFunction({
  universalIdentifier: CORRECT_RECEIPT_ROUTE_ID,
  name: 'correct-receipt-route',
  description: 'Voids an issued receipt and creates an editable draft copy to fix and resend.',
  timeoutSeconds: 60,
  handler: jsonRoute(correctReceipt),
  httpRouteTriggerSettings: { path: '/receipts/correct', httpMethod: 'POST', isAuthRequired: true },
});
