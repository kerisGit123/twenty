import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  TEMPLATE_EDITOR_FRONT_COMPONENT_ID,
  TEMPLATE_EDITOR_PAGE_LAYOUT_ID,
  TEMPLATE_EDITOR_TAB_ID,
  TEMPLATE_EDITOR_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: TEMPLATE_EDITOR_PAGE_LAYOUT_ID,
  name: 'Templates',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: TEMPLATE_EDITOR_TAB_ID,
      title: 'Templates',
      position: 0,
      icon: 'IconTemplate',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: TEMPLATE_EDITOR_WIDGET_ID,
          title: 'Templates',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.FIT_CONTENT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: TEMPLATE_EDITOR_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
