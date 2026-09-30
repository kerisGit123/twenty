import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  PAYMENT_PROPERTY_FIELD_ID,
  PROPERTY_OBJECT_ID,
  PROPERTY_PAYMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PROPERTY_PAYMENTS_FIELD_ID,
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'payments',
  label: 'Payments',
  icon: 'IconReceipt',
  relationTargetObjectMetadataUniversalIdentifier: PAYMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PAYMENT_PROPERTY_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
