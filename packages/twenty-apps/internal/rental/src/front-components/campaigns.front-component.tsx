import { defineFrontComponent } from 'twenty-sdk/define';

import { CAMPAIGNS_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v4';
import { Campaigns } from 'src/front-components/shared/campaigns-page';

// The page lives in shared/campaigns-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: CAMPAIGNS_FRONT_COMPONENT_ID,
  name: 'campaigns-page',
  description: 'Greetings, newsletters and announcements sent from your WhatsApp, one tap per person',
  component: Campaigns,
});
