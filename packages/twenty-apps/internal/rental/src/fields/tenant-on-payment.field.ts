import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  PAYMENT_TENANT_FIELD_ID,
  PERSON_RENT_PAYMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers';

// Who paid. SET_NULL so deleting a tenant never deletes payment history.
export default defineField({
  universalIdentifier: PAYMENT_TENANT_FIELD_ID,
  objectUniversalIdentifier: PAYMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'tenant',
  label: 'Tenant',
  icon: 'IconUser',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: PERSON_RENT_PAYMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'tenantId',
  },
});
