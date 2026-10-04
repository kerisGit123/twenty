import { defineLogicFunction } from 'twenty-sdk/define';

import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { jsonRoute } from 'src/logic-functions/utils/json-route';

export const REGENERATE_RECEIPT_ROUTE_ID = 'f49b2dc8-6098-4c9f-bf73-fd5e9c05991e';

export default defineLogicFunction({
  universalIdentifier: REGENERATE_RECEIPT_ROUTE_ID,
  name: 'regenerate-receipt-route',
  description: "Rebuilds the payment's receipt PDF from its current details without sending it.",
  timeoutSeconds: 60,
  handler: jsonRoute((paymentId, memberId) => receiptHandler('regenerate', paymentId, memberId)),
  httpRouteTriggerSettings: { path: '/receipts/regenerate', httpMethod: 'POST', isAuthRequired: true },
});
