import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { RENTAL_OBJECT_ID } from 'src/constants/universal-identifiers';
import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_RENTALS_FIELD_ID, RENTAL_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-v3';

export default defineField({
  universalIdentifier: OWNER_RENTALS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'rentals',
  label: 'Contracts',
  icon: 'IconKey',
  relationTargetObjectMetadataUniversalIdentifier: RENTAL_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: RENTAL_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
