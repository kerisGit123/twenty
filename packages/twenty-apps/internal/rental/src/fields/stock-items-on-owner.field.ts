import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_ITEMS_FIELD_ID, STOCK_ITEM_OBJECT_ID, STOCK_ITEM_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-stock';

export default defineField({
  universalIdentifier: OWNER_STOCK_ITEMS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'stockItems',
  label: 'Stock items',
  icon: 'IconPackage',
  relationTargetObjectMetadataUniversalIdentifier: STOCK_ITEM_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: STOCK_ITEM_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
