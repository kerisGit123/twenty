import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  PAYMENT_TENANT_FIELD_ID,
  PERSON_RENT_PAYMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_RENT_PAYMENTS_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'rentPayments',
  label: 'Rent payments',
  icon: 'IconReceipt',
  relationTargetObjectMetadataUniversalIdentifier: PAYMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PAYMENT_TENANT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
