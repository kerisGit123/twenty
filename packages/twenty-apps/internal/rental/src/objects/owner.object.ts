import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  OWNER_NAME_FIELD_ID,
  OWNER_NOTES_FIELD_ID,
  OWNER_OBJECT_ID,
  OWNER_REG_NO_FIELD_ID,
  OWNER_TAX_NO_FIELD_ID,
  OWNER_TYPE_COMPANY_OPTION_ID,
  OWNER_TYPE_FAMILY_OPTION_ID,
  OWNER_TYPE_FIELD_ID,
  OWNER_TYPE_INDIVIDUAL_OPTION_ID,
  OWNER_TYPE_NGO_OPTION_ID,
  OWNER_TYPE_OTHER_OPTION_ID,
} from 'src/constants/universal-identifiers-v2';

// Who owns properties and books income/expenses: Family, Company A, NGO C...
// Rent income and expenses roll up to an owner for yearly/tax reporting.
export default defineObject({
  universalIdentifier: OWNER_OBJECT_ID,
  nameSingular: 'owner',
  namePlural: 'owners',
  labelSingular: 'Owner',
  labelPlural: 'Owners',
  description: 'Who the property, income and expenses belong to (family, company, NGO)',
  icon: 'IconBriefcase',
  labelIdentifierFieldMetadataUniversalIdentifier: OWNER_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: OWNER_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: OWNER_TYPE_FIELD_ID,
      type: FieldType.SELECT,
      name: 'ownerType',
      label: 'Type',
      icon: 'IconCategory',
      isNullable: true,
      options: [
        { id: OWNER_TYPE_FAMILY_OPTION_ID, value: 'FAMILY', label: 'Family', position: 0, color: 'pink' },
        { id: OWNER_TYPE_INDIVIDUAL_OPTION_ID, value: 'INDIVIDUAL', label: 'Individual', position: 1, color: 'blue' },
        { id: OWNER_TYPE_COMPANY_OPTION_ID, value: 'COMPANY', label: 'Company', position: 2, color: 'turquoise' },
        { id: OWNER_TYPE_NGO_OPTION_ID, value: 'NGO', label: 'NGO / Society', position: 3, color: 'green' },
        { id: OWNER_TYPE_OTHER_OPTION_ID, value: 'OTHER', label: 'Other', position: 4, color: 'gray' },
      ],
    },
    {
      universalIdentifier: OWNER_REG_NO_FIELD_ID,
      type: FieldType.TEXT,
      name: 'registrationNo',
      label: 'Registration no.',
      description: 'SSM / ROS / IC number',
      icon: 'IconId',
      isNullable: true,
    },
    {
      universalIdentifier: OWNER_TAX_NO_FIELD_ID,
      type: FieldType.TEXT,
      name: 'taxNo',
      label: 'Tax no.',
      description: 'LHDN income tax number',
      icon: 'IconReceiptTax',
      isNullable: true,
    },
    {
      universalIdentifier: OWNER_NOTES_FIELD_ID,
      type: FieldType.TEXT,
      name: 'notes',
      label: 'Notes',
      icon: 'IconNotes',
      isNullable: true,
    },
  ],
});
