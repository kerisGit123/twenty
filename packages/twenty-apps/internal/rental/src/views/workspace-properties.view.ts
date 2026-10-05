import { defineView, ViewFilterOperand, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import { PROPERTY_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-v2';
import {
  PROPERTY_MONTHLY_RENT_FIELD_ID,
  PROPERTY_NAME_FIELD_ID,
  PROPERTY_OBJECT_ID,
  PROPERTY_STATUS_FIELD_ID,
  PROPERTY_TENANT_FIELD_ID,
  PROPERTY_TYPE_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { WORKSPACE_PROPERTIES_VIEW_ID } from 'src/constants/universal-identifiers-v3';

// Table shown in the Properties tab of a workspace.
export default defineView({
  universalIdentifier: WORKSPACE_PROPERTIES_VIEW_ID,
  name: 'Workspace properties',
  objectUniversalIdentifier: PROPERTY_OBJECT_ID,
  type: ViewType.TABLE_WIDGET,
  fields: [
    { universalIdentifier: 'b1f6a0d2-7c4e-4f19-9e3a-2d8c5b7a1e01', fieldMetadataUniversalIdentifier: PROPERTY_NAME_FIELD_ID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: 'b1f6a0d2-7c4e-4f19-9e3a-2d8c5b7a1e02', fieldMetadataUniversalIdentifier: PROPERTY_TYPE_FIELD_ID, position: 1, isVisible: true },
    { universalIdentifier: 'b1f6a0d2-7c4e-4f19-9e3a-2d8c5b7a1e03', fieldMetadataUniversalIdentifier: PROPERTY_STATUS_FIELD_ID, position: 2, isVisible: true },
    { universalIdentifier: 'b1f6a0d2-7c4e-4f19-9e3a-2d8c5b7a1e04', fieldMetadataUniversalIdentifier: PROPERTY_TENANT_FIELD_ID, position: 3, isVisible: true },
    { universalIdentifier: 'b1f6a0d2-7c4e-4f19-9e3a-2d8c5b7a1e05', fieldMetadataUniversalIdentifier: PROPERTY_MONTHLY_RENT_FIELD_ID, position: 4, isVisible: true },
  ],
  // Only the rows of the record the page is showing.
  filters: [
    {
      universalIdentifier: '1705e8c6-3c0a-4d2f-b8c5-e2adcabf7864',
      fieldMetadataUniversalIdentifier: PROPERTY_OWNER_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: '{"selectedRecordIds":[],"isCurrentRecordSelected":true}',
    },
  ],
  sorts: [
    { universalIdentifier: 'b1f6a0d2-7c4e-4f19-9e3a-2d8c5b7a1e06', fieldMetadataUniversalIdentifier: PROPERTY_NAME_FIELD_ID, direction: ViewSortDirection.ASC },
  ],
});
