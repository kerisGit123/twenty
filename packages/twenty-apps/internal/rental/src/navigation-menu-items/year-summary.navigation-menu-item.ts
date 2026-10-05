import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  REPORTS_FOLDER_NAV_ID,
  YEAR_SUMMARY_NAV_ITEM_ID,
  YEAR_SUMMARY_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: YEAR_SUMMARY_NAV_ITEM_ID,
  name: 'Year summary',
  icon: 'IconCalendarStats',
  position: 0,
  folderUniversalIdentifier: REPORTS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: YEAR_SUMMARY_PAGE_LAYOUT_ID,
});
