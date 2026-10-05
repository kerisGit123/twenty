import { defineField, FieldType, RelationType, STANDARD_OBJECT } from 'twenty-sdk/define';

import {
  MEMBERSHIP_MEMBER_FIELD_ID,
  MEMBERSHIP_OBJECT_ID,
  MEMBER_MEMBERSHIPS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';

// A team member's rental workspace memberships. Kept a plain relation: a
// junction here makes Twenty's member queries reach tables the API can't read.
export default defineField({
  universalIdentifier: MEMBER_MEMBERSHIPS_FIELD_ID,
  objectUniversalIdentifier: STANDARD_OBJECT.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'rentalMemberships',
  label: 'Rental workspaces',
  icon: 'IconBriefcase',
  relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIP_MEMBER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
