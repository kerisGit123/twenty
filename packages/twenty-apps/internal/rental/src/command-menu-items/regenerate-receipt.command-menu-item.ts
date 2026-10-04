import { defineCommandMenuItem, isSelectAll } from 'twenty-sdk/define';

import { PAYMENT_OBJECT_ID } from 'src/constants/universal-identifiers';
import { REGENERATE_RECEIPT_FRONT_COMPONENT_ID } from 'src/front-components/regenerate-receipt.front-component';

export default defineCommandMenuItem({
  universalIdentifier: 'f42edb5f-a837-400a-a590-dbf70d07cb4f',
  label: 'Regenerate receipt PDF',
  shortLabel: 'Regenerate',
  isPinned: false,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: PAYMENT_OBJECT_ID,
  conditionalAvailabilityExpression: !isSelectAll,
  frontComponentUniversalIdentifier: REGENERATE_RECEIPT_FRONT_COMPONENT_ID,
});
