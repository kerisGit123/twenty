import {
  definePageLayout,
  getSystemViewUniversalIdentifier,
  PageLayoutTabLayoutMode,
} from 'twenty-sdk/define';

import {
  APPLICATION_UNIVERSAL_IDENTIFIER,
  PROPERTY_OBJECT_ID,
  PROPERTY_PAYMENTS_FIELD_ID,
  PROPERTY_RENTALS_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { PROPERTY_EXPENSES_FIELD_ID } from 'src/constants/universal-identifiers-v2';
import {
  PROPERTY_CONTRACTS_VIEW_ID,
  PROPERTY_DOCUMENTS_FIELD_ID,
  PROPERTY_DOCUMENTS_VIEW_ID,
  PROPERTY_EXPENSES_VIEW_ID,
  PROPERTY_PAYMENTS_VIEW_ID,
  PROPERTY_OVERVIEW_FRONT_COMPONENT_ID,
  PROPERTY_PAGE_LAYOUT_ID,
  PROPERTY_TAB_CONTRACTS_ID,
  PROPERTY_TAB_DETAILS_ID,
  PROPERTY_TAB_DOCUMENTS_ID,
  PROPERTY_TAB_EXPENSES_ID,
  PROPERTY_TAB_NOTES_ID,
  PROPERTY_TAB_OVERVIEW_ID,
  PROPERTY_TAB_PAYMENTS_ID,
  PROPERTY_TAB_TIMELINE_ID,
  PROPERTY_WIDGET_CONTRACTS_ID,
  PROPERTY_WIDGET_DOCUMENTS_ID,
  PROPERTY_WIDGET_EXPENSES_ID,
  PROPERTY_WIDGET_FIELDS_ID,
  PROPERTY_WIDGET_NOTES_ID,
  PROPERTY_WIDGET_OVERVIEW_ID,
  PROPERTY_WIDGET_PAYMENTS_ID,
  PROPERTY_WIDGET_TIMELINE_ID,
} from 'src/constants/universal-identifiers-v3';

const LIST = PageLayoutTabLayoutMode.VERTICAL_LIST;

// Twenty's own fields view for properties, so relations (owner, tenant) show too.
const PROPERTY_FIELDS_VIEW_ID = getSystemViewUniversalIdentifier({
  objectMetadataApplicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  viewKey: 'FIELDS_WIDGET',
});

// One tab per related list, so everything about a property is one click away.
const relationTab = (
  tabId: string,
  widgetId: string,
  title: string,
  icon: string,
  position: number,
  fieldId: string,
  viewId: string,
) => ({
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

// Property hub: details pinned on the left, then overview and the related
// contracts, payments, expenses and documents as tabs.
export default definePageLayout({
  universalIdentifier: PROPERTY_PAGE_LAYOUT_ID,
  name: 'Property Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier: PROPERTY_TAB_OVERVIEW_ID,
  tabs: [
    {
      universalIdentifier: PROPERTY_TAB_DETAILS_ID,
      title: 'Details',
      position: 0,
      icon: 'IconHome',
      layoutMode: LIST,
      widgets: [
        {
          universalIdentifier: PROPERTY_WIDGET_FIELDS_ID,
          title: 'Fields',
          type: 'FIELDS',
          configuration: { configurationType: 'FIELDS', viewUniversalIdentifier: PROPERTY_FIELDS_VIEW_ID },
        },
      ],
    },
    {
      universalIdentifier: PROPERTY_TAB_OVERVIEW_ID,
      title: 'Overview',
      position: 10,
      icon: 'IconLayoutDashboard',
      layoutMode: LIST,
      widgets: [
        {
          universalIdentifier: PROPERTY_WIDGET_OVERVIEW_ID,
          title: 'Overview',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: PROPERTY_OVERVIEW_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
    relationTab(PROPERTY_TAB_CONTRACTS_ID, PROPERTY_WIDGET_CONTRACTS_ID, 'Contracts', 'IconKey', 20, PROPERTY_RENTALS_FIELD_ID, PROPERTY_CONTRACTS_VIEW_ID),
    relationTab(PROPERTY_TAB_PAYMENTS_ID, PROPERTY_WIDGET_PAYMENTS_ID, 'Payments', 'IconReceipt', 30, PROPERTY_PAYMENTS_FIELD_ID, PROPERTY_PAYMENTS_VIEW_ID),
    relationTab(PROPERTY_TAB_EXPENSES_ID, PROPERTY_WIDGET_EXPENSES_ID, 'Expenses', 'IconCashOff', 40, PROPERTY_EXPENSES_FIELD_ID, PROPERTY_EXPENSES_VIEW_ID),
    relationTab(PROPERTY_TAB_DOCUMENTS_ID, PROPERTY_WIDGET_DOCUMENTS_ID, 'Documents', 'IconFolder', 50, PROPERTY_DOCUMENTS_FIELD_ID, PROPERTY_DOCUMENTS_VIEW_ID),
    {
      universalIdentifier: PROPERTY_TAB_NOTES_ID,
      title: 'Notes',
      position: 60,
      icon: 'IconNotes',
      layoutMode: LIST,
      widgets: [
        {
          universalIdentifier: PROPERTY_WIDGET_NOTES_ID,
          title: 'Notes',
          type: 'NOTES',
          configuration: { configurationType: 'NOTES' },
        },
      ],
    },
    {
      universalIdentifier: PROPERTY_TAB_TIMELINE_ID,
      title: 'Timeline',
      position: 70,
      icon: 'IconTimelineEvent',
      layoutMode: LIST,
      widgets: [
        {
          universalIdentifier: PROPERTY_WIDGET_TIMELINE_ID,
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: { configurationType: 'TIMELINE' },
        },
      ],
    },
  ],
});
