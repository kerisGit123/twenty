import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  OWNER_OBJECT_ID,
  OWNER_PAYMENTS_FIELD_ID,
  PAYMENT_OWNER_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  PAYMENT_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: OWNER_PAYMENTS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'payments',
  label: 'Income (payments)',
  icon: 'IconReceipt',
  relationTargetObjectMetadataUniversalIdentifier: PAYMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PAYMENT_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
