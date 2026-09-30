import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  PAYMENT_PROPERTY_FIELD_ID,
  PROPERTY_OBJECT_ID,
  PROPERTY_PAYMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers';

// Which property the payment is for. SET_NULL keeps payment history intact.
export default defineField({
  universalIdentifier: PAYMENT_PROPERTY_FIELD_ID,
  objectUniversalIdentifier: PAYMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'property',
  label: 'Property',
  icon: 'IconHome',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: PROPERTY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PROPERTY_PAYMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'propertyId',
  },
});
