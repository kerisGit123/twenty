import { monthStart } from 'src/logic-functions/utils/dates';

// The rent owed for a month and how much of it is settled. Shared by the
// ledger, Today, the WhatsApp reminders and the year statement so they agree.

// A contract's rent, with an optional change part-way through.
export type RentTerms = { rent: number; newRent?: number | null; newRentFrom?: string | null };

export const rentForMonth = (terms: RentTerms, month: string): number =>
  terms.newRent && terms.newRentFrom && monthStart(month) >= monthStart(terms.newRentFrom) ? terms.newRent : terms.rent;

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
