import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  SETTINGS_FOLDER_NAV_ID,
  NOTIFICATIONS_NAV_ITEM_ID,
  NOTIFICATIONS_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: NOTIFICATIONS_NAV_ITEM_ID,
  name: 'Notifications',
  icon: 'IconBell',
  position: 1,
  folderUniversalIdentifier: SETTINGS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: NOTIFICATIONS_PAGE_LAYOUT_ID,
});
