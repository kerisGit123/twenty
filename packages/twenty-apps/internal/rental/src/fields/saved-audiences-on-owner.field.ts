import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_SAVED_AUDIENCES_FIELD_ID, SAVED_AUDIENCE_OBJECT_ID, SAVED_AUDIENCE_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-v4';

export default defineField({
  universalIdentifier: OWNER_SAVED_AUDIENCES_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'savedAudiences',
  label: 'Saved audiences',
  icon: 'IconUsersGroup',
  relationTargetObjectMetadataUniversalIdentifier: SAVED_AUDIENCE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: SAVED_AUDIENCE_OWNER_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
