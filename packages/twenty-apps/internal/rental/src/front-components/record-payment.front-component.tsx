import { defineFrontComponent } from 'twenty-sdk/define';

import { RECORD_PAYMENT_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { makeRecordActionEffect } from 'src/front-components/shared/make-record-action-effect';

const RecordPaymentEffect = makeRecordActionEffect({
  routePath: '/s/rentals/record-payment',
  emptySelectionMessage: 'Select one rental to record a payment.',
  fallbackSuccess: 'Draft payment created.',
  fallbackError: 'Could not create the payment.',
});

export default defineFrontComponent({
  universalIdentifier: RECORD_PAYMENT_FRONT_COMPONENT_ID,
  name: 'record-payment',
  description: "Creates a draft rent payment for the rental's next unpaid month",
  isHeadless: true,
  component: RecordPaymentEffect,
});
