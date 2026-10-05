import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { RENTALS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

// Sidebar folder: properties, contracts and payments.
export default defineNavigationMenuItem({
  universalIdentifier: RENTALS_FOLDER_NAV_ID,
  name: 'Rentals',
  icon: 'IconBuildingCommunity',
  position: 5,
  type: NavigationMenuItemType.FOLDER,
});
