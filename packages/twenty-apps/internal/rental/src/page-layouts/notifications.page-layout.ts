import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  NOTIFICATIONS_FRONT_COMPONENT_ID,
  NOTIFICATIONS_PAGE_LAYOUT_ID,
  NOTIFICATIONS_TAB_ID,
  NOTIFICATIONS_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: NOTIFICATIONS_PAGE_LAYOUT_ID,
  name: 'Notifications',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: NOTIFICATIONS_TAB_ID,
      title: 'Notifications',
      position: 0,
      icon: 'IconBell',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: NOTIFICATIONS_WIDGET_ID,
          title: 'Notifications',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.FIT_CONTENT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: NOTIFICATIONS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
