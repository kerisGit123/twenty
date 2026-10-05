import {
  definePageLayout,
  getSystemViewUniversalIdentifier,
  PageLayoutTabLayoutMode,
} from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import {
  OWNER_EXPENSES_FIELD_ID,
  OWNER_OBJECT_ID,
  OWNER_PAYMENTS_FIELD_ID,
  OWNER_PROPERTIES_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  OWNER_DOCUMENTS_FIELD_ID,
  OWNER_PAGE_LAYOUT_ID,
  OWNER_TAB_DETAILS_ID,
  OWNER_TAB_DOCUMENTS_ID,
  OWNER_TAB_EXPENSES_ID,
  OWNER_TAB_MEMBERS_ID,
  OWNER_TAB_OVERVIEW_ID,
  OWNER_TAB_PAYMENTS_ID,
  OWNER_TAB_PROPERTIES_ID,
  OWNER_TAB_TIMELINE_ID,
  OWNER_WIDGET_DOCUMENTS_ID,
  OWNER_WIDGET_EXPENSES_ID,
  OWNER_WIDGET_FIELDS_ID,
  OWNER_WIDGET_MEMBERS_ID,
  OWNER_WIDGET_OVERVIEW_ID,
  OWNER_WIDGET_PAYMENTS_ID,
  OWNER_WIDGET_PROPERTIES_ID,
  OWNER_WIDGET_TIMELINE_ID,
  PROPERTY_DOCUMENTS_VIEW_ID,
  PROPERTY_EXPENSES_VIEW_ID,
  PROPERTY_PAYMENTS_VIEW_ID,
  WORKSPACE_MEMBERS_FRONT_COMPONENT_ID,
  WORKSPACE_OVERVIEW_FRONT_COMPONENT_ID,
  WORKSPACE_PROPERTIES_VIEW_ID,
} from 'src/constants/universal-identifiers-v3';

const LIST = PageLayoutTabLayoutMode.VERTICAL_LIST;

// A tab showing one of the workspace's related lists as a table.
const tableTab = (tabId: string, widgetId: string, title: string, icon: string, position: number, fieldId: string, viewId: string) => ({
  universalIdentifier: tabId,
  title,
  position,
  icon,
  layoutMode: LIST,
  widgets: [
    {
      universalIdentifier: widgetId,
      title,
      type: 'FIELD' as const,
      configuration: {
        configurationType: 'FIELD' as const,
        fieldMetadataId: fieldId,
        fieldDisplayMode: 'TABLE' as const,
        viewId,
      },
    },
  ],
});

// Workspace hub (Personal, Family, Company A...): everything that belongs to the
// workspace in one place — overview, properties, money, documents and members.
export default definePageLayout({
  universalIdentifier: OWNER_PAGE_LAYOUT_ID,
  name: 'Workspace Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier: OWNER_TAB_OVERVIEW_ID,
  tabs: [
    {
      universalIdentifier: OWNER_TAB_DETAILS_ID,
      title: 'Details',
      position: 0,
      icon: 'IconBriefcase',
      layoutMode: LIST,
      widgets: [
        {
          universalIdentifier: OWNER_WIDGET_FIELDS_ID,
          title: 'Fields',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier: getSystemViewUniversalIdentifier({
              objectMetadataApplicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
              objectUniversalIdentifier: OWNER_OBJECT_ID,
              viewKey: 'FIELDS_WIDGET',
            }),
          },
        },
      ],
    },
    {
      universalIdentifier: OWNER_TAB_OVERVIEW_ID,
      title: 'Overview',
      position: 10,
      icon: 'IconLayoutDashboard',
      layoutMode: LIST,
      widgets: [
        {
          universalIdentifier: OWNER_WIDGET_OVERVIEW_ID,
          title: 'Overview',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: WORKSPACE_OVERVIEW_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
    tableTab(OWNER_TAB_PROPERTIES_ID, OWNER_WIDGET_PROPERTIES_ID, 'Properties', 'IconHome', 20, OWNER_PROPERTIES_FIELD_ID, WORKSPACE_PROPERTIES_VIEW_ID),
    tableTab(OWNER_TAB_PAYMENTS_ID, OWNER_WIDGET_PAYMENTS_ID, 'Payments', 'IconReceipt', 30, OWNER_PAYMENTS_FIELD_ID, PROPERTY_PAYMENTS_VIEW_ID),
    tableTab(OWNER_TAB_EXPENSES_ID, OWNER_WIDGET_EXPENSES_ID, 'Expenses', 'IconCashOff', 40, OWNER_EXPENSES_FIELD_ID, PROPERTY_EXPENSES_VIEW_ID),
    tableTab(OWNER_TAB_DOCUMENTS_ID, OWNER_WIDGET_DOCUMENTS_ID, 'Documents', 'IconFolder', 50, OWNER_DOCUMENTS_FIELD_ID, PROPERTY_DOCUMENTS_VIEW_ID),
    {
      universalIdentifier: OWNER_TAB_MEMBERS_ID,
      title: 'Members',
      position: 60,
      icon: 'IconUsers',
      layoutMode: LIST,
      widgets: [
        {
          universalIdentifier: OWNER_WIDGET_MEMBERS_ID,
          title: 'Members',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: WORKSPACE_MEMBERS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
    {
      universalIdentifier: OWNER_TAB_TIMELINE_ID,
      title: 'Timeline',
      position: 70,
      icon: 'IconTimelineEvent',
      layoutMode: LIST,
      widgets: [
        {
          universalIdentifier: OWNER_WIDGET_TIMELINE_ID,
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: { configurationType: 'TIMELINE' },
        },
      ],
    },
  ],
});
