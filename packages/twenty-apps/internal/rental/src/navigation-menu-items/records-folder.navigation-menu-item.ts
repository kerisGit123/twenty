import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { RECORDS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

// Sidebar folder "Records": holds the Documents page.
export default defineNavigationMenuItem({
  universalIdentifier: RECORDS_FOLDER_NAV_ID,
  name: 'Records',
  icon: 'IconAddressBook',
  position: 6,
  type: NavigationMenuItemType.FOLDER,
});
