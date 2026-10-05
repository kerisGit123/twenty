import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { CAMPAIGN_OBJECT_ID, CAMPAIGN_OWNER_FIELD_ID, OWNER_CAMPAIGNS_FIELD_ID } from 'src/constants/universal-identifiers-v4';

// The workspace the campaign belongs to (its audience comes from there).
export default defineField({
  universalIdentifier: CAMPAIGN_OWNER_FIELD_ID,
  objectUniversalIdentifier: CAMPAIGN_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_CAMPAIGNS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'ownerId',
  },
});
