import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import {
  OWNER_OBJECT_ID,
  OWNER_PROPERTIES_FIELD_ID,
  PROPERTY_OWNER_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  PROPERTY_OBJECT_ID,
} from 'src/constants/universal-identifiers';

// Who owns the property. Its rent income rolls up to this owner.
export default defineField({
  universalIdentifier: PROPERTY_OWNER_FIELD_ID,
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: OWNER_PROPERTIES_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'ownerId',
  },
});
