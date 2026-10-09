import { defineFrontComponent } from 'twenty-sdk/define';

import { RENT_LEDGER_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { RentLedger } from 'src/front-components/shared/rent-ledger-page';

// The page lives in shared/rent-ledger-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: RENT_LEDGER_FRONT_COMPONENT_ID,
  name: 'rent-ledger',
  description: 'Month-by-month rent ledger with recording and receipts',
  component: RentLedger,
});
