import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  RENTAL_OBJECT_ID,
  RENTALS_NAV_ITEM_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: RENTALS_NAV_ITEM_ID,
  position: 1,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: RENTAL_OBJECT_ID,
});
