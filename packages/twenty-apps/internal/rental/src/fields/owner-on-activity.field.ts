import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { ACTIVITY_OWNER_FIELD_ID, CONTACT_ACTIVITY_OBJECT_ID, OWNER_ACTIVITIES_FIELD_ID } from 'src/constants/universal-identifiers-v4';

export default defineField({
  universalIdentifier: ACTIVITY_OWNER_FIELD_ID,
  objectUniversalIdentifier: CONTACT_ACTIVITY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_ACTIVITIES_FIELD_ID,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'ownerId' },
});
