import { defineFrontComponent } from 'twenty-sdk/define';

import { makeRecordActionEffect } from 'src/front-components/shared/make-record-action-effect';

export const REGENERATE_RECEIPT_FRONT_COMPONENT_ID = 'f3688a12-25fa-4da1-ad99-ab238ba48de4';

const RegenerateReceiptEffect = makeRecordActionEffect({
  routePath: '/s/receipts/regenerate',
  emptySelectionMessage: 'Select one payment to regenerate its receipt.',
  fallbackSuccess: 'Receipt PDF updated.',
  fallbackError: 'Could not regenerate the receipt.',
});

export default defineFrontComponent({
  universalIdentifier: REGENERATE_RECEIPT_FRONT_COMPONENT_ID,
  name: 'regenerate-receipt',
  description: "Rebuilds the payment's receipt PDF from its current details",
  isHeadless: true,
  component: RegenerateReceiptEffect,
});
