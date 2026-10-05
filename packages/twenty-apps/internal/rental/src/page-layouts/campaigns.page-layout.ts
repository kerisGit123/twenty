import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  CAMPAIGNS_FRONT_COMPONENT_ID,
  CAMPAIGNS_PAGE_LAYOUT_ID,
  CAMPAIGNS_TAB_ID,
  CAMPAIGNS_WIDGET_ID,
} from 'src/constants/universal-identifiers-v4';

export default definePageLayout({
  universalIdentifier: CAMPAIGNS_PAGE_LAYOUT_ID,
  name: 'Campaigns',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: CAMPAIGNS_TAB_ID,
      title: 'Campaigns',
      position: 0,
      icon: 'IconSpeakerphone',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: CAMPAIGNS_WIDGET_ID,
          title: 'Campaigns',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.TAB_VIEWPORT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: CAMPAIGNS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
