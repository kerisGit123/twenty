import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import {
  EXPENSE_OBJECT_ID,
  EXPENSE_OWNER_FIELD_ID,
  OWNER_EXPENSES_FIELD_ID,
  OWNER_OBJECT_ID,
} from 'src/constants/universal-identifiers-v2';

// Whose books the expense goes in. Filled from the property's owner when empty.
export default defineField({
  universalIdentifier: EXPENSE_OWNER_FIELD_ID,
  objectUniversalIdentifier: EXPENSE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Owner',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_EXPENSES_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'ownerId',
  },
});
