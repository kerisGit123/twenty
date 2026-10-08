import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { DOCUMENT_TEMPLATE_OBJECT_ID } from 'src/objects/document-template.object';

export default defineField({
  universalIdentifier: '3eb56613-651e-4618-8751-ab256865ddfc',
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'documentTemplates',
  label: 'Document templates',
  icon: 'IconTemplate',
  relationTargetObjectMetadataUniversalIdentifier: DOCUMENT_TEMPLATE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: '49afceab-3ec0-4e5f-b98a-1017efdba494',
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
