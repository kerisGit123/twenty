import { defineFrontComponent } from 'twenty-sdk/define';

import { PERSON_WHATSAPP_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v4';
import { PersonWhatsapp } from 'src/front-components/shared/person-whatsapp-page';

// The tab lives in shared/person-whatsapp-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: PERSON_WHATSAPP_FRONT_COMPONENT_ID,
  name: 'person-whatsapp',
  description: 'WhatsApp history, replies, notes and follow-ups for a person',
  component: PersonWhatsapp,
});
