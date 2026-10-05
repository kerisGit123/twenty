import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

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
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: YEAR_SUMMARY_WIDGET_ID,
          title: 'Year summary',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.FIT_CONTENT,
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
