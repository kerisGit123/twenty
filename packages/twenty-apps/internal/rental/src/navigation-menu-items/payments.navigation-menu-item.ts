import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  PAYMENT_OBJECT_ID,
  PAYMENTS_NAV_ITEM_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: PAYMENTS_NAV_ITEM_ID,
  position: 3,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: PAYMENT_OBJECT_ID,
});
