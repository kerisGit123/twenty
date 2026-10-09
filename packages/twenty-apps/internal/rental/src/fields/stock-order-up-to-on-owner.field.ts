import { defineField, FieldType, NumberDataType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_ORDER_UP_TO_FIELD_ID } from 'src/constants/universal-identifiers-stock';

export default defineField({
  universalIdentifier: OWNER_STOCK_ORDER_UP_TO_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.NUMBER,
  name: 'stockOrderUpToMonths',
  label: 'Stock: order enough for (months)',
  description: 'A suggested order brings the item up to this many months.',
  icon: 'IconAlarm',
  defaultValue: 2.5,
  universalSettings: { dataType: NumberDataType.FLOAT, decimals: 1 },
});
