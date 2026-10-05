import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { REPORTS_FOLDER_NAV_ID } from 'src/constants/universal-identifiers-v3';

// Sidebar folder for the yearly and chart views of the rental numbers.
export default defineNavigationMenuItem({
  universalIdentifier: REPORTS_FOLDER_NAV_ID,
  name: 'Reports',
  icon: 'IconReportAnalytics',
  position: 4,
  type: NavigationMenuItemType.FOLDER,
});
