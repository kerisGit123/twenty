import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  PROPERTIES_NAV_ITEM_ID,
  PROPERTY_OBJECT_ID,
} from 'src/constants/universal-identifiers';
import { RENTALS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: PROPERTIES_NAV_ITEM_ID,
  position: 0,
  folderUniversalIdentifier: RENTALS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: PROPERTY_OBJECT_ID,
});
