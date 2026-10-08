import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { DOCUMENT_TEMPLATE_OBJECT_ID } from 'src/objects/document-template.object';

// The workspace this template belongs to; none = shared by every workspace.
export default defineField({
  universalIdentifier: '49afceab-3ec0-4e5f-b98a-1017efdba494',
  objectUniversalIdentifier: DOCUMENT_TEMPLATE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: '3eb56613-651e-4618-8751-ab256865ddfc',
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'ownerId' },
});
