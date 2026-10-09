import { defineField, FieldType, NumberDataType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_REORDER_BELOW_FIELD_ID } from 'src/constants/universal-identifiers-stock';

export default defineField({
  universalIdentifier: OWNER_STOCK_REORDER_BELOW_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.NUMBER,
  name: 'stockReorderBelowMonths',
  label: 'Stock: re-order below (months)',
  description: 'Flag a stock item when what is left lasts less than this.',
  icon: 'IconAlarm',
  defaultValue: 1.5,
  universalSettings: { dataType: NumberDataType.FLOAT, decimals: 1 },
});
