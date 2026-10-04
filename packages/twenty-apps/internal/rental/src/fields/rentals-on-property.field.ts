import {
  defineField,
  FieldType,
  RelationType,
} from 'twenty-sdk/define';

import {
  PROPERTY_OBJECT_ID,
  PROPERTY_RENTALS_FIELD_ID,
  RENTAL_OBJECT_ID,
  RENTAL_PROPERTY_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PROPERTY_RENTALS_FIELD_ID,
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'rentals',
  label: 'Contracts',
  icon: 'IconKey',
  relationTargetObjectMetadataUniversalIdentifier: RENTAL_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: RENTAL_PROPERTY_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
