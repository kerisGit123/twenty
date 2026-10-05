import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { RENTAL_OBJECT_ID } from 'src/constants/universal-identifiers';
import {
  DOCUMENT_OBJECT_ID,
  DOCUMENT_RENTAL_FIELD_ID,
  RENTAL_DOCUMENTS_FIELD_ID,
} from 'src/constants/universal-identifiers-v3';

// Optional: the contract the document belongs to (agreement, stamp
// certificate, inventory, move-in photos...).
export default defineField({
  universalIdentifier: DOCUMENT_RENTAL_FIELD_ID,
  objectUniversalIdentifier: DOCUMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'rental',
  label: 'Contract',
  icon: 'IconKey',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: RENTAL_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: RENTAL_DOCUMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'rentalId',
  },
});
