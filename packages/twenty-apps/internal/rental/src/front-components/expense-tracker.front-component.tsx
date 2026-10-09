import { defineFrontComponent } from 'twenty-sdk/define';

import { EXPENSE_TRACKER_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { ExpenseTracker } from 'src/front-components/shared/expense-tracker-page';

// The page lives in shared/expense-tracker-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: EXPENSE_TRACKER_FRONT_COMPONENT_ID,
  name: 'expense-tracker',
  description: 'Everyday, property and business expenses: where the money went, and quick add',
  component: ExpenseTracker,
});
