import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { INCOME_OBJECT_ID, INCOME_OWNER_FIELD_ID, OWNER_INCOMES_FIELD_ID } from 'src/constants/universal-identifiers-v3';

export default defineField({
  universalIdentifier: OWNER_INCOMES_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'incomes',
  label: 'Income',
  icon: 'IconCashPlus',
  relationTargetObjectMetadataUniversalIdentifier: INCOME_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: INCOME_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
