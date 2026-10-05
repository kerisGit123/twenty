import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import {
  DOCUMENT_OBJECT_ID,
  DOCUMENT_OWNER_FIELD_ID,
  OWNER_DOCUMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';
import {
  OWNER_OBJECT_ID,
} from 'src/constants/universal-identifiers-v2';

// Optional: whose document it is (Family, Company A...).
export default defineField({
  universalIdentifier: DOCUMENT_OWNER_FIELD_ID,
  objectUniversalIdentifier: DOCUMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_DOCUMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'ownerId',
  },
});
