import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  PROPERTIES_NAV_ITEM_ID,
  PROPERTY_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: PROPERTIES_NAV_ITEM_ID,
  position: 1,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: PROPERTY_OBJECT_ID,
});
