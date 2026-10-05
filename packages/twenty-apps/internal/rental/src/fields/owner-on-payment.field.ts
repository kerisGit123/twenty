import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import {
  OWNER_OBJECT_ID,
  OWNER_PAYMENTS_FIELD_ID,
  PAYMENT_OWNER_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  PAYMENT_OBJECT_ID,
} from 'src/constants/universal-identifiers';

// Filled from the property's owner, for per-owner income reports.
export default defineField({
  universalIdentifier: PAYMENT_OWNER_FIELD_ID,
  objectUniversalIdentifier: PAYMENT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_PAYMENTS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'ownerId',
  },
});
