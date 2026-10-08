import { defineFrontComponent } from 'twenty-sdk/define';

import { CONTRACTS_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { Contracts } from 'src/front-components/shared/contracts-page';

// The page lives in shared/contracts-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: CONTRACTS_FRONT_COMPONENT_ID,
  name: 'contracts',
  description: 'Contracts: new tenancies, ending soon and renewals, move-out and the deposit register',
  component: Contracts,
});
