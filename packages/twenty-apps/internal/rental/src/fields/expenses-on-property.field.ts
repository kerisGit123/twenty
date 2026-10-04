import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  EXPENSE_OBJECT_ID,
  EXPENSE_PROPERTY_FIELD_ID,
  PROPERTY_EXPENSES_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  PROPERTY_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PROPERTY_EXPENSES_FIELD_ID,
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'expenses',
  label: 'Expenses',
  icon: 'IconCashOff',
  relationTargetObjectMetadataUniversalIdentifier: EXPENSE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: EXPENSE_PROPERTY_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
