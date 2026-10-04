import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  DOCUMENT_OBJECT_ID,
  DOCUMENT_OWNER_FIELD_ID,
  OWNER_DOCUMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';
import {
  OWNER_OBJECT_ID,
} from 'src/constants/universal-identifiers-v2';

export default defineField({
  universalIdentifier: OWNER_DOCUMENTS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'documents',
  label: 'Documents',
  icon: 'IconFolder',
  relationTargetObjectMetadataUniversalIdentifier: DOCUMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: DOCUMENT_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
