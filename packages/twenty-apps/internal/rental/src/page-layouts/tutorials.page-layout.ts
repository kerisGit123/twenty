import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  TUTORIALS_FRONT_COMPONENT_ID,
  TUTORIALS_PAGE_LAYOUT_ID,
  TUTORIALS_TAB_ID,
  TUTORIALS_WIDGET_ID,
} from 'src/constants/tutorials-ids';

export default definePageLayout({
  universalIdentifier: TUTORIALS_PAGE_LAYOUT_ID,
  name: 'Tutorials',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: TUTORIALS_TAB_ID,
      title: 'Tutorials',
      position: 0,
      icon: 'IconPlayerPlay',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: TUTORIALS_WIDGET_ID,
          title: 'Tutorials',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.TAB_VIEWPORT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: TUTORIALS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
