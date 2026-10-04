import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  RENT_LEDGER_FRONT_COMPONENT_ID,
  RENT_LEDGER_PAGE_LAYOUT_ID,
  RENT_LEDGER_TAB_ID,
  RENT_LEDGER_WIDGET_ID,
} from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: RENT_LEDGER_PAGE_LAYOUT_ID,
  name: 'Rent Ledger',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: RENT_LEDGER_TAB_ID,
      title: 'Ledger',
      position: 0,
      icon: 'IconCalendarDollar',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: RENT_LEDGER_WIDGET_ID,
          title: 'Rent ledger',
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
            frontComponentUniversalIdentifier: RENT_LEDGER_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
