import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { OWNER_STOCK_REQUESTS_FIELD_ID, STOCK_REQUEST_OBJECT_ID, STOCK_REQUEST_OWNER_FIELD_ID } from 'src/constants/universal-identifiers-stock';

export default defineField({
  universalIdentifier: OWNER_STOCK_REQUESTS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'stockRequests',
  label: 'Branch requests',
  icon: 'IconTruckDelivery',
  relationTargetObjectMetadataUniversalIdentifier: STOCK_REQUEST_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: STOCK_REQUEST_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
