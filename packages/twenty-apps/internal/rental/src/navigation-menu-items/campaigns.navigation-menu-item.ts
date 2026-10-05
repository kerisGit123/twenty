import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  CAMPAIGNS_NAV_ITEM_ID,
  CAMPAIGNS_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers-v4';

export default defineNavigationMenuItem({
  universalIdentifier: CAMPAIGNS_NAV_ITEM_ID,
  name: 'Campaigns',
  icon: 'IconSpeakerphone',
  position: 3.5,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: CAMPAIGNS_PAGE_LAYOUT_ID,
});
