import { defineLogicFunction } from 'twenty-sdk/define';

import { SEND_RECEIPT_ROUTE_ID } from 'src/constants/universal-identifiers';
import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { jsonRoute } from 'src/logic-functions/utils/json-route';

export default defineLogicFunction({
  universalIdentifier: SEND_RECEIPT_ROUTE_ID,
  name: 'send-receipt-route',
  description: 'Issues the receipt (number + final PDF) and emails it to the tenant.',
  timeoutSeconds: 60,
  handler: jsonRoute((paymentId, memberId) => receiptHandler('send', paymentId, memberId)),
  httpRouteTriggerSettings: { path: '/receipts/send', httpMethod: 'POST', isAuthRequired: true },
});
