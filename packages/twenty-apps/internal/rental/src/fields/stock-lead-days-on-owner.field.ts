import { defineField, FieldType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_LEAD_DAYS_FIELD_ID } from 'src/constants/universal-identifiers-stock';

// How long an order takes to arrive: items are flagged that much earlier.
export default defineField({
  universalIdentifier: OWNER_STOCK_LEAD_DAYS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.NUMBER,
  name: 'stockLeadDays',
  label: 'Stock: delivery takes (days)',
  description: 'Days between ordering and the goods arriving.',
  icon: 'IconTruckDelivery',
  defaultValue: 0,
});
