import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { STOCK_ITEM_MOVEMENTS_FIELD_ID, STOCK_ITEM_OBJECT_ID, STOCK_MOVEMENT_ITEM_FIELD_ID, STOCK_MOVEMENT_OBJECT_ID } from 'src/constants/universal-identifiers-stock';

// The item that moved.
export default defineField({
  universalIdentifier: STOCK_MOVEMENT_ITEM_FIELD_ID,
  objectUniversalIdentifier: STOCK_MOVEMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'item',
  label: 'Item',
  icon: 'IconPackage',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: STOCK_ITEM_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: STOCK_ITEM_MOVEMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'itemId',
  },
});
