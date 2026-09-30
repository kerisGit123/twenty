import { defineCommandMenuItem, isSelectAll } from 'twenty-sdk/define';

import {
  RECORD_PAYMENT_COMMAND_ID,
  RECORD_PAYMENT_FRONT_COMPONENT_ID,
  RENTAL_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: RECORD_PAYMENT_COMMAND_ID,
  label: 'Record payment',
  shortLabel: 'Record payment',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: RENTAL_OBJECT_ID,
  conditionalAvailabilityExpression: !isSelectAll,
  frontComponentUniversalIdentifier: RECORD_PAYMENT_FRONT_COMPONENT_ID,
});
