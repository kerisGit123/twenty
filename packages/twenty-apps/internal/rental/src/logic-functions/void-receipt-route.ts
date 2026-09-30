import { defineLogicFunction } from 'twenty-sdk/define';

import { VOID_RECEIPT_ROUTE_ID } from 'src/constants/universal-identifiers';
import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { jsonRoute } from 'src/logic-functions/utils/json-route';

export default defineLogicFunction({
  universalIdentifier: VOID_RECEIPT_ROUTE_ID,
  name: 'void-receipt-route',
  description: 'Voids an issued receipt (keeps its number, VOID-watermarked PDF).',
  timeoutSeconds: 60,
  handler: jsonRoute((paymentId, memberId) => receiptHandler('void', paymentId, memberId)),
  httpRouteTriggerSettings: { path: '/receipts/void', httpMethod: 'POST', isAuthRequired: true },
});
