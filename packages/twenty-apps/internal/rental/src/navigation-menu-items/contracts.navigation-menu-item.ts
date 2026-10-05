import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  CONTRACTS_NAV_ITEM_ID,
  CONTRACTS_PAGE_LAYOUT_ID,
  RENTALS_FOLDER_NAV_ID,
} from 'src/constants/universal-identifiers-v3';

// The Contracts page (renewals, deposits) replaces the plain contracts table,
// which stays one tap away ("Open as a table").
export default defineNavigationMenuItem({
  universalIdentifier: CONTRACTS_NAV_ITEM_ID,
  name: 'Contracts',
  icon: 'IconKey',
  position: 1,
  folderUniversalIdentifier: RENTALS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: CONTRACTS_PAGE_LAYOUT_ID,
});
