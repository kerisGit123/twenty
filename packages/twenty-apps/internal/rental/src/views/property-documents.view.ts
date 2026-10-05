import { defineView, ViewFilterOperand, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import {
  DOCUMENT_EXPIRY_FIELD_ID,
  DOCUMENT_FILES_FIELD_ID,
  DOCUMENT_GROUP_FIELD_ID,
  DOCUMENT_NAME_FIELD_ID,
  DOCUMENT_OBJECT_ID,
  DOCUMENT_PROPERTY_FIELD_ID,
  DOCUMENT_TYPE_FIELD_ID,
  PROPERTY_DOCUMENTS_VIEW_ID,
} from 'src/constants/universal-identifiers-v3';

// Table shown in the documents tab of a property.
export default defineView({
  universalIdentifier: PROPERTY_DOCUMENTS_VIEW_ID,
  name: 'Property documents',
  objectUniversalIdentifier: DOCUMENT_OBJECT_ID,
  type: ViewType.TABLE_WIDGET,
  fields: [
    { universalIdentifier: '6fb02cbd-0289-48ff-93c1-75e461b4dd9f', fieldMetadataUniversalIdentifier: DOCUMENT_NAME_FIELD_ID, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: '770104d7-8b10-40aa-83e5-3f48e65ec4fa', fieldMetadataUniversalIdentifier: DOCUMENT_TYPE_FIELD_ID, position: 1, isVisible: true },
    { universalIdentifier: 'acd37d3e-cbd2-4183-bf8d-a26b501a0cb0', fieldMetadataUniversalIdentifier: DOCUMENT_GROUP_FIELD_ID, position: 2, isVisible: true },
    { universalIdentifier: 'fb620b65-0a03-400c-bf99-d8afbb66d71c', fieldMetadataUniversalIdentifier: DOCUMENT_EXPIRY_FIELD_ID, position: 3, isVisible: true },
    { universalIdentifier: '90b7a297-b63b-49e8-9911-bef69a1e2565', fieldMetadataUniversalIdentifier: DOCUMENT_FILES_FIELD_ID, position: 4, isVisible: true },
  ],
  // Only the rows of the record the page is showing.
  filters: [
    {
      universalIdentifier: '4076bbbb-0943-4a4c-8546-b59d7f7e86e8',
      fieldMetadataUniversalIdentifier: DOCUMENT_PROPERTY_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: '{"selectedRecordIds":[],"isCurrentRecordSelected":true}',
    },
  ],
  sorts: [
    { universalIdentifier: '762b9dd5-06f6-4ded-a0f3-57ba3927aa40', fieldMetadataUniversalIdentifier: DOCUMENT_EXPIRY_FIELD_ID, direction: ViewSortDirection.ASC },
  ],
});
