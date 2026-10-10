import { defineField, FieldType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_LOCKED_THROUGH_FIELD_ID } from 'src/constants/universal-identifiers-stock';

// Month end: no stock IN/OUT can be added, changed or removed on or before
// this date (the last day of the latest closed month).
export default defineField({
  universalIdentifier: OWNER_STOCK_LOCKED_THROUGH_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.DATE,
  name: 'stockLockedThrough',
  label: 'Stock: closed up to',
  description: 'Set by "Close month" on the Stock page; stock movements on or before this date are locked.',
  icon: 'IconLock',
  isNullable: true,
});
