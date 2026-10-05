import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  TODAY_FRONT_COMPONENT_ID,
  TODAY_PAGE_LAYOUT_ID,
  TODAY_TAB_ID,
  TODAY_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: TODAY_PAGE_LAYOUT_ID,
  name: 'Today',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: TODAY_TAB_ID,
      title: 'Today',
      position: 0,
      icon: 'IconSun',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: TODAY_WIDGET_ID,
          title: 'Today',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.FIT_CONTENT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: TODAY_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
