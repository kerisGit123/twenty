import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_MOVEMENTS_FIELD_ID, STOCK_MOVEMENT_OBJECT_ID, STOCK_MOVEMENT_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-stock';

export default defineField({
  universalIdentifier: OWNER_STOCK_MOVEMENTS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'stockMovements',
  label: 'Stock movements',
  icon: 'IconArrowsDownUp',
  relationTargetObjectMetadataUniversalIdentifier: STOCK_MOVEMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: STOCK_MOVEMENT_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
