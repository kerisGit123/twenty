import { definePageLayoutTab, PageLayoutTabLayoutMode, STANDARD_PAGE_LAYOUT } from 'twenty-sdk/define';

import {
  PERSON_OVERVIEW_FRONT_COMPONENT_ID,
  PERSON_OVERVIEW_TAB_ID,
  PERSON_OVERVIEW_WIDGET_ID,
} from 'src/constants/universal-identifiers-v3';

// Adds an Overview tab (quick actions, birthday, rent) to Twenty's person
// page, right after the pinned Home tab.
export default definePageLayoutTab({
  universalIdentifier: PERSON_OVERVIEW_TAB_ID,
  pageLayoutUniversalIdentifier: STANDARD_PAGE_LAYOUT.personRecordPage.universalIdentifier,
  title: 'Overview',
  position: 15,
  icon: 'IconLayoutDashboard',
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  widgets: [
    {
      universalIdentifier: PERSON_OVERVIEW_WIDGET_ID,
      title: 'Overview',
      type: 'FRONT_COMPONENT',
      configuration: {
        configurationType: 'FRONT_COMPONENT',
        frontComponentUniversalIdentifier: PERSON_OVERVIEW_FRONT_COMPONENT_ID,
      },
    },
  ],
});
