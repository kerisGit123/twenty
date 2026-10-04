import { defineFrontComponent } from 'twenty-sdk/define';

import { CORRECT_RECEIPT_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { makeRecordActionEffect } from 'src/front-components/shared/make-record-action-effect';

const CorrectReceiptEffect = makeRecordActionEffect({
  routePath: '/s/receipts/correct',
  emptySelectionMessage: 'Select one payment to correct its receipt.',
  fallbackSuccess: 'Receipt voided and a draft copy created.',
  fallbackError: 'Could not correct the receipt.',
});

export default defineFrontComponent({
  universalIdentifier: CORRECT_RECEIPT_FRONT_COMPONENT_ID,
  name: 'correct-receipt',
  description: 'Voids the issued receipt and creates a draft copy to fix and resend',
  isHeadless: true,
  component: CorrectReceiptEffect,
});
