import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  PERSON_RENTALS_FIELD_ID,
  RENTAL_OBJECT_ID,
  RENTAL_TENANT_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RENTAL_TENANT_FIELD_ID,
  objectUniversalIdentifier: RENTAL_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'tenant',
  label: 'Tenant',
  icon: 'IconUser',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: PERSON_RENTALS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'tenantId',
  },
});
