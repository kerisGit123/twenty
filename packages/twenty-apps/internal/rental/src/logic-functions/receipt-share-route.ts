import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { RECEIPT_SHARE_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { pdfPageResponse } from 'src/logic-functions/utils/pdf-page';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';
import { toE164 } from 'src/shared/whatsapp-link';

// GET /s/receipts/share?payment=<id>: an issued receipt's PDF with buttons to
// send it to the tenant from your own WhatsApp (Share on a phone attaches the
// PDF; on a PC, download it and attach it in the WhatsApp chat).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const html = (body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">${body}</body>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const paymentId = event.queryStringParameters?.payment;

  if (!paymentId) return html('<p>Pick a payment.</p>', 400);

  try {
    const client = appClient();
    const { rentPayments } = await client.query({
      rentPayments: {
        __args: { filter: { id: { eq: paymentId } }, first: 1 },
        edges: {
          node: {
            id: true,
            ownerId: true,
            status: true,
            receiptNumber: true,
            rentPeriod: true,
            paymentType: true,
            amount: { amountMicros: true },
            receiptFile: { url: true },
            tenant: { name: { firstName: true, lastName: true }, phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true } },
            property: { name: true },
          },
        },
      },
    });
    const payment = rentPayments?.edges?.[0]?.node;

    if (!payment) return html('<p>Payment not found.</p>', 404);
    if (!inScope(await resolveScope(client, context?.workspaceMemberId), payment.ownerId)) {
      return html("<p>You don't have access to this payment.</p>", 403);
    }

    const file = (payment.receiptFile as unknown as Array<{ url?: string | null }> | null)?.[0]?.url;

    if (!file || !payment.receiptNumber) return html('<p>This payment has no issued receipt yet. Save the receipt first.</p>', 400);

    const response = await fetch(file);

    if (!response.ok) return html('<p>Could not load the receipt PDF.</p>', 502);

    const pdf = new Uint8Array(await response.arrayBuffer());
    const firstName = payment.tenant?.name?.firstName?.trim() || 'there';
    const amount = ((payment.amount?.amountMicros ?? 0) / 1_000_000).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const period = payment.rentPeriod ? ` for ${MONTHS[Number(payment.rentPeriod.slice(5, 7)) - 1]} ${payment.rentPeriod.slice(0, 4)}` : '';
    const what = payment.paymentType === 'RENT' ? `rent${period}` : 'deposit';
    const text = `Hi ${firstName}, here is your receipt ${payment.receiptNumber} for the ${what} at ${payment.property?.name ?? 'the property'} (RM ${amount}). Thank you!`;

    return pdfPageResponse(pdf, `${payment.receiptNumber}.pdf`, `Receipt ${payment.receiptNumber}`, {
      text,
      whatsappTo: toE164(payment.tenant?.phones as never),
    });
  } catch (error) {
    console.error('[rental] receipt share failed:', error);

    return html('<p>Could not open the receipt.</p>', 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: RECEIPT_SHARE_ROUTE_FUNCTION_ID,
  name: 'receipt-share-route',
  description: 'An issued receipt PDF with buttons to send it to the tenant on WhatsApp.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/receipts/share', httpMethod: 'GET', isAuthRequired: true },
});
