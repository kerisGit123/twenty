import { defineCommandMenuItem, isSelectAll } from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  PREVIEW_RECEIPT_COMMAND_ID,
  PREVIEW_RECEIPT_FRONT_COMPONENT_ID,
} from 'src/constants/universal-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: PREVIEW_RECEIPT_COMMAND_ID,
  label: 'Preview receipt',
  shortLabel: 'Preview',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: PAYMENT_OBJECT_ID,
  conditionalAvailabilityExpression: !isSelectAll,
  frontComponentUniversalIdentifier: PREVIEW_RECEIPT_FRONT_COMPONENT_ID,
});
