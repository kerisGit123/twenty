import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  DOCUMENTS_FRONT_COMPONENT_ID,
  DOCUMENTS_PAGE_LAYOUT_ID,
  DOCUMENTS_TAB_ID,
  DOCUMENTS_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: DOCUMENTS_PAGE_LAYOUT_ID,
  name: 'Documents',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: DOCUMENTS_TAB_ID,
      title: 'Documents',
      position: 0,
      icon: 'IconFolder',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: DOCUMENTS_WIDGET_ID,
          title: 'Documents',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.TAB_VIEWPORT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: DOCUMENTS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
