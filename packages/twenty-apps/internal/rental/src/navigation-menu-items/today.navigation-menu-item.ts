import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  TODAY_NAV_ITEM_ID,
  TODAY_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: TODAY_NAV_ITEM_ID,
  name: 'Today',
  icon: 'IconSun',
  position: 0,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: TODAY_PAGE_LAYOUT_ID,
});
