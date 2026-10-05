import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  REPORTS_FOLDER_NAV_ID,
  TEMPLATE_EDITOR_NAV_ITEM_ID,
  TEMPLATE_EDITOR_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-v3';

export default defineNavigationMenuItem({
  universalIdentifier: TEMPLATE_EDITOR_NAV_ITEM_ID,
  name: 'Templates',
  icon: 'IconTemplate',
  position: 2,
  folderUniversalIdentifier: REPORTS_FOLDER_NAV_ID,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: TEMPLATE_EDITOR_PAGE_LAYOUT_ID,
});
