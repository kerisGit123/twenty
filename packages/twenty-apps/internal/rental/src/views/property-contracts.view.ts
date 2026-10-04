import { defineView, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import {
  RENTAL_END_DATE_FIELD_ID,
  RENTAL_MONTHLY_RENT_FIELD_ID,
  RENTAL_NAME_FIELD_ID,
  RENTAL_OBJECT_ID,
  RENTAL_START_DATE_FIELD_ID,
  RENTAL_STATUS_FIELD_ID,
  RENTAL_TENANT_FIELD_ID,
} from 'src/constants/universal-identifiers';
import {
  PROPERTY_CONTRACTS_VIEW_ID,
} from 'src/constants/universal-identifiers-v3';
import {
  RENTAL_DEPOSIT_STATUS_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';

// Table shown in the contracts tab of a property.
export default defineView({
  universalIdentifier: PROPERTY_CONTRACTS_VIEW_ID,
  name: 'Property contracts',
  objectUniversalIdentifier: RENTAL_OBJECT_ID,
  type: ViewType.TABLE_WIDGET,
  fields: [
    { universalIdentifier: '313aa3d2-ee73-47df-bbc0-88923bb5db0a', fieldMetadataUniversalIdentifier: RENTAL_NAME_FIELD_ID, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: 'f3885c98-b880-4ceb-8795-93a973de3f3d', fieldMetadataUniversalIdentifier: RENTAL_STATUS_FIELD_ID, position: 1, isVisible: true },
    { universalIdentifier: 'b1dc387f-fb5b-4cd4-9960-e30d6b1f2896', fieldMetadataUniversalIdentifier: RENTAL_TENANT_FIELD_ID, position: 2, isVisible: true },
    { universalIdentifier: 'c5296c3b-f182-450a-a52f-327e1ae618c3', fieldMetadataUniversalIdentifier: RENTAL_START_DATE_FIELD_ID, position: 3, isVisible: true },
    { universalIdentifier: '0a8ed643-b804-44a9-b8c6-d9130bea6d27', fieldMetadataUniversalIdentifier: RENTAL_END_DATE_FIELD_ID, position: 4, isVisible: true },
    { universalIdentifier: '8389b289-0e45-42d2-a8fb-d25972a6bb11', fieldMetadataUniversalIdentifier: RENTAL_MONTHLY_RENT_FIELD_ID, position: 5, isVisible: true },
    { universalIdentifier: 'fc8ae57a-dcf8-4291-9c26-a71aebef2383', fieldMetadataUniversalIdentifier: RENTAL_DEPOSIT_STATUS_FIELD_ID, position: 6, isVisible: true },
  ],
  sorts: [
    { universalIdentifier: 'ca519019-46e6-4fbb-ab6a-4390facbcc63', fieldMetadataUniversalIdentifier: RENTAL_START_DATE_FIELD_ID, direction: ViewSortDirection.DESC },
  ],
});
