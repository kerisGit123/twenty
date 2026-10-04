// Expense categories, grouped the way landlords usually think about costs.
// Used by the expense object (select options) and the Expenses page.
// Option ids are fixed once installed: never change an existing one.

export type ExpenseGroup = {
  key: string;
  label: string;
  color: string;
};

export type ExpenseCategory = {
  value: string;
  label: string;
  group: string;
  id: string;
};

export const EXPENSE_GROUPS: ExpenseGroup[] = [
  { key: 'TAXES', label: 'Property taxes', color: 'blue' },
  { key: 'BUILDING', label: 'Building charges', color: 'purple' },
  { key: 'UTILITIES', label: 'Utilities', color: 'sky' },
  { key: 'UPKEEP', label: 'Repairs & upkeep', color: 'orange' },
  { key: 'FINANCE', label: 'Finance', color: 'red' },
  { key: 'FEES', label: 'Fees', color: 'pink' },
  { key: 'FURNISHING', label: 'Furnishing & renovation', color: 'turquoise' },
  { key: 'OTHER', label: 'Other', color: 'gray' },
];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { value: 'ASSESSMENT_TAX', label: 'Assessment tax (cukai pintu)', group: 'TAXES', id: '6cd40021-1484-43c1-bd05-0a3ca5b097c9' },
  { value: 'QUIT_RENT', label: 'Quit rent (cukai tanah)', group: 'TAXES', id: 'c2f4dbf2-5916-4c3e-911a-a5f2e29dc1a3' },
  { value: 'MANAGEMENT_FEE', label: 'Maintenance fee', group: 'BUILDING', id: '6965b137-5697-4821-a322-e801e7eded62' },
  { value: 'SINKING_FUND', label: 'Sinking fund', group: 'BUILDING', id: '0b7c2a4e-6f1d-4e8a-9c35-7d2f1a8b6e01' },
  { value: 'WATER', label: 'Water', group: 'UTILITIES', id: 'cdbda8e7-56b2-4c48-b609-525b4832a508' },
  { value: 'ELECTRICITY', label: 'Electricity', group: 'UTILITIES', id: 'e146ebd8-9dcf-4472-b59a-856b327b7073' },
  { value: 'SEWERAGE', label: 'Sewerage (IWK)', group: 'UTILITIES', id: '7f393a9c-bb93-4d55-97eb-33b8af199cc4' },
  { value: 'INTERNET_TV', label: 'Internet / TV', group: 'UTILITIES', id: '3e9d5b70-2a1c-4f6b-8e47-c1d0a9f3b502' },
  { value: 'REPAIRS', label: 'Repairs', group: 'UPKEEP', id: 'd2fa8444-22f5-4c2b-8349-f944e0ead23f' },
  { value: 'CLEANING', label: 'Cleaning', group: 'UPKEEP', id: '9a4f1c63-5b8e-4d27-a0f2-6e3b7c1d8f03' },
  { value: 'PEST_CONTROL', label: 'Pest control', group: 'UPKEEP', id: 'f1c8e2a9-7d3b-4a50-96e4-2b5d0c7a1f04' },
  { value: 'GARDENING', label: 'Gardening', group: 'UPKEEP', id: '5d2b9f41-8c6e-4b13-a7d9-0f4e3a2c6b05' },
  { value: 'LOAN_INTEREST', label: 'Loan interest', group: 'FINANCE', id: '23d154b2-665f-4af4-9a6b-11d39f276e15' },
  { value: 'BANK_CHARGES', label: 'Bank charges', group: 'FINANCE', id: 'b6e0a3d8-1f4c-4e92-8b57-9c2d7f1a3e06' },
  { value: 'INSURANCE', label: 'Insurance (fire / home)', group: 'FINANCE', id: '89361410-2cb2-4510-a5c1-2ccfc4934606' },
  { value: 'AGENT_FEE', label: 'Agent fee', group: 'FEES', id: '554d0f61-809c-4e5c-86af-1f8d5dd3a203' },
  { value: 'LEGAL_STAMP_DUTY', label: 'Legal fees', group: 'FEES', id: '331aa18e-7bf1-4e58-87a0-c0b25696e997' },
  { value: 'STAMP_DUTY', label: 'Stamp duty', group: 'FEES', id: '4c7f2e95-0a8d-4b36-b1e3-5d9a6c2f8e07' },
  { value: 'ACCOUNTING', label: 'Accounting / tax agent', group: 'FEES', id: 'e8a3c1f6-9b2d-4f70-8c45-1a6e0d3b9f08' },
  { value: 'FURNISHING', label: 'Furniture & appliances', group: 'FURNISHING', id: '277bec6b-4f31-4776-a458-2f723176b863' },
  { value: 'RENOVATION', label: 'Renovation', group: 'FURNISHING', id: '7b1d4f8a-3e6c-4a29-9d05-b2c8e1f4a609' },
  { value: 'OTHER', label: 'Other', group: 'OTHER', id: 'f83ca586-ab0e-4f68-afac-4ea0dc9bfa2b' },
];

const GROUP_BY_KEY = Object.fromEntries(EXPENSE_GROUPS.map((group) => [group.key, group]));
const CATEGORY_BY_VALUE = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category.value, category]));

export const expenseCategory = (value: string | null | undefined): ExpenseCategory =>
  CATEGORY_BY_VALUE[value ?? 'OTHER'] ?? CATEGORY_BY_VALUE.OTHER;

export const expenseGroup = (value: string | null | undefined): ExpenseGroup =>
  GROUP_BY_KEY[expenseCategory(value).group] ?? GROUP_BY_KEY.OTHER;
