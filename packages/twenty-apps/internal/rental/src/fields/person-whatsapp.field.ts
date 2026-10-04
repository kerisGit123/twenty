import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_WHATSAPP_FIELD_ID } from 'src/constants/universal-identifiers-v2';

// Click-to-chat link (https://wa.me/60123456789), kept in sync with the
// person's phone number automatically.
export default defineField({
  universalIdentifier: PERSON_WHATSAPP_FIELD_ID,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.LINKS,
  name: 'whatsapp',
  label: 'WhatsApp',
  icon: 'IconBrandWhatsapp',
  isNullable: true,
});
