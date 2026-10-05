import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

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
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: RENT_LEDGER_WIDGET_ID,
          title: 'Rent ledger',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.TAB_VIEWPORT,
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
