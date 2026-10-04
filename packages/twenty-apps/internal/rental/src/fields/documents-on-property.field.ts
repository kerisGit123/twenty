import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  DOCUMENT_OBJECT_ID,
  DOCUMENT_PROPERTY_FIELD_ID,
  PROPERTY_DOCUMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';
import {
  PROPERTY_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PROPERTY_DOCUMENTS_FIELD_ID,
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'documents',
  label: 'Documents',
  icon: 'IconFolder',
  relationTargetObjectMetadataUniversalIdentifier: DOCUMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: DOCUMENT_PROPERTY_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
