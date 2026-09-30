import { defineLogicFunction } from 'twenty-sdk/define';

import { PREVIEW_RECEIPT_ROUTE_ID } from 'src/constants/universal-identifiers';
import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';
import { jsonRoute } from 'src/logic-functions/utils/json-route';

export default defineLogicFunction({
  universalIdentifier: PREVIEW_RECEIPT_ROUTE_ID,
  name: 'preview-receipt-route',
  description: 'Creates a DRAFT-watermarked receipt PDF without assigning a number.',
  timeoutSeconds: 60,
  handler: jsonRoute((paymentId, memberId) => receiptHandler('preview', paymentId, memberId)),
  httpRouteTriggerSettings: { path: '/receipts/preview', httpMethod: 'POST', isAuthRequired: true },
});
