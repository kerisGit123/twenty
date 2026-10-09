// Tenant year statement: which months' rent was received in a year, the
// total, and which months (if any) are still owed. Built from the contract and
// its issued receipts; the wording comes from the statement template (English
// or Malay), see src/shared/doc-template.

import { rentForMonth, type RentTerms, isRentMonth } from 'src/shared/rent-month';

export type StatementSource = {
  year: number;
  today: string; // YYYY-MM-DD
  landlordName: string;
  landlordDetails: string; // address lines
  ownerId?: string | null; // the contract's workspace (its letterhead and template)
  tenantLanguage?: string | null; // EN / MS / ZH (picks a template in that language)
  rental: {
    propertyType: string | null;
    startDate: string | null;
    endDate: string | null;
    stampedOn: string | null;
    tenantName: string;
    tenantDetails: string; // name/company, reg no., address — one per line
    statementNote: string;
    terms?: RentTerms; // to tell part-paid months; without it any receipt settles a month
  };
  // RENT receipts; month = YYYY-MM; fromDeposit = taken from the deposit;
  // waived = a waiver (amount = what was waived), not money received.
  payments: Array<{ month: string; amount: number; fromDeposit?: boolean; waived?: boolean }>;
};

export type StatementFacts = {
  tenantName: string;
  tenantLines: string[];
  isShop: boolean;
  rows: Array<{ index: number; amount: number }>; // month index 0-11
  total: number;
  unpaidMonths: number[]; // month indexes still owed (nothing or only part received)
  partMonths: Array<{ index: number; received: number; remaining: number }>; // part-paid, still owed
  waivedMonths: number[]; // month indexes waived (not charged)
  fromDepositMonths: number[]; // month indexes paid from the deposit
  startedBy: string | null; // contract start, if on or before this year
  endedBy: string | null; // contract end, if on or before this year
  extraNotes: string[];
};

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const statementFacts = (source: StatementSource): StatementFacts => {
  const { year, rental } = source;
  const prefix = String(year);
  const tenantLines = lines(rental.tenantDetails);
  const tenantName = (tenantLines[0] ?? rental.tenantName) || 'Tenant';
  const byMonth = new Map<number, number>();
  const fromDeposit = new Set<number>();
  const waived = new Set<number>();

  for (const payment of source.payments) {
    if (!payment.month.startsWith(prefix)) continue;

    const index = Number(payment.month.slice(5, 7)) - 1;

    if (payment.waived) {
      waived.add(index);
      continue;
    }
    byMonth.set(index, (byMonth.get(index) ?? 0) + payment.amount);
    if (payment.fromDeposit) fromDeposit.add(index);
  }

  const rows = [...byMonth.entries()].sort(([a], [b]) => a - b).map(([index, amount]) => ({ index, amount }));

  // Months the contract ran this year (up to this month) with nothing received.
  const todayCap = source.today.startsWith(prefix) ? Number(source.today.slice(5, 7)) - 1 : source.today < prefix ? -1 : 11;
  const unpaidMonths: number[] = [];
  const partMonths: StatementFacts['partMonths'] = [];

  {
    for (let index = 0; index <= todayCap; index += 1) {
      // Only months the contract owes rent for (see isRentMonth).
      if (!isRentMonth(rental, `${prefix}-${String(index + 1).padStart(2, '0')}-01`)) continue;
      if (waived.has(index)) continue;

      const received = byMonth.get(index) ?? 0;
      const due = rental.terms ? rentForMonth(rental.terms, `${prefix}-${String(index + 1).padStart(2, '0')}-01`) : received;

      if (received <= 0) unpaidMonths.push(index);
      else if (received < due) {
        unpaidMonths.push(index);
        partMonths.push({ index, received, remaining: Math.round((due - received) * 100) / 100 });
      }
    }
  }

  return {
    tenantName,
    tenantLines: tenantLines.length ? tenantLines : [tenantName],
    isShop: rental.propertyType === 'SHOP',
    rows,
    total: rows.reduce((sum, row) => sum + row.amount, 0),
    unpaidMonths,
    partMonths,
    waivedMonths: [...waived].sort((a, b) => a - b),
    fromDepositMonths: [...fromDeposit].sort((a, b) => a - b),
    startedBy: rental.startDate && rental.startDate.slice(0, 4) <= prefix ? rental.startDate : null,
    endedBy: rental.endDate && rental.endDate.slice(0, 4) <= prefix ? rental.endDate : null,
    extraNotes: lines(rental.statementNote),
  };
};
