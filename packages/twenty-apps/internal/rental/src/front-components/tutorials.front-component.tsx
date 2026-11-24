import { defineFrontComponent } from 'twenty-sdk/define';

import { TUTORIALS_FRONT_COMPONENT_ID } from 'src/constants/tutorials-ids';
import { Tutorials } from 'src/front-components/shared/tutorials-page';

// The page lives in shared/tutorials-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: TUTORIALS_FRONT_COMPONENT_ID,
  name: 'tutorials-page',
  description: 'Tutorial videos for everyone: pick one and watch it in the app',
  component: Tutorials,
});
