import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT } from 'twenty-sdk/define';

import {
  MEMBERSHIP_MEMBER_FIELD_ID,
  MEMBERSHIP_OBJECT_ID,
  MEMBER_MEMBERSHIPS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';

// The team member of a membership.
export default defineField({
  universalIdentifier: MEMBERSHIP_MEMBER_FIELD_ID,
  objectUniversalIdentifier: MEMBERSHIP_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'member',
  label: 'Member',
  icon: 'IconUser',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: MEMBER_MEMBERSHIPS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.CASCADE,
    joinColumnName: 'memberId',
  },
});
