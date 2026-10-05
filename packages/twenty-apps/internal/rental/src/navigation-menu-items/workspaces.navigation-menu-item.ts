import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  WORKSPACES_NAV_ITEM_ID,
  WORKSPACES_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: WORKSPACES_NAV_ITEM_ID,
  name: 'Workspaces',
  icon: 'IconBriefcase',
  position: 1,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: WORKSPACES_PAGE_LAYOUT_ID,
});
