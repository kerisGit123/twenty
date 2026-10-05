import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { RENTAL_OBJECT_ID } from 'src/constants/universal-identifiers';
import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_RENTALS_FIELD_ID, RENTAL_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-v3';

// The contract's workspace, copied from its property, so contracts can be
// filtered by workspace like everything else.
export default defineField({
  universalIdentifier: RENTAL_OWNER_FIELD_ID,
  objectUniversalIdentifier: RENTAL_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_RENTALS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'ownerId',
  },
});
