import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  TUTORIALS_NAV_ITEM_ID,
  TUTORIALS_PAGE_LAYOUT_ID,
} from 'src/constants/tutorials-ids';

// Tutorials: how-to videos, open to everyone who signs in. At the top level of the sidebar.
export default defineNavigationMenuItem({
  universalIdentifier: TUTORIALS_NAV_ITEM_ID,
  name: 'Tutorials',
  icon: 'IconPlayerPlay',
  position: 9,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: TUTORIALS_PAGE_LAYOUT_ID,
});
