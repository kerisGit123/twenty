import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  PAYMENTS_NAV_ITEM_ID,
} from 'src/constants/universal-identifiers';
import { RENTALS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: PAYMENTS_NAV_ITEM_ID,
  position: 2,
  folderUniversalIdentifier: RENTALS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: PAYMENT_OBJECT_ID,
});
