import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import {
  MEMBERSHIP_OBJECT_ID,
  MEMBERSHIP_OWNER_FIELD_ID,
  OWNER_MEMBERSHIPS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';

// The rental workspace of a membership.
export default defineField({
  universalIdentifier: MEMBERSHIP_OWNER_FIELD_ID,
  objectUniversalIdentifier: MEMBERSHIP_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_MEMBERSHIPS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.CASCADE,
    joinColumnName: 'ownerId',
  },
});
