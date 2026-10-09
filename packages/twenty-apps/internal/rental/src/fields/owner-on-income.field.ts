import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { INCOME_OBJECT_ID, INCOME_OWNER_FIELD_ID, OWNER_INCOMES_FIELD_ID } from 'src/constants/universal-identifiers-v3';

// Whose books the income goes in (from the property when one is picked).
export default defineField({
  universalIdentifier: INCOME_OWNER_FIELD_ID,
  objectUniversalIdentifier: INCOME_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_INCOMES_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'ownerId',
  },
});
