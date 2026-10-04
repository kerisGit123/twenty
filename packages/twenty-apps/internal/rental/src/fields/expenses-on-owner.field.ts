import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  EXPENSE_OBJECT_ID,
  EXPENSE_OWNER_FIELD_ID,
  OWNER_EXPENSES_FIELD_ID,
  OWNER_OBJECT_ID,
} from 'src/constants/universal-identifiers-v2';

export default defineField({
  universalIdentifier: OWNER_EXPENSES_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'expenses',
  label: 'Expenses',
  icon: 'IconCashOff',
  relationTargetObjectMetadataUniversalIdentifier: EXPENSE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: EXPENSE_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
