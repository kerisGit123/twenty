import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { PROPERTY_OBJECT_ID } from 'src/constants/universal-identifiers';
import { INCOME_OBJECT_ID, INCOME_PROPERTY_FIELD_ID, PROPERTY_INCOMES_FIELD_ID } from 'src/constants/universal-identifiers-v3';

export default defineField({
  universalIdentifier: PROPERTY_INCOMES_FIELD_ID,
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'incomes',
  label: 'Income',
  icon: 'IconCashPlus',
  relationTargetObjectMetadataUniversalIdentifier: INCOME_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: INCOME_PROPERTY_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
