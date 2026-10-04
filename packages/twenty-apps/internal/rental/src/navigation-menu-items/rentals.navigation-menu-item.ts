import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  RENTAL_OBJECT_ID,
  RENTALS_NAV_ITEM_ID,
} from 'src/constants/universal-identifiers';
import { RENTALS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: RENTALS_NAV_ITEM_ID,
  position: 1,
  folderUniversalIdentifier: RENTALS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: RENTAL_OBJECT_ID,
});
