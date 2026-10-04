import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  EXPENSE_AMOUNT_FIELD_ID,
  EXPENSE_CATEGORY_FIELD_ID,
  EXPENSE_DATE_FIELD_ID,
  EXPENSE_METHOD_FIELD_ID,
  EXPENSE_NAME_FIELD_ID,
  EXPENSE_NOTES_FIELD_ID,
  EXPENSE_OBJECT_ID,
  EXPENSE_PAID_TO_FIELD_ID,
  EXPENSE_RECEIPT_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';

// Categories follow what Malaysian landlords usually claim against rental
// income, so yearly totals per owner line up with the tax return.
const CATEGORIES: Array<[string, string, string]> = [
  ['REPAIRS', 'Repairs and maintenance', 'orange'],
  ['ASSESSMENT_TAX', 'Assessment tax (cukai pintu)', 'blue'],
  ['QUIT_RENT', 'Quit rent (cukai tanah)', 'blue'],
  ['MANAGEMENT_FEE', 'Maintenance / sinking fund', 'purple'],
  ['WATER', 'Water', 'sky'],
  ['ELECTRICITY', 'Electricity', 'yellow'],
  ['SEWERAGE', 'Sewerage (IWK)', 'sky'],
  ['INSURANCE', 'Insurance', 'green'],
  ['LOAN_INTEREST', 'Loan interest', 'red'],
  ['AGENT_FEE', 'Agent fee', 'pink'],
  ['LEGAL_STAMP_DUTY', 'Legal fees / stamp duty', 'gray'],
  ['FURNISHING', 'Furnishing / appliances', 'turquoise'],
  ['OTHER', 'Other', 'gray'],
];

// Fixed option ids: never change them once installed.
const OPTION_IDS = [
  'd2fa8444-22f5-4c2b-8349-f944e0ead23f', '6cd40021-1484-43c1-bd05-0a3ca5b097c9',
  'c2f4dbf2-5916-4c3e-911a-a5f2e29dc1a3', '6965b137-5697-4821-a322-e801e7eded62',
  'cdbda8e7-56b2-4c48-b609-525b4832a508', 'e146ebd8-9dcf-4472-b59a-856b327b7073',
  '7f393a9c-bb93-4d55-97eb-33b8af199cc4', '89361410-2cb2-4510-a5c1-2ccfc4934606',
  '23d154b2-665f-4af4-9a6b-11d39f276e15', '554d0f61-809c-4e5c-86af-1f8d5dd3a203',
  '331aa18e-7bf1-4e58-87a0-c0b25696e997', '277bec6b-4f31-4776-a458-2f723176b863',
  'f83ca586-ab0e-4f68-afac-4ea0dc9bfa2b',
];

const METHOD_OPTION_IDS = [
  '7a84969b-5f58-46a6-8202-4dd7ce13cf67', '061eabe5-bd07-40fc-810d-f78933a3c937',
  'cb6cf9ca-6bc0-4a10-9baf-406f85a6d9f2', 'a8a77710-cc66-4fc4-ba00-81ae898e2c1a',
  'be85e745-84f5-4953-adcb-47bc431873f2',
];

// Money out: repairs, taxes, utilities... linked to an owner and optionally
// to a property, with the bill/receipt attached.
export default defineObject({
  universalIdentifier: EXPENSE_OBJECT_ID,
  nameSingular: 'expense',
  namePlural: 'expenses',
  labelSingular: 'Expense',
  labelPlural: 'Expenses',
  description: 'Money spent, grouped by owner and property',
  icon: 'IconCashOff',
  labelIdentifierFieldMetadataUniversalIdentifier: EXPENSE_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: EXPENSE_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Description',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: EXPENSE_DATE_FIELD_ID,
      type: FieldType.DATE,
      name: 'expenseDate',
      label: 'Date',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier: EXPENSE_AMOUNT_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'amount',
      label: 'Amount',
      icon: 'IconCash',
      isNullable: true,
      defaultValue: { amountMicros: null, currencyCode: "'MYR'" },
    },
    {
      universalIdentifier: EXPENSE_CATEGORY_FIELD_ID,
      type: FieldType.SELECT,
      name: 'category',
      label: 'Category',
      icon: 'IconCategory',
      isNullable: true,
      options: CATEGORIES.map(([value, label, color], index) => ({
        id: OPTION_IDS[index],
        value,
        label,
        position: index,
        color,
      })),
    },
    {
      universalIdentifier: EXPENSE_PAID_TO_FIELD_ID,
      type: FieldType.TEXT,
      name: 'paidTo',
      label: 'Paid to',
      description: 'Contractor, council, utility company...',
      icon: 'IconBuildingStore',
      isNullable: true,
    },
    {
      universalIdentifier: EXPENSE_METHOD_FIELD_ID,
      type: FieldType.SELECT,
      name: 'method',
      label: 'Paid by',
      icon: 'IconCreditCard',
      isNullable: true,
      options: [
        ['BANK_TRANSFER', 'Bank transfer', 'blue'],
        ['DUITNOW', 'DuitNow', 'pink'],
        ['CASH', 'Cash', 'green'],
        ['CARD', 'Card', 'purple'],
        ['OTHER', 'Other', 'gray'],
      ].map(([value, label, color], index) => ({
        id: METHOD_OPTION_IDS[index],
        value,
        label,
        position: index,
        color,
      })),
    },
    {
      universalIdentifier: EXPENSE_RECEIPT_FIELD_ID,
      type: FieldType.FILES,
      name: 'receipt',
      label: 'Bill / receipt',
      icon: 'IconPaperclip',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 5 },
    },
    {
      universalIdentifier: EXPENSE_NOTES_FIELD_ID,
      type: FieldType.TEXT,
      name: 'notes',
      label: 'Notes',
      icon: 'IconNotes',
      isNullable: true,
    },
  ],
});
