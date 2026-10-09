import { defineFrontComponent } from 'twenty-sdk/define';

import { TODAY_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { Today } from 'src/front-components/shared/today-page';

// The page lives in shared/today-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: TODAY_FRONT_COMPONENT_ID,
  name: 'today',
  description: 'What needs attention today and what is coming up in the next 30 days',
  component: Today,
});
