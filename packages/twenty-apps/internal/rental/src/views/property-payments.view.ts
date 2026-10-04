import { defineView, ViewSortDirection, ViewType } from 'twenty-sdk/define';

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
  PROPERTY_PAYMENTS_VIEW_ID,
} from 'src/constants/universal-identifiers-v3';

// Table shown in the payments tab of a property.
export default defineView({
  universalIdentifier: PROPERTY_PAYMENTS_VIEW_ID,
  name: 'Property payments',
  objectUniversalIdentifier: PAYMENT_OBJECT_ID,
  type: ViewType.TABLE_WIDGET,
  fields: [
    { universalIdentifier: '0e9d5451-ad76-4402-a401-9d9c07aa34dd', fieldMetadataUniversalIdentifier: PAYMENT_RECEIPT_NUMBER_FIELD_ID, position: 0, isVisible: true, size: 160 },
    { universalIdentifier: '006e718d-6f12-44a5-991f-214b786281c9', fieldMetadataUniversalIdentifier: PAYMENT_STATUS_FIELD_ID, position: 1, isVisible: true },
    { universalIdentifier: '53e4555b-e22e-4603-ad6c-7935021deadc', fieldMetadataUniversalIdentifier: PAYMENT_TYPE_FIELD_ID, position: 2, isVisible: true },
    { universalIdentifier: 'f7f7788d-fc72-4f22-ad9c-9d6e96f97b38', fieldMetadataUniversalIdentifier: PAYMENT_PERIOD_FIELD_ID, position: 3, isVisible: true },
    { universalIdentifier: '328b0f79-4538-4503-8e3f-ebd5a9ca25a3', fieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID, position: 4, isVisible: true },
    { universalIdentifier: '47820a6f-0cf3-4526-be01-edaff5ea1da0', fieldMetadataUniversalIdentifier: PAYMENT_PAID_ON_FIELD_ID, position: 5, isVisible: true },
    { universalIdentifier: '7257fa08-75ee-4df8-89b8-69a29526202d', fieldMetadataUniversalIdentifier: PAYMENT_METHOD_FIELD_ID, position: 6, isVisible: true },
  ],
  sorts: [
    { universalIdentifier: 'bd836734-675e-4d88-ac2c-459bbed4491e', fieldMetadataUniversalIdentifier: PAYMENT_PERIOD_FIELD_ID, direction: ViewSortDirection.DESC },
  ],
});
