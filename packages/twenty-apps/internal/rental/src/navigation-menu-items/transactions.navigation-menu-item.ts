import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  REPORTS_FOLDER_NAV_ID,
  TRANSACTIONS_NAV_ITEM_ID,
  TRANSACTIONS_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: TRANSACTIONS_NAV_ITEM_ID,
  name: 'Transactions',
  icon: 'IconArrowsExchange',
  position: 1,
  folderUniversalIdentifier: REPORTS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: TRANSACTIONS_PAGE_LAYOUT_ID,
});
