import { defineCommandMenuItem, isSelectAll } from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  SEND_RECEIPT_COMMAND_ID,
  SEND_RECEIPT_FRONT_COMPONENT_ID,
} from 'src/constants/universal-identifiers';

// "Send receipt" on a single selected payment (record page or table row).
export default defineCommandMenuItem({
  universalIdentifier: SEND_RECEIPT_COMMAND_ID,
  label: 'Send receipt',
  shortLabel: 'Send receipt',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: PAYMENT_OBJECT_ID,
  conditionalAvailabilityExpression: !isSelectAll,
  frontComponentUniversalIdentifier: SEND_RECEIPT_FRONT_COMPONENT_ID,
});
