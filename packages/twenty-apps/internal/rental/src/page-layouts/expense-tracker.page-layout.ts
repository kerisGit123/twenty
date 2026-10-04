import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  EXPENSE_TRACKER_FRONT_COMPONENT_ID,
  EXPENSE_TRACKER_PAGE_LAYOUT_ID,
  EXPENSE_TRACKER_TAB_ID,
  EXPENSE_TRACKER_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: EXPENSE_TRACKER_PAGE_LAYOUT_ID,
  name: 'Expenses',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: EXPENSE_TRACKER_TAB_ID,
      title: 'Expenses',
      position: 0,
      icon: 'IconCashOff',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: EXPENSE_TRACKER_WIDGET_ID,
          title: 'Expenses',
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
            frontComponentUniversalIdentifier: EXPENSE_TRACKER_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
