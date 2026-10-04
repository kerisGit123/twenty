import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  EXPENSE_OBJECT_ID,
  EXPENSES_NAV_ITEM_ID,
} from 'src/constants/universal-identifiers-v2';

export default defineNavigationMenuItem({
  universalIdentifier: EXPENSES_NAV_ITEM_ID,
  position: 4,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: EXPENSE_OBJECT_ID,
});
