import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { ACTIVITY_OWNER_FIELD_ID, CONTACT_ACTIVITY_OBJECT_ID, OWNER_ACTIVITIES_FIELD_ID } from 'src/constants/universal-identifiers-v4';

export default defineField({
  universalIdentifier: OWNER_ACTIVITIES_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'whatsappLog',
  label: 'WhatsApp log',
  icon: 'IconBrandWhatsapp',
  relationTargetObjectMetadataUniversalIdentifier: CONTACT_ACTIVITY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: ACTIVITY_OWNER_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
