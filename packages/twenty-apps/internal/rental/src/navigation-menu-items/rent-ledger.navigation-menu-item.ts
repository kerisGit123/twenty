import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  RENT_LEDGER_NAV_ITEM_ID,
  RENT_LEDGER_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: RENT_LEDGER_NAV_ITEM_ID,
  name: 'Rent Ledger',
  icon: 'IconCalendarDollar',
  position: 1,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: RENT_LEDGER_PAGE_LAYOUT_ID,
});
