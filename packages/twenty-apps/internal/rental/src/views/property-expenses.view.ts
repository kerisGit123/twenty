import { defineView, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import {
  EXPENSE_AMOUNT_FIELD_ID,
  EXPENSE_CATEGORY_FIELD_ID,
  EXPENSE_DATE_FIELD_ID,
  EXPENSE_NAME_FIELD_ID,
  EXPENSE_OBJECT_ID,
  EXPENSE_PAID_TO_FIELD_ID,
  EXPENSE_RECEIPT_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';
import {
  PROPERTY_EXPENSES_VIEW_ID,
} from 'src/constants/universal-identifiers-v3';

// Table shown in the expenses tab of a property.
export default defineView({
  universalIdentifier: PROPERTY_EXPENSES_VIEW_ID,
  name: 'Property expenses',
  objectUniversalIdentifier: EXPENSE_OBJECT_ID,
  type: ViewType.TABLE_WIDGET,
  fields: [
    { universalIdentifier: 'f92f119c-3008-476a-b9e8-4f6249d2fdc6', fieldMetadataUniversalIdentifier: EXPENSE_NAME_FIELD_ID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: '69a60a93-1fab-4a93-9d61-41e9a3853f5a', fieldMetadataUniversalIdentifier: EXPENSE_DATE_FIELD_ID, position: 1, isVisible: true },
    { universalIdentifier: 'df1a1514-7b83-4a7d-93e4-a5abbc2f9a06', fieldMetadataUniversalIdentifier: EXPENSE_CATEGORY_FIELD_ID, position: 2, isVisible: true },
    { universalIdentifier: '5b33b470-a7a6-4842-b51a-94720232e4a7', fieldMetadataUniversalIdentifier: EXPENSE_AMOUNT_FIELD_ID, position: 3, isVisible: true },
    { universalIdentifier: 'e149e453-9b3f-43fa-828c-43d54e17923e', fieldMetadataUniversalIdentifier: EXPENSE_PAID_TO_FIELD_ID, position: 4, isVisible: true },
    { universalIdentifier: 'b1cc3c4b-fbba-44c7-b41a-78ffbeae2694', fieldMetadataUniversalIdentifier: EXPENSE_RECEIPT_FIELD_ID, position: 5, isVisible: true },
  ],
  sorts: [
    { universalIdentifier: 'e70fee26-0833-4bf7-a8e9-28a300af2deb', fieldMetadataUniversalIdentifier: EXPENSE_DATE_FIELD_ID, direction: ViewSortDirection.DESC },
  ],
});
