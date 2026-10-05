import { definePageLayoutTab, PageLayoutTabLayoutMode, STANDARD_PAGE_LAYOUT } from 'twenty-sdk/define';

import {
  PERSON_WHATSAPP_FRONT_COMPONENT_ID,
  PERSON_WHATSAPP_TAB_ID,
  PERSON_WHATSAPP_WIDGET_ID,
} from 'src/constants/universal-identifiers-v4';

// A WhatsApp tab on the person page: what the app sent them, replies, notes
// and follow-ups.
export default definePageLayoutTab({
  universalIdentifier: PERSON_WHATSAPP_TAB_ID,
  pageLayoutUniversalIdentifier: STANDARD_PAGE_LAYOUT.personRecordPage.universalIdentifier,
  title: 'WhatsApp',
  position: 16,
  icon: 'IconBrandWhatsapp',
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  widgets: [
    {
      universalIdentifier: PERSON_WHATSAPP_WIDGET_ID,
      title: 'WhatsApp',
      type: 'FRONT_COMPONENT',
      configuration: {
        configurationType: 'FRONT_COMPONENT',
        frontComponentUniversalIdentifier: PERSON_WHATSAPP_FRONT_COMPONENT_ID,
      },
    },
  ],
});
