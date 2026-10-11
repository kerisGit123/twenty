import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  STOCK_REQUEST_BRANCH_FIELD_ID,
  STOCK_REQUEST_DATE_FIELD_ID,
  STOCK_REQUEST_ISSUED_BY_FIELD_ID,
  STOCK_REQUEST_ISSUED_ON_FIELD_ID,
  STOCK_REQUEST_LINES_FIELD_ID,
  STOCK_REQUEST_NAME_FIELD_ID,
  STOCK_REQUEST_NOTES_FIELD_ID,
  STOCK_REQUEST_NUMBER_FIELD_ID,
  STOCK_REQUEST_OBJECT_ID,
  STOCK_REQUEST_RECEIVED_BY_FIELD_ID,
  STOCK_REQUEST_RECEIVED_ON_FIELD_ID,
  STOCK_REQUEST_REQUESTED_BY_FIELD_ID,
  STOCK_REQUEST_STATUS_FIELD_ID,
  STOCK_REQUEST_STATUS_OPTION_IDS,
} from 'src/constants/universal-identifiers-stock';
import { REQUEST_STATUSES } from 'src/shared/stock-types';

type Color = 'gray' | 'blue' | 'orange' | 'green' | 'red';

// A request from a branch for stock held at the warehouse. Issuing it records
// the take-out; the branch then confirms what arrived.
export default defineObject({
  universalIdentifier: STOCK_REQUEST_OBJECT_ID,
  nameSingular: 'stockRequest',
  namePlural: 'stockRequests',
  labelSingular: 'Branch request',
  labelPlural: 'Branch requests',
  description: 'Stock a branch asks the warehouse for, what was issued and what arrived',
  icon: 'IconTruckDelivery',
  labelIdentifierFieldMetadataUniversalIdentifier: STOCK_REQUEST_NAME_FIELD_ID,
  fields: [
    { universalIdentifier: STOCK_REQUEST_NAME_FIELD_ID, type: FieldType.TEXT, name: 'name', label: 'Request', icon: 'IconAbc' },
    { universalIdentifier: STOCK_REQUEST_NUMBER_FIELD_ID, type: FieldType.TEXT, name: 'requestNumber', label: 'Request no.', description: 'e.g. REQ-2026-0001', icon: 'IconHash', isNullable: true },
    { universalIdentifier: STOCK_REQUEST_BRANCH_FIELD_ID, type: FieldType.TEXT, name: 'branch', label: 'Branch', description: 'Who asked: Wawa, a branch...', icon: 'IconBuildingStore', isNullable: true },
    { universalIdentifier: STOCK_REQUEST_DATE_FIELD_ID, type: FieldType.DATE, name: 'requestDate', label: 'Requested on', icon: 'IconCalendar', isNullable: true },
    {
      universalIdentifier: STOCK_REQUEST_STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconProgressCheck',
      defaultValue: "'REQUESTED'",
      options: REQUEST_STATUSES.map((s, index) => ({ id: STOCK_REQUEST_STATUS_OPTION_IDS[index], value: s.value, label: s.label, position: index, color: s.color as Color })),
    },
    {
      universalIdentifier: STOCK_REQUEST_LINES_FIELD_ID,
      type: FieldType.RAW_JSON,
      name: 'lines',
      label: 'Lines',
      description: 'Items: [{ itemId, requestedUnits, issuedUnits, receivedUnits, resolved }]',
      icon: 'IconList',
      isNullable: true,
    },
    { universalIdentifier: STOCK_REQUEST_NOTES_FIELD_ID, type: FieldType.TEXT, name: 'notes', label: 'Notes', icon: 'IconNotes', isNullable: true },
    { universalIdentifier: STOCK_REQUEST_REQUESTED_BY_FIELD_ID, type: FieldType.TEXT, name: 'requestedBy', label: 'Requested by', icon: 'IconUser', isNullable: true },
    { universalIdentifier: STOCK_REQUEST_ISSUED_ON_FIELD_ID, type: FieldType.DATE, name: 'issuedOn', label: 'Issued on', icon: 'IconCalendar', isNullable: true },
    { universalIdentifier: STOCK_REQUEST_ISSUED_BY_FIELD_ID, type: FieldType.TEXT, name: 'issuedBy', label: 'Issued by', icon: 'IconUser', isNullable: true },
    { universalIdentifier: STOCK_REQUEST_RECEIVED_ON_FIELD_ID, type: FieldType.DATE, name: 'receivedOn', label: 'Received on', icon: 'IconCalendar', isNullable: true },
    { universalIdentifier: STOCK_REQUEST_RECEIVED_BY_FIELD_ID, type: FieldType.TEXT, name: 'receivedBy', label: 'Received by', icon: 'IconUser', isNullable: true },
  ],
});
