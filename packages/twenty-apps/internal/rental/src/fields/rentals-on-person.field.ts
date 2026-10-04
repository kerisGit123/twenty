import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  PERSON_RENTALS_FIELD_ID,
  RENTAL_OBJECT_ID,
  RENTAL_TENANT_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_RENTALS_FIELD_ID,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'rentals',
  label: 'Contracts',
  icon: 'IconKey',
  relationTargetObjectMetadataUniversalIdentifier: RENTAL_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: RENTAL_TENANT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
