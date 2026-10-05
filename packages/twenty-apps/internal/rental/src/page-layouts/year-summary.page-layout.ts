import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  YEAR_SUMMARY_FRONT_COMPONENT_ID,
  YEAR_SUMMARY_PAGE_LAYOUT_ID,
  YEAR_SUMMARY_TAB_ID,
  YEAR_SUMMARY_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: YEAR_SUMMARY_PAGE_LAYOUT_ID,
  name: 'Year summary',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: YEAR_SUMMARY_TAB_ID,
      title: 'Year summary',
      position: 0,
      icon: 'IconCalendarStats',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: YEAR_SUMMARY_WIDGET_ID,
          title: 'Year summary',
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
            frontComponentUniversalIdentifier: YEAR_SUMMARY_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
