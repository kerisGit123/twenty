import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  DOCUMENT_OBJECT_ID,
  DOCUMENT_TENANT_FIELD_ID,
  PERSON_DOCUMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineField({
  universalIdentifier: PERSON_DOCUMENTS_FIELD_ID,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'documents',
  label: 'Documents',
  icon: 'IconFolder',
  relationTargetObjectMetadataUniversalIdentifier: DOCUMENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: DOCUMENT_TENANT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
