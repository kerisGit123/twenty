// Currencies you can record an expense in, with how they're written.
// Totals are kept per currency (no conversion).

export const CURRENCIES: Array<{ code: string; symbol: string; name: string }> = [
  { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar' },
  { code: 'USD', symbol: 'US$', name: 'US dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British pound' },
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar' },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese yuan' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen' },
  { code: 'THB', symbol: '฿', name: 'Thai baht' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian rupiah' },
  { code: 'INR', symbol: '₹', name: 'Indian rupee' },
];

export const BASE_CURRENCY = 'MYR';

export const currencySymbol = (code: string | null | undefined) => CURRENCIES.find((c) => c.code === code)?.symbol ?? code ?? 'RM';

export const formatMoney = (value: number, code: string | null | undefined = BASE_CURRENCY) =>
  `${currencySymbol(code)} ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
