import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  PERSON_RENTED_PROPERTIES_FIELD_ID,
  PROPERTY_OBJECT_ID,
  PROPERTY_TENANT_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_RENTED_PROPERTIES_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'rentedProperties',
  label: 'Rented properties',
  icon: 'IconHome',
  relationTargetObjectMetadataUniversalIdentifier: PROPERTY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PROPERTY_TENANT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
