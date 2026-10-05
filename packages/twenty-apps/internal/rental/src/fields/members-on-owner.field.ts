import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import {
  MEMBERSHIP_OBJECT_ID,
  MEMBERSHIP_OWNER_FIELD_ID,
  OWNER_MEMBERSHIPS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';

// A workspace's memberships; managed from the workspace's Members tab.
export default defineField({
  universalIdentifier: OWNER_MEMBERSHIPS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'memberships',
  label: 'Members',
  icon: 'IconUsers',
  relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIP_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
