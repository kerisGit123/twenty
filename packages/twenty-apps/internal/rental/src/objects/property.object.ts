import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  PROPERTY_ADDRESS_FIELD_ID,
  PROPERTY_DEPOSIT_FIELD_ID,
  PROPERTY_MONTHLY_RENT_FIELD_ID,
  PROPERTY_NAME_FIELD_ID,
  PROPERTY_NOTES_FIELD_ID,
  PROPERTY_OBJECT_ID,
  PROPERTY_STATUS_FIELD_ID,
  PROPERTY_STATUS_OCCUPIED_OPTION_ID,
  PROPERTY_STATUS_VACANT_OPTION_ID,
} from 'src/constants/universal-identifiers';

// A rentable unit, e.g. "Block A-3-2" or "No. 12, Jalan Mawar".
export default defineObject({
  universalIdentifier: PROPERTY_OBJECT_ID,
  nameSingular: 'property',
  namePlural: 'properties',
  labelSingular: 'Property',
  labelPlural: 'Properties',
  description: 'A rentable property or unit',
  icon: 'IconHome',
  labelIdentifierFieldMetadataUniversalIdentifier: PROPERTY_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: PROPERTY_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description: 'Unit name or short address, e.g. Block A-3-2',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: PROPERTY_ADDRESS_FIELD_ID,
      type: FieldType.ADDRESS,
      name: 'propertyAddress',
      label: 'Address',
      icon: 'IconMapPin',
      isNullable: true,
    },
    {
      universalIdentifier: PROPERTY_MONTHLY_RENT_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'monthlyRent',
      label: 'Monthly rent',
      icon: 'IconCash',
      isNullable: true,
      defaultValue: { amountMicros: null, currencyCode: "'MYR'" },
    },
    {
      universalIdentifier: PROPERTY_DEPOSIT_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'depositAmount',
      label: 'Deposit',
      icon: 'IconShieldCheck',
      isNullable: true,
      defaultValue: { amountMicros: null, currencyCode: "'MYR'" },
    },
    {
      universalIdentifier: PROPERTY_STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconProgress',
      defaultValue: "'VACANT'",
      options: [
        {
          id: PROPERTY_STATUS_VACANT_OPTION_ID,
          value: 'VACANT',
          label: 'Vacant',
          position: 0,
          color: 'gray',
        },
        {
          id: PROPERTY_STATUS_OCCUPIED_OPTION_ID,
          value: 'OCCUPIED',
          label: 'Occupied',
          position: 1,
          color: 'green',
        },
      ],
    },
    {
      universalIdentifier: PROPERTY_NOTES_FIELD_ID,
      type: FieldType.TEXT,
      name: 'notes',
      label: 'Notes',
      icon: 'IconNotes',
      isNullable: true,
    },
  ],
});
