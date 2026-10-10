import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_ORDERS_FIELD_ID, STOCK_ORDER_OBJECT_ID, STOCK_ORDER_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-stock';

export default defineField({
  universalIdentifier: OWNER_STOCK_ORDERS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'stockOrders',
  label: 'Stock orders',
  icon: 'IconShoppingCart',
  relationTargetObjectMetadataUniversalIdentifier: STOCK_ORDER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: STOCK_ORDER_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
