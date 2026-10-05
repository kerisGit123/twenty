import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  CONTRACTS_FRONT_COMPONENT_ID,
  CONTRACTS_PAGE_LAYOUT_ID,
  CONTRACTS_TAB_ID,
  CONTRACTS_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: CONTRACTS_PAGE_LAYOUT_ID,
  name: 'Contracts',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: CONTRACTS_TAB_ID,
      title: 'Contracts',
      position: 0,
      icon: 'IconKey',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: CONTRACTS_WIDGET_ID,
          title: 'Contracts',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.TAB_VIEWPORT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: CONTRACTS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
