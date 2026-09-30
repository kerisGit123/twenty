import { defineCommandMenuItem, isSelectAll } from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  VOID_RECEIPT_COMMAND_ID,
  VOID_RECEIPT_FRONT_COMPONENT_ID,
} from 'src/constants/universal-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: VOID_RECEIPT_COMMAND_ID,
  label: 'Void receipt',
  shortLabel: 'Void',
  isPinned: false,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: PAYMENT_OBJECT_ID,
  conditionalAvailabilityExpression: !isSelectAll,
  frontComponentUniversalIdentifier: VOID_RECEIPT_FRONT_COMPONENT_ID,
});
