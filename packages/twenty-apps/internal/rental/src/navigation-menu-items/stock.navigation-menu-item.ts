import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  STOCK_NAV_ITEM_ID,
  STOCK_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-stock';

// Opens the F&B stock page.
export default defineNavigationMenuItem({
  universalIdentifier: STOCK_NAV_ITEM_ID,
  name: 'Stock',
  icon: 'IconPackage',
  position: 3.2,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: STOCK_PAGE_LAYOUT_ID,
});
