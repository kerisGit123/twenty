import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { MORE_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

// Sidebar folder for Twenty's built-in lists that the rental workflow doesn't use.
export default defineNavigationMenuItem({
  universalIdentifier: MORE_FOLDER_NAV_ID,
  name: 'More',
  icon: 'IconDots',
  position: 6,
  type: NavigationMenuItemType.FOLDER,
});
