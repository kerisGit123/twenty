import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import {
  EXPENSE_OBJECT_ID,
  EXPENSE_PROPERTY_FIELD_ID,
  PROPERTY_EXPENSES_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  PROPERTY_OBJECT_ID,
} from 'src/constants/universal-identifiers';

// Optional: the property the expense is for.
export default defineField({
  universalIdentifier: EXPENSE_PROPERTY_FIELD_ID,
  objectUniversalIdentifier: EXPENSE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'property',
  label: 'Property',
  icon: 'IconHome',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: PROPERTY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PROPERTY_EXPENSES_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'propertyId',
  },
});
