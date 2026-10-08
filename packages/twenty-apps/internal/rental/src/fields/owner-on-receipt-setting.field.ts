import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { RECEIPT_SETTING_OBJECT_ID } from 'src/objects/receipt-setting.object';

// The workspace these settings belong to; none = the default for every
// workspace without its own.
export default defineField({
  universalIdentifier: 'fa1f4af0-02a0-4cfc-8455-07a3b423491c',
  objectUniversalIdentifier: RECEIPT_SETTING_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'owner',
  label: 'Workspace',
  icon: 'IconBriefcase',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: OWNER_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: 'b61ce8d5-4ee2-46ac-bec5-07b6efdaf4f6',
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'ownerId' },
});
