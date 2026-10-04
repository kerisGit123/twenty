import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  DOCUMENT_OBJECT_ID,
  DOCUMENTS_NAV_ITEM_ID,
  RECORDS_FOLDER_NAV_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: DOCUMENTS_NAV_ITEM_ID,
  position: 1,
  folderUniversalIdentifier: RECORDS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: DOCUMENT_OBJECT_ID,
});
