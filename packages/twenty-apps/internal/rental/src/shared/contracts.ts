// Contracts page rules: when a contract counts as ending soon, and how much
// deposit is still held (and what settling it at move-out leaves to refund).

import { type TenantPhone } from 'src/shared/whatsapp-link';

export type DepositInfo = {
  agreed: number; // security deposit in the agreement
  utilityAgreed: number;
  received: number; // security deposit receipts
  utilityReceived: number;
  carriedIn: number; // brought over from the contract this one renews
  usedForRent: number; // rent paid from the deposit
  usedMonths: string[]; // YYYY-MM
  refunded: number;
  refundedOn: string | null;
  status: string; // NOT_RECEIVED | HELD | PARTLY_REFUNDED | REFUNDED | FORFEITED | CARRIED
  notes: string;
  settlement: DepositSettlement | null; // set when settled at move-out
};

// A deposit settled at move-out.
export type DepositSettlement = {
  settledOn: string; // YYYY-MM-DD
  rent: Array<{ month: string; amount: number; paymentId?: string }>; // unpaid rent taken from the deposit (receipts made)
  deductions: Deduction[]; // other deductions
  kept: number; // of those, what the deposit covered: kept by you — rental income
  owed: number; // deductions the deposit didn't cover: the tenant still owes this
  refund: number;
};

export type ContractCard = {
  id: string;
  name: string;
  status: string; // DRAFT | ACTIVE | ENDED
  propertyId: string | null;
  propertyName: string;
  propertyType: string | null;
  tenantId: string | null;
  tenantName: string;
  tenantPhone: TenantPhone;
  tenantDetails: string;
  ownerId: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDay: number;
  rent: number;
  newRent: number | null;
  newRentFrom: string | null;
  stampedOn: string | null;
  docTypes: string[]; // document types on file (incl. ones carried from the renewed contract)
  docCount: number; // documents filed on this contract
  renewalOfId: string | null;
  renewedById: string | null; // the contract that renews this one
  deposit: DepositInfo;
};

export type ContractsData = { contracts: ContractCard[] };

const SETTLED = ['PARTLY_REFUNDED', 'REFUNDED', 'FORFEITED', 'CARRIED'];

export const isDepositSettled = (deposit: DepositInfo) => SETTLED.includes(deposit.status);

// Money in (receipts + carried over) less rent taken from it; nothing once
// refunded, forfeited or carried to a renewal.
export const depositHeld = (deposit: DepositInfo): number =>
  isDepositSettled(deposit)
    ? 0
    : Math.max(0, Math.round((deposit.carriedIn + deposit.received + deposit.utilityReceived - deposit.usedForRent) * 100) / 100);

export type Deduction = { label: string; amount: number };

const r2 = (value: number) => Math.round(value * 100) / 100;

// Settling at move-out: unpaid rent comes out of the deposit first (oldest
// month first), then the other deductions; the rest is refunded. Whatever
// the deposit can't cover, the tenant still owes.
export const planSettlement = (held: number, unpaidRent: Array<{ month: string; amount: number }>, deductions: Deduction[]) => {
  let left = r2(held);
  const rent: Array<{ month: string; amount: number }> = [];

  for (const row of [...unpaidRent].sort((a, b) => a.month.localeCompare(b.month))) {
    const take = r2(Math.min(left, Math.max(0, row.amount)));

    if (take > 0) rent.push({ month: row.month, amount: take });
    left = r2(left - take);
  }

  const rentWanted = r2(unpaidRent.reduce((sum, row) => sum + Math.max(0, row.amount), 0));
  const rentTaken = r2(rent.reduce((sum, row) => sum + row.amount, 0));
  const other = r2(deductions.reduce((sum, d) => sum + Math.max(0, d.amount), 0));
  const kept = r2(Math.min(left, other));
  const refund = r2(left - kept);
  const owed = r2(rentWanted - rentTaken + other - kept);
  const status = refund <= 0 ? 'FORFEITED' : rentTaken + kept > 0 ? 'PARTLY_REFUNDED' : 'REFUNDED';

  return { rent, rentTaken, kept, refund, owed, status };
};

// Move-out: what's refunded and the resulting deposit status.
export const settleDeposit = (held: number, deductions: Deduction[]) => {
  const deducted = Math.round(deductions.reduce((sum, d) => sum + Math.max(0, d.amount), 0) * 100) / 100;
  const refund = Math.max(0, Math.round((held - deducted) * 100) / 100);
  const status = refund <= 0 ? 'FORFEITED' : deducted > 0 ? 'PARTLY_REFUNDED' : 'REFUNDED';

  return { deducted, refund, status };
};

export const daysUntil = (today: string, iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

// How soon an active contract ends: shown from 120 days out, stronger at 90
// and 60. Renewed contracts don't count.
export type EndingStage = 'none' | 'later' | 'soon' | 'urgent' | 'ended';

export const endingStage = (contract: Pick<ContractCard, 'status' | 'endDate' | 'renewedById'>, today: string): EndingStage => {
  if (contract.status !== 'ACTIVE' || !contract.endDate || contract.renewedById) return 'none';

  const days = daysUntil(today, contract.endDate);

  if (days < 0) return 'ended';
  if (days <= 60) return 'urgent';
  if (days <= 90) return 'soon';
  if (days <= 120) return 'later';

  return 'none';
};

// Same day N months later, minus one day: the end of an N-month term.
export const termEnd = (startIso: string, months: number) => {
  const [year, month, day] = startIso.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1 + months, day));

  end.setUTCDate(end.getUTCDate() - 1);

  return end.toISOString().slice(0, 10);
};

// Deductions are kept in the deposit notes, one per line: "Cleaning — RM 200.00".
const DEDUCTION_LINE = /^(.+?) — RM ([\d,]+(?:\.\d+)?)$/;

export const deductionLine = (d: Deduction) =>
  `${d.label} — RM ${d.amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const parseDeductions = (notes: string): Deduction[] =>
  notes
    .split('\n')
    .map((line) => line.trim().match(DEDUCTION_LINE))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ label: m[1], amount: Number(m[2].replace(/,/g, '')) }));
