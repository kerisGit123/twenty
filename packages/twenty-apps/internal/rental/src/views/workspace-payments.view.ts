import { defineView, ViewFilterOperand, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import { PAYMENT_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-v2';
import {
  PAYMENT_AMOUNT_FIELD_ID,
  PAYMENT_METHOD_FIELD_ID,
  PAYMENT_OBJECT_ID,
  PAYMENT_PAID_ON_FIELD_ID,
  PAYMENT_PERIOD_FIELD_ID,
  PAYMENT_RECEIPT_NUMBER_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
  PAYMENT_TYPE_FIELD_ID,
} from 'src/constants/universal-identifiers';
import {
  WORKSPACE_PAYMENTS_VIEW_ID,
} from 'src/constants/universal-identifiers-v3';

// Table shown in the Payments tab of a workspace.
export default defineView({
  universalIdentifier: WORKSPACE_PAYMENTS_VIEW_ID,
  name: 'Workspace payments',
  objectUniversalIdentifier: PAYMENT_OBJECT_ID,
  type: ViewType.TABLE_WIDGET,
  fields: [
    { universalIdentifier: '3b9586b3-b85e-4edc-ac1b-22e3965080b0', fieldMetadataUniversalIdentifier: PAYMENT_RECEIPT_NUMBER_FIELD_ID, position: 0, isVisible: true, size: 160 },
    { universalIdentifier: '38b4de1e-57df-4887-af52-d0d1e6e11884', fieldMetadataUniversalIdentifier: PAYMENT_STATUS_FIELD_ID, position: 1, isVisible: true },
    { universalIdentifier: '67629ca0-0c87-4fd6-bc07-f5836ee46130', fieldMetadataUniversalIdentifier: PAYMENT_TYPE_FIELD_ID, position: 2, isVisible: true },
    { universalIdentifier: '1c49f0cd-4d09-40df-90a0-78aa1996b5e1', fieldMetadataUniversalIdentifier: PAYMENT_PERIOD_FIELD_ID, position: 3, isVisible: true },
    { universalIdentifier: 'a847a1f8-abc9-449b-bfc1-11753991e9e3', fieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID, position: 4, isVisible: true },
    { universalIdentifier: '099e21fb-1b8f-4286-b081-2fe9cb237f30', fieldMetadataUniversalIdentifier: PAYMENT_PAID_ON_FIELD_ID, position: 5, isVisible: true },
    { universalIdentifier: 'd0b118e4-9885-413d-81f7-3872c70b4e37', fieldMetadataUniversalIdentifier: PAYMENT_METHOD_FIELD_ID, position: 6, isVisible: true },
  ],
  // Only the rows of the record the page is showing.
  filters: [
    {
      universalIdentifier: 'c45a9356-aa21-4d2c-9993-d1c7a8f2e931',
      fieldMetadataUniversalIdentifier: PAYMENT_OWNER_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: '{"selectedRecordIds":[],"isCurrentRecordSelected":true}',
    },
  ],
  sorts: [
    { universalIdentifier: '4de3ec4b-ac9c-4c3a-a5c8-09b0f6d16f9b', fieldMetadataUniversalIdentifier: PAYMENT_PERIOD_FIELD_ID, direction: ViewSortDirection.DESC },
  ],
});
