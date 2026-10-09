// Kinds of money in that aren't a rent receipt. Order matters: each one
// keeps its option id by position (INCOME_CATEGORY_OPTION_IDS), so only add
// new ones at the end.

export const INCOME_CATEGORIES: Array<{ value: string; label: string; color: string }> = [
  { value: 'LATE_FEE', label: 'Late fee', color: 'orange' },
  { value: 'DAMAGE', label: 'Damage / repair charge', color: 'red' },
  { value: 'UTILITY', label: 'Utility repayment', color: 'sky' },
  { value: 'REFUND', label: 'Refund', color: 'green' },
  { value: 'INTEREST', label: 'Bank interest', color: 'blue' },
  { value: 'BUSINESS', label: 'Business income', color: 'purple' },
  { value: 'OTHER', label: 'Other', color: 'gray' },
];

export const INCOME_METHODS: Array<{ value: string; label: string; color: string }> = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer', color: 'blue' },
  { value: 'DUITNOW', label: 'DuitNow', color: 'pink' },
  { value: 'CASH', label: 'Cash', color: 'green' },
  { value: 'CHEQUE', label: 'Cheque', color: 'orange' },
  { value: 'EWALLET', label: 'E-wallet', color: 'turquoise' },
  { value: 'OTHER', label: 'Other', color: 'gray' },
];

export const incomeCategoryLabel = (value: string | null | undefined) =>
  INCOME_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';
