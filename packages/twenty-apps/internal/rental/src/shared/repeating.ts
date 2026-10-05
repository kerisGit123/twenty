// Repeating bills (quit rent, assessment, insurance, strata, subscriptions):
// an expense can repeat; the next one is suggested when it falls due and
// added with one tap.

export const REPEATS = [
  { value: 'NONE', label: 'Never', short: '', months: 0 },
  { value: 'MONTHLY', label: 'Monthly', short: 'monthly', months: 1 },
  { value: 'QUARTERLY', label: 'Every 3 months', short: 'every 3 months', months: 3 },
  { value: 'HALF_YEARLY', label: 'Every 6 months', short: 'every 6 months', months: 6 },
  { value: 'YEARLY', label: 'Yearly', short: 'yearly', months: 12 },
] as const;

export type RepeatEvery = (typeof REPEATS)[number]['value'];

export const repeatOf = (value: string | null | undefined) => REPEATS.find((r) => r.value === value) ?? REPEATS[0];

// The same day N months later (31 Jan + 1 month = 28/29 Feb).
export const nextRepeatDate = (iso: string, every: string | null | undefined): string => {
  const months = repeatOf(every).months;
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
};

// The next bill of a repeating expense that hasn't been added yet.
export type RepeatingBill = {
  id: string; // the latest expense in the series
  name: string;
  amount: number;
  currency: string;
  category: string;
  every: string;
  lastDate: string;
  nextDate: string;
  ownerId: string | null;
  propertyName: string;
};
