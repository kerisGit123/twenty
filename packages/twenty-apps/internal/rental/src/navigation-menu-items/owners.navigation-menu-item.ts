import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  OWNER_OBJECT_ID,
  OWNERS_NAV_ITEM_ID,
} from 'src/constants/universal-identifiers-v2';
import { RECORDS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: OWNERS_NAV_ITEM_ID,
  position: 0,
  folderUniversalIdentifier: RECORDS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: OWNER_OBJECT_ID,
});
