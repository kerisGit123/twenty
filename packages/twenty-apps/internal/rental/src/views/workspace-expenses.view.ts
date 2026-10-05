import { defineView, ViewFilterOperand, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import {
  EXPENSE_AMOUNT_FIELD_ID,
  EXPENSE_CATEGORY_FIELD_ID,
  EXPENSE_DATE_FIELD_ID,
  EXPENSE_NAME_FIELD_ID,
  EXPENSE_OBJECT_ID,
  EXPENSE_OWNER_FIELD_ID,
  EXPENSE_PAID_TO_FIELD_ID,
  EXPENSE_RECEIPT_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  WORKSPACE_EXPENSES_VIEW_ID,
} from 'src/constants/universal-identifiers-v3';

// Table shown in the Expenses tab of a workspace.
export default defineView({
  universalIdentifier: WORKSPACE_EXPENSES_VIEW_ID,
  name: 'Workspace expenses',
  objectUniversalIdentifier: EXPENSE_OBJECT_ID,
  type: ViewType.TABLE_WIDGET,
  fields: [
    { universalIdentifier: '0c299e09-8e5e-4527-b90d-4537166a150c', fieldMetadataUniversalIdentifier: EXPENSE_NAME_FIELD_ID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: '49345047-3a4c-4abd-b581-ea2a9fe58783', fieldMetadataUniversalIdentifier: EXPENSE_DATE_FIELD_ID, position: 1, isVisible: true },
    { universalIdentifier: '9ac42b20-e0e2-4936-9b37-1de1dfaaaca8', fieldMetadataUniversalIdentifier: EXPENSE_CATEGORY_FIELD_ID, position: 2, isVisible: true },
    { universalIdentifier: 'f7067719-0db3-4fc0-a643-8b02c7eb4304', fieldMetadataUniversalIdentifier: EXPENSE_AMOUNT_FIELD_ID, position: 3, isVisible: true },
    { universalIdentifier: 'c831ad9d-01b2-40c4-af55-1778890f333d', fieldMetadataUniversalIdentifier: EXPENSE_PAID_TO_FIELD_ID, position: 4, isVisible: true },
    { universalIdentifier: '31ea2ab4-e1df-4988-8513-ee7ce7506dc9', fieldMetadataUniversalIdentifier: EXPENSE_RECEIPT_FIELD_ID, position: 5, isVisible: true },
  ],
  // Only the rows of the record the page is showing.
  filters: [
    {
      universalIdentifier: '87c605b5-87b9-4c0a-ac73-b4d0a94ec0f0',
      fieldMetadataUniversalIdentifier: EXPENSE_OWNER_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: '{"selectedRecordIds":[],"isCurrentRecordSelected":true}',
    },
  ],
  sorts: [
    { universalIdentifier: '175664b3-9748-44ce-9041-430951739a12', fieldMetadataUniversalIdentifier: EXPENSE_DATE_FIELD_ID, direction: ViewSortDirection.DESC },
  ],
});
