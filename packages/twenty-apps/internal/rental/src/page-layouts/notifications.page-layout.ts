import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

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
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: NOTIFICATIONS_WIDGET_ID,
          title: 'Notifications',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 0,
            column: 0,
            rowSpan: 24,
            columnSpan: 12,
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
