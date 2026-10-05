import { defineField, FieldType, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { ACTIVITY_PERSON_FIELD_ID, CONTACT_ACTIVITY_OBJECT_ID, PERSON_ACTIVITIES_FIELD_ID } from 'src/constants/universal-identifiers-v4';

export default defineField({
  universalIdentifier: PERSON_ACTIVITIES_FIELD_ID,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'whatsappLog',
  label: 'WhatsApp log',
  icon: 'IconBrandWhatsapp',
  relationTargetObjectMetadataUniversalIdentifier: CONTACT_ACTIVITY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: ACTIVITY_PERSON_FIELD_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
