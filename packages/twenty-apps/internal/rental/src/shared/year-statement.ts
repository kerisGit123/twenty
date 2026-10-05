// Tenant year statement: which months' rent was received in a year, the
// total, and which months (if any) are still owed. Built from the contract and
// its issued receipts; the wording comes from the statement template (English
// or Malay), see src/shared/doc-template.

export type StatementSource = {
  year: number;
  today: string; // YYYY-MM-DD
  landlordName: string;
  landlordDetails: string; // address lines
  rental: {
    propertyType: string | null;
    startDate: string | null;
    endDate: string | null;
    stampedOn: string | null;
    tenantName: string;
    tenantDetails: string; // name/company, reg no., address — one per line
    statementNote: string;
  };
  // RENT receipts; month = YYYY-MM; fromDeposit = taken from the deposit.
  payments: Array<{ month: string; amount: number; fromDeposit?: boolean }>;
};

export type StatementFacts = {
  tenantName: string;
  tenantLines: string[];
  isShop: boolean;
  rows: Array<{ index: number; amount: number }>; // month index 0-11
  total: number;
  unpaidMonths: number[]; // month indexes still owed
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

  for (const payment of source.payments) {
    if (!payment.month.startsWith(prefix)) continue;

    const index = Number(payment.month.slice(5, 7)) - 1;

    byMonth.set(index, (byMonth.get(index) ?? 0) + payment.amount);
    if (payment.fromDeposit) fromDeposit.add(index);
  }

  const rows = [...byMonth.entries()].sort(([a], [b]) => a - b).map(([index, amount]) => ({ index, amount }));

  // Months the contract ran this year (up to this month) with nothing received.
  const first = rental.startDate && rental.startDate > `${prefix}-01-01` ? Number(rental.startDate.slice(5, 7)) - 1 : 0;
  const endCap = rental.endDate && rental.endDate.startsWith(prefix) ? Number(rental.endDate.slice(5, 7)) - 1 : 11;
  const todayCap = source.today.startsWith(prefix) ? Number(source.today.slice(5, 7)) - 1 : source.today < prefix ? -1 : 11;
  const outsideContract =
    (rental.startDate !== null && rental.startDate.slice(0, 4) > prefix) || (rental.endDate !== null && rental.endDate.slice(0, 4) < prefix);
  const unpaidMonths: number[] = [];

  if (!outsideContract) {
    for (let index = first; index <= Math.min(endCap, todayCap); index += 1) {
      if (!byMonth.has(index)) unpaidMonths.push(index);
    }
  }

  return {
    tenantName,
    tenantLines: tenantLines.length ? tenantLines : [tenantName],
    isShop: rental.propertyType === 'SHOP',
    rows,
    total: rows.reduce((sum, row) => sum + row.amount, 0),
    unpaidMonths,
    fromDepositMonths: [...fromDeposit].sort((a, b) => a - b),
    startedBy: rental.startDate && rental.startDate.slice(0, 4) <= prefix ? rental.startDate : null,
    endedBy: rental.endDate && rental.endDate.slice(0, 4) <= prefix ? rental.endDate : null,
    extraNotes: lines(rental.statementNote),
  };
};
