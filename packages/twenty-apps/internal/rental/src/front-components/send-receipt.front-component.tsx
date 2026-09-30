import { defineFrontComponent } from 'twenty-sdk/define';

import { SEND_RECEIPT_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { makeRecordActionEffect } from 'src/front-components/shared/make-record-action-effect';

const SendReceiptEffect = makeRecordActionEffect({
  routePath: '/s/receipts/send',
  emptySelectionMessage: 'Select one payment to send its receipt.',
  fallbackSuccess: 'Receipt sent.',
  fallbackError: 'Could not send the receipt.',
});

export default defineFrontComponent({
  universalIdentifier: SEND_RECEIPT_FRONT_COMPONENT_ID,
  name: 'send-receipt',
  description: 'Issues the receipt for the selected payment and emails it to the tenant',
  isHeadless: true,
  component: SendReceiptEffect,
});
