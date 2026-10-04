import { defineCommandMenuItem, isSelectAll } from 'twenty-sdk/define';

import {
  CORRECT_RECEIPT_COMMAND_ID,
  CORRECT_RECEIPT_FRONT_COMPONENT_ID,
  PAYMENT_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: CORRECT_RECEIPT_COMMAND_ID,
  label: 'Correct receipt',
  shortLabel: 'Correct',
  isPinned: false,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: PAYMENT_OBJECT_ID,
  conditionalAvailabilityExpression: !isSelectAll,
  frontComponentUniversalIdentifier: CORRECT_RECEIPT_FRONT_COMPONENT_ID,
});
