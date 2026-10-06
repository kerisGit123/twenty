import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_SAVED_AUDIENCES_FIELD_ID, SAVED_AUDIENCE_OBJECT_ID, SAVED_AUDIENCE_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-v4';

export default defineField({
  universalIdentifier: SAVED_AUDIENCE_OWNER_FIELD_ID,
  objectUniversalIdentifier: SAVED_AUDIENCE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_SAVED_AUDIENCES_FIELD_ID,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'ownerId' },
});
