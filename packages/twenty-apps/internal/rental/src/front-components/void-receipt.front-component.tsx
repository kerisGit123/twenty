import { defineFrontComponent } from 'twenty-sdk/define';

import { VOID_RECEIPT_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { makeRecordActionEffect } from 'src/front-components/shared/make-record-action-effect';

const VoidReceiptEffect = makeRecordActionEffect({
  routePath: '/s/receipts/void',
  emptySelectionMessage: 'Select one payment to void its receipt.',
  fallbackSuccess: 'Receipt voided.',
  fallbackError: 'Could not void the receipt.',
});

export default defineFrontComponent({
  universalIdentifier: VOID_RECEIPT_FRONT_COMPONENT_ID,
  name: 'void-receipt',
  description: 'Marks an issued receipt as void (it keeps its number)',
  isHeadless: true,
  component: VoidReceiptEffect,
});
