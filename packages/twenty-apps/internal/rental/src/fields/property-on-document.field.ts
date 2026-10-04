import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import {
  DOCUMENT_OBJECT_ID,
  DOCUMENT_PROPERTY_FIELD_ID,
  PROPERTY_DOCUMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';
import {
  PROPERTY_OBJECT_ID,
} from 'src/constants/universal-identifiers';

// Optional: the property the document is about.
export default defineField({
  universalIdentifier: DOCUMENT_PROPERTY_FIELD_ID,
  objectUniversalIdentifier: DOCUMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'property',
  label: 'Property',
  icon: 'IconHome',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: PROPERTY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PROPERTY_DOCUMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'propertyId',
  },
});
