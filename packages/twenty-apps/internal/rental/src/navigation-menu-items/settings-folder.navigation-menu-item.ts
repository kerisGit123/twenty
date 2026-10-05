import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { SETTINGS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

// Sidebar folder for how the app works for you: templates and notifications.
export default defineNavigationMenuItem({
  universalIdentifier: SETTINGS_FOLDER_NAV_ID,
  name: 'Setup',
  icon: 'IconAdjustmentsHorizontal',
  position: 7,
  type: NavigationMenuItemType.FOLDER,
});
