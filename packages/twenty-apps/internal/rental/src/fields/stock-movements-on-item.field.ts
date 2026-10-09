import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { STOCK_ITEM_MOVEMENTS_FIELD_ID, STOCK_ITEM_OBJECT_ID, STOCK_MOVEMENT_ITEM_FIELD_ID, STOCK_MOVEMENT_OBJECT_ID } from 'src/constants/universal-identifiers-stock';

export default defineField({
  universalIdentifier: STOCK_ITEM_MOVEMENTS_FIELD_ID,
  objectUniversalIdentifier: STOCK_ITEM_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'movements',
  label: 'Movements',
  icon: 'IconArrowsDownUp',
  relationTargetObjectMetadataUniversalIdentifier: STOCK_MOVEMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: STOCK_MOVEMENT_ITEM_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
