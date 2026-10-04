import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  EXPENSE_TRACKER_NAV_ITEM_ID,
  EXPENSE_TRACKER_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-v3';

// Opens the expenses page; the plain table is one click away from there.
export default defineNavigationMenuItem({
  universalIdentifier: EXPENSE_TRACKER_NAV_ITEM_ID,
  name: 'Expenses',
  icon: 'IconCashOff',
  position: 2,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: EXPENSE_TRACKER_PAGE_LAYOUT_ID,
});
