import { defineFrontComponent } from 'twenty-sdk/define';

import { TRANSACTIONS_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { Transactions } from 'src/front-components/shared/transactions-page';

// The page lives in shared/transactions-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: TRANSACTIONS_FRONT_COMPONENT_ID,
  name: 'transactions',
  description: 'Money in, money out and the receipt register for any period, with CSV download',
  component: Transactions,
});
