import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  INCOME_AMOUNT_FIELD_ID,
  INCOME_CATEGORY_FIELD_ID,
  INCOME_CATEGORY_OPTION_IDS,
  INCOME_DATE_FIELD_ID,
  INCOME_FILES_FIELD_ID,
  INCOME_FROM_FIELD_ID,
  INCOME_METHOD_FIELD_ID,
  INCOME_METHOD_OPTION_IDS,
  INCOME_NAME_FIELD_ID,
  INCOME_NOTES_FIELD_ID,
  INCOME_OBJECT_ID,
} from 'src/constants/universal-identifiers-v3';
import { INCOME_CATEGORIES, INCOME_METHODS } from 'src/shared/income-categories';

type Color = 'orange' | 'red' | 'sky' | 'green' | 'blue' | 'purple' | 'gray' | 'pink' | 'turquoise';

// Money in that isn't a rent receipt (a late fee, a damage charge, a refund,
// bank interest), recorded in a workspace, optionally for a property.
export default defineObject({
  universalIdentifier: INCOME_OBJECT_ID,
  nameSingular: 'income',
  namePlural: 'incomes',
  labelSingular: 'Income',
  labelPlural: 'Income',
  description: 'Money received other than rent receipts',
  icon: 'IconCashPlus',
  labelIdentifierFieldMetadataUniversalIdentifier: INCOME_NAME_FIELD_ID,
  fields: [
    { universalIdentifier: INCOME_NAME_FIELD_ID, type: FieldType.TEXT, name: 'name', label: 'Description', icon: 'IconAbc' },
    { universalIdentifier: INCOME_DATE_FIELD_ID, type: FieldType.DATE, name: 'incomeDate', label: 'Date', icon: 'IconCalendar', isNullable: true },
    {
      universalIdentifier: INCOME_AMOUNT_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'amount',
      label: 'Amount',
      icon: 'IconCash',
      isNullable: true,
      defaultValue: { amountMicros: null, currencyCode: "'MYR'" },
    },
    {
      universalIdentifier: INCOME_CATEGORY_FIELD_ID,
      type: FieldType.SELECT,
      name: 'category',
      label: 'Category',
      icon: 'IconCategory',
      isNullable: true,
      options: INCOME_CATEGORIES.map((c, index) => ({
        id: INCOME_CATEGORY_OPTION_IDS[index],
        value: c.value,
        label: c.label,
        position: index,
        color: c.color as Color,
      })),
    },
    {
      universalIdentifier: INCOME_FROM_FIELD_ID,
      type: FieldType.TEXT,
      name: 'receivedFrom',
      label: 'Received from',
      description: 'Tenant, bank, contractor...',
      icon: 'IconUser',
      isNullable: true,
    },
    {
      universalIdentifier: INCOME_METHOD_FIELD_ID,
      type: FieldType.SELECT,
      name: 'method',
      label: 'Method',
      icon: 'IconCreditCard',
      isNullable: true,
      options: INCOME_METHODS.map((m, index) => ({
        id: INCOME_METHOD_OPTION_IDS[index],
        value: m.value,
        label: m.label,
        position: index,
        color: m.color as Color,
      })),
    },
    {
      universalIdentifier: INCOME_FILES_FIELD_ID,
      type: FieldType.FILES,
      name: 'attachment',
      label: 'Attachment',
      icon: 'IconPaperclip',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 5 },
    },
    { universalIdentifier: INCOME_NOTES_FIELD_ID, type: FieldType.TEXT, name: 'notes', label: 'Notes', icon: 'IconNotes', isNullable: true },
  ],
});
