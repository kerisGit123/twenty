import { defineLogicFunction } from 'twenty-sdk/define';

import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { jsonRoute } from 'src/logic-functions/utils/json-route';

// Returns a payment's receipt content (exactly what the PDF shows) so the
// Rent Ledger can draw it on screen. Creates nothing.
export default defineLogicFunction({
  universalIdentifier: '7e98da40-c11f-420d-861d-5c2c5a07f848',
  name: 'view-receipt-route',
  description: "Returns a payment's receipt content for on-screen viewing.",
  timeoutSeconds: 30,
  handler: jsonRoute((paymentId, memberId) => receiptHandler('view', paymentId, memberId)),
  httpRouteTriggerSettings: { path: '/receipts/view', httpMethod: 'POST', isAuthRequired: true },
});
