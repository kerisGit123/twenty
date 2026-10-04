import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  OWNER_OBJECT_ID,
  OWNER_PROPERTIES_FIELD_ID,
  PROPERTY_OWNER_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  PROPERTY_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: OWNER_PROPERTIES_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'properties',
  label: 'Properties',
  icon: 'IconHome',
  relationTargetObjectMetadataUniversalIdentifier: PROPERTY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PROPERTY_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
