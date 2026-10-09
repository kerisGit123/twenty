import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { PROPERTY_OBJECT_ID } from 'src/constants/universal-identifiers';
import { INCOME_OBJECT_ID, INCOME_PROPERTY_FIELD_ID, PROPERTY_INCOMES_FIELD_ID } from 'src/constants/universal-identifiers-v3';

// Optional: the property the income is for.
export default defineField({
  universalIdentifier: INCOME_PROPERTY_FIELD_ID,
  objectUniversalIdentifier: INCOME_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'property',
  label: 'Property',
  icon: 'IconHome',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: PROPERTY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PROPERTY_INCOMES_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'propertyId',
  },
});
