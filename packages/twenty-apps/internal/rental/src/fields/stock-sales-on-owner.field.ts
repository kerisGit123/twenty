import { defineField, FieldType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_SALES_FIELD_ID } from 'src/constants/universal-identifiers-stock';

// The shop's sales per month in RM ({ "2026-10": 60000 }), typed on Stock → Month end →
// Usage vs sales, so stock used can be shown per RM 1,000 of sales.
export default defineField({
  universalIdentifier: OWNER_STOCK_SALES_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RAW_JSON,
  name: 'stockMonthlySales',
  label: 'Stock: monthly sales (RM)',
  description: 'Sales per month, for stock usage per RM 1,000 of sales.',
  icon: 'IconCash',
});
