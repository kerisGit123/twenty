import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  DOCUMENT_OBJECT_ID,
  DOCUMENTS_NAV_ITEM_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: DOCUMENTS_NAV_ITEM_ID,
  position: 5,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: DOCUMENT_OBJECT_ID,
});
