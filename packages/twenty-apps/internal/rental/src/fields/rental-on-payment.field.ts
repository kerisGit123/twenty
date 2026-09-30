import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  PAYMENT_RENTAL_FIELD_ID,
  RENTAL_OBJECT_ID,
  RENTAL_PAYMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PAYMENT_RENTAL_FIELD_ID,
  objectUniversalIdentifier: PAYMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'rental',
  label: 'Rental',
  icon: 'IconKey',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: RENTAL_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: RENTAL_PAYMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'rentalId',
  },
});
