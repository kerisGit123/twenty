import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
} from 'twenty-sdk/define';

import {
  WORKSPACES_FRONT_COMPONENT_ID,
  WORKSPACES_PAGE_LAYOUT_ID,
  WORKSPACES_TAB_ID,
  WORKSPACES_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

export default definePageLayout({
  universalIdentifier: WORKSPACES_PAGE_LAYOUT_ID,
  name: 'Workspaces',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: WORKSPACES_TAB_ID,
      title: 'Workspaces',
      position: 0,
      icon: 'IconBriefcase',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: WORKSPACES_WIDGET_ID,
          title: 'Workspaces',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
            heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.FIT_CONTENT,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: WORKSPACES_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
