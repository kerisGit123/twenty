import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  DOCUMENTS_PAGE_LAYOUT_ID,
  DOCUMENTS_PAGE_NAV_ITEM_ID,
  RECORDS_FOLDER_NAV_ID,
} from 'src/constants/universal-identifiers-v3';

// The Documents page (drop to file, view in the app) replaces the plain
// table, which stays one tap away ("Open as a table").
export default defineNavigationMenuItem({
  universalIdentifier: DOCUMENTS_PAGE_NAV_ITEM_ID,
  name: 'Documents',
  icon: 'IconFolder',
  position: 0,
  folderUniversalIdentifier: RECORDS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: DOCUMENTS_PAGE_LAYOUT_ID,
});
