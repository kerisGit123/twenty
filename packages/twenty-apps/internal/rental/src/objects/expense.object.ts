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
import { EXPENSE_NO_BILL_FIELD_ID } from 'src/constants/universal-identifiers-v3';
import { EXPENSE_CATEGORIES, expenseGroup } from 'src/shared/expense-categories';

const METHOD_OPTION_IDS = [
  '7a84969b-5f58-46a6-8202-4dd7ce13cf67', '061eabe5-bd07-40fc-810d-f78933a3c937',
  'cb6cf9ca-6bc0-4a10-9baf-406f85a6d9f2', 'a8a77710-cc66-4fc4-ba00-81ae898e2c1a',
  'be85e745-84f5-4953-adcb-47bc431873f2', '9bab8bfb-36b1-4c04-8493-0e4794856bae',
];

// Money out — everyday, property or business — in a workspace, optionally
// for a property, with the bill/receipt attached.
export default defineObject({
  universalIdentifier: EXPENSE_OBJECT_ID,
  nameSingular: 'expense',
  namePlural: 'expenses',
  labelSingular: 'Expense',
  labelPlural: 'Expenses',
  description: 'Money spent, grouped by workspace and property',
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
      // Grouped (taxes, utilities, upkeep...) and coloured by group.
      options: EXPENSE_CATEGORIES.map((category, index) => ({
        id: category.id,
        value: category.value,
        label: category.label,
        position: index,
        color: expenseGroup(category.value).color,
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
        ['EWALLET', 'E-wallet', 'turquoise'],
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
      universalIdentifier: EXPENSE_NO_BILL_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'noBillNeeded',
      label: 'No bill available',
      description: 'Tick when there is no bill or receipt, so it stops showing as missing.',
      icon: 'IconReceiptOff',
      defaultValue: false,
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
