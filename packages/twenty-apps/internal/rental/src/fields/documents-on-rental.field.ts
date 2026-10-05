import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { RENTAL_OBJECT_ID } from 'src/constants/universal-identifiers';
import {
  DOCUMENT_OBJECT_ID,
  DOCUMENT_RENTAL_FIELD_ID,
  RENTAL_DOCUMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineField({
  universalIdentifier: RENTAL_DOCUMENTS_FIELD_ID,
  objectUniversalIdentifier: RENTAL_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'documents',
  label: 'Documents',
  icon: 'IconFolder',
  relationTargetObjectMetadataUniversalIdentifier: DOCUMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: DOCUMENT_RENTAL_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
