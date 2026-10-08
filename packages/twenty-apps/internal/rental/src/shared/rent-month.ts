import { dueDateInMonth, monthStart } from 'src/logic-functions/utils/dates';

// The rent owed for a month and how much of it is settled. Shared by the
// ledger, Today, the WhatsApp reminders and the year statement so they agree.

// A contract's rent, with an optional change part-way through.
export type RentTerms = { rent: number; newRent?: number | null; newRentFrom?: string | null };

export const rentForMonth = (terms: RentTerms, month: string): number =>
  terms.newRent && terms.newRentFrom && monthStart(month) >= monthStart(terms.newRentFrom) ? terms.newRent : terms.rent;

// ---------------------------------------------------------------- which months are owed

export type ContractTerm = { startDate: string | null; endDate: string | null };

// The day a month's rent period starts: the contract's start day in that
// month (31 Jan -> 28 Feb). A contract starting on the 1st: the 1st.
export const periodStart = (startDate: string | null, month: string) => {
  const m = monthStart(month);

  if (!startDate) return m;
  const [year, monthNumber] = m.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return `${m.slice(0, 8)}${String(Math.min(Number(startDate.slice(8, 10)), last)).padStart(2, '0')}`;
};

// Whether rent is owed for a calendar month: from the month the contract
// starts, up to the last period that begins on or before the end date. A
// 15 Jan 2026 - 14 Jan 2027 contract owes Jan-Dec 2026 (12 months), not
// January 2027 too; its renewal from 15 Jan 2027 owes January 2027.
export const isRentMonth = (contract: ContractTerm, month: string) => {
  const m = monthStart(month);

  if (contract.startDate && monthStart(contract.startDate) > m) return false;
  if (contract.endDate && periodStart(contract.startDate, m) > contract.endDate) return false;

  return true;
};

// When a month's rent is due: the due day, but never before the tenant
// moves in (due on the 1st, moving in on the 20th: due on the 20th).
export const rentDueDate = (contract: ContractTerm & { dueDay: number }, month: string) => {
  const due = dueDateInMonth(month, contract.dueDay);

  return contract.startDate && monthStart(contract.startDate) === monthStart(month) && contract.startDate > due ? contract.startDate : due;
};

// How far back unpaid months are still chased.
export const ARREARS_MONTHS = 24;

export type MonthPayment = { status: string; amount: number };

// paid: received in full; partial: something received, more owed; waived:
// the rest isn't charged; open: nothing received yet.
export type MonthState = 'paid' | 'partial' | 'waived' | 'open';

export type Settlement = { state: MonthState; received: number; remaining: number };

const round = (value: number) => Math.round(value * 100) / 100;

export const isReceipted = (status: string) => status === 'ISSUED' || status === 'SENT';

export const settleMonth = (due: number, payments: MonthPayment[]): Settlement => {
  const received = round(payments.filter((p) => isReceipted(p.status)).reduce((sum, p) => sum + p.amount, 0));

  if (payments.some((p) => p.status === 'WAIVED')) return { state: 'waived', received, remaining: 0 };
  if (received <= 0) return { state: 'open', received: 0, remaining: round(due) };

  const remaining = Math.max(0, round(due - received));

  return { state: remaining > 0 ? 'partial' : 'paid', received, remaining };
};
