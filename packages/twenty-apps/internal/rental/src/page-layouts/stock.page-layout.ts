import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  STOCK_FRONT_COMPONENT_ID,
  STOCK_PAGE_LAYOUT_ID,
  STOCK_TAB_ID,
  STOCK_WIDGET_ID,
} from 'src/constants/universal-identifiers-stock';

export default definePageLayout({
  universalIdentifier: STOCK_PAGE_LAYOUT_ID,
  name: 'Stock',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: STOCK_TAB_ID,
      title: 'Stock',
      position: 0,
      icon: 'IconPackage',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: STOCK_WIDGET_ID,
          title: 'Stock',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.TAB_VIEWPORT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: STOCK_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
