import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { RECEIPT_SETTING_OBJECT_ID } from 'src/objects/receipt-setting.object';

export default defineField({
  universalIdentifier: 'b61ce8d5-4ee2-46ac-bec5-07b6efdaf4f6',
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'receiptSettings',
  label: 'Receipt settings',
  icon: 'IconReceipt',
  relationTargetObjectMetadataUniversalIdentifier: RECEIPT_SETTING_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: 'fa1f4af0-02a0-4cfc-8455-07a3b423491c',
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
