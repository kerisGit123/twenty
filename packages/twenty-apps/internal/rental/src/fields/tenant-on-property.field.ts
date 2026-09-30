import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  PERSON_RENTED_PROPERTIES_FIELD_ID,
  PROPERTY_OBJECT_ID,
  PROPERTY_TENANT_FIELD_ID,
} from 'src/constants/universal-identifiers';

// Current tenant of the property (a Person).
export default defineField({
  universalIdentifier: PROPERTY_TENANT_FIELD_ID,
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'tenant',
  label: 'Tenant',
  icon: 'IconUser',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    PERSON_RENTED_PROPERTIES_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'tenantId',
  },
});
