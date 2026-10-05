import { defineView, ViewFilterOperand, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import {
  DOCUMENT_EXPIRY_FIELD_ID,
  DOCUMENT_FILES_FIELD_ID,
  DOCUMENT_GROUP_FIELD_ID,
  DOCUMENT_NAME_FIELD_ID,
  DOCUMENT_OBJECT_ID,
  DOCUMENT_OWNER_FIELD_ID,
  DOCUMENT_TYPE_FIELD_ID,
  WORKSPACE_DOCUMENTS_VIEW_ID,
} from 'src/constants/universal-identifiers-v3';

// Table shown in the Documents tab of a workspace.
export default defineView({
  universalIdentifier: WORKSPACE_DOCUMENTS_VIEW_ID,
  name: 'Workspace documents',
  objectUniversalIdentifier: DOCUMENT_OBJECT_ID,
  type: ViewType.TABLE_WIDGET,
  fields: [
    { universalIdentifier: 'f8224484-751e-49b2-ba4d-e3886a2bdcab', fieldMetadataUniversalIdentifier: DOCUMENT_NAME_FIELD_ID, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: 'c15f981a-e7af-4b7e-9d82-0d581c6e1de8', fieldMetadataUniversalIdentifier: DOCUMENT_TYPE_FIELD_ID, position: 1, isVisible: true },
    { universalIdentifier: '5556a8d0-20a9-491f-aaaa-15d3fa814649', fieldMetadataUniversalIdentifier: DOCUMENT_GROUP_FIELD_ID, position: 2, isVisible: true },
    { universalIdentifier: '78f633b9-e705-4d9a-8a00-ec6f470fb5a4', fieldMetadataUniversalIdentifier: DOCUMENT_EXPIRY_FIELD_ID, position: 3, isVisible: true },
    { universalIdentifier: '0dab2b30-a329-4170-932f-08b922b59a18', fieldMetadataUniversalIdentifier: DOCUMENT_FILES_FIELD_ID, position: 4, isVisible: true },
  ],
  // Only the rows of the record the page is showing.
  filters: [
    {
      universalIdentifier: '307add37-3f76-4ded-9d12-bda22b8b3b4a',
      fieldMetadataUniversalIdentifier: DOCUMENT_OWNER_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: '{"selectedRecordIds":[],"isCurrentRecordSelected":true}',
    },
  ],
  sorts: [
    { universalIdentifier: '3580c359-543c-470c-b92f-387d7a1463b3', fieldMetadataUniversalIdentifier: DOCUMENT_EXPIRY_FIELD_ID, direction: ViewSortDirection.ASC },
  ],
});
