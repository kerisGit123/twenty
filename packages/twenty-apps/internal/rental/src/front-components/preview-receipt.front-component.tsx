import { defineFrontComponent } from 'twenty-sdk/define';

import { PREVIEW_RECEIPT_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { makeRecordActionEffect } from 'src/front-components/shared/make-record-action-effect';

const PreviewReceiptEffect = makeRecordActionEffect({
  routePath: '/s/receipts/preview',
  emptySelectionMessage: 'Select one payment to preview its receipt.',
  fallbackSuccess: 'Preview ready.',
  fallbackError: 'Could not create the preview.',
});

export default defineFrontComponent({
  universalIdentifier: PREVIEW_RECEIPT_FRONT_COMPONENT_ID,
  name: 'preview-receipt',
  description: 'Creates a DRAFT-watermarked receipt PDF without using a receipt number',
  isHeadless: true,
  component: PreviewReceiptEffect,
});
