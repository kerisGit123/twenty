import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_ITEMS_FIELD_ID, STOCK_ITEM_OBJECT_ID, STOCK_ITEM_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-stock';

// Whose stock the item is.
export default defineField({
  universalIdentifier: STOCK_ITEM_OWNER_FIELD_ID,
  objectUniversalIdentifier: STOCK_ITEM_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_STOCK_ITEMS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'ownerId',
  },
});
