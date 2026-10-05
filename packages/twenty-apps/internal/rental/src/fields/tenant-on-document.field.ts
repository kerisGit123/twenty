import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  DOCUMENT_OBJECT_ID,
  DOCUMENT_TENANT_FIELD_ID,
  PERSON_DOCUMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';

// Optional: the person the document is about (e.g. a tenant's IC copy).
export default defineField({
  universalIdentifier: DOCUMENT_TENANT_FIELD_ID,
  objectUniversalIdentifier: DOCUMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'person',
  label: 'Person',
  icon: 'IconUser',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: PERSON_DOCUMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'personId',
  },
});
