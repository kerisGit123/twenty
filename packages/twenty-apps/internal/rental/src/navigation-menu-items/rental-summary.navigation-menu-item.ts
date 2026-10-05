import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { REPORTS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';
import { RENTAL_SUMMARY_PAGE_LAYOUT_ID } from 'src/page-layouts/rental-summary.page-layout';

export default defineNavigationMenuItem({
  universalIdentifier: 'b0f8695c-94f0-4d4c-8783-2e78e46495ef',
  name: 'Rental Summary',
  icon: 'IconChartBar',
  position: 1,
  folderUniversalIdentifier: REPORTS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: RENTAL_SUMMARY_PAGE_LAYOUT_ID,
});
