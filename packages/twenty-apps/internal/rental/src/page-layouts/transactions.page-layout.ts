import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  TRANSACTIONS_FRONT_COMPONENT_ID,
  TRANSACTIONS_PAGE_LAYOUT_ID,
  TRANSACTIONS_TAB_ID,
  TRANSACTIONS_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: TRANSACTIONS_PAGE_LAYOUT_ID,
  name: 'Transactions',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: TRANSACTIONS_TAB_ID,
      title: 'Transactions',
      position: 0,
      icon: 'IconArrowsExchange',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: TRANSACTIONS_WIDGET_ID,
          title: 'Transactions',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.TAB_VIEWPORT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: TRANSACTIONS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
