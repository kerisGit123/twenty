import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  OWNER_OBJECT_ID,
  OWNERS_NAV_ITEM_ID,
} from 'src/constants/universal-identifiers-v2';

export default defineNavigationMenuItem({
  universalIdentifier: OWNERS_NAV_ITEM_ID,
  position: 6,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: OWNER_OBJECT_ID,
});
