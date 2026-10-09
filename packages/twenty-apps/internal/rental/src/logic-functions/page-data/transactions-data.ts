import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type Expense, loadExpensesData, type Option } from 'src/logic-functions/page-data/expenses-data';
import { queryAll } from 'src/logic-functions/utils/query-all';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';

// Transactions page data, limited to the caller's workspaces: money received
// (issued, sent and voided receipts, deposits kept at move-out and other
// recorded income), money
// spent (expenses) and the register of receipt numbers with any gaps.

export type MoneyIn = {
  id: string; // payment id, income id, or kept:<rental id> for a kept deposit
  date: string; // paid on (kept deposits: the day it was settled)
  status: string; // ISSUED | SENT | VOID | KEPT | RECORDED (income)
  type: string; // RENT | DEPOSIT | UTILITY_DEPOSIT | DEPOSIT_KEPT | INCOME
  category: string | null; // income only: LATE_FEE, REFUND...
  method: string | null;
  amount: number;
  receiptNumber: string;
  receiptDate: string | null;
  month: string | null; // rent for month
  tenantName: string;
  propertyName: string;
  ownerId: string | null;
  ownerName: string;
  notes: string;
  hasFile: boolean;
};

// Receipt numbers missing from a series (e.g. RCP-2026: 0004 never issued,
// or its payment was deleted).
export type ReceiptGap = { series: string; missing: string[]; more: number };

export type TransactionsData = {
  moneyIn: MoneyIn[];
  moneyOut: Expense[];
  gaps: ReceiptGap[];
  // For the "Add income" form.
  owners: Option[];
  properties: Option[];
};

type IncomeNode = {
  id: string;
  name?: string | null;
  incomeDate?: string | null;
  amount?: { amountMicros?: number | null } | null;
  category?: string | null;
  method?: string | null;
  receivedFrom?: string | null;
  notes?: string | null;
  ownerId?: string | null;
  owner?: { name?: string | null } | null;
  property?: { name?: string | null; ownerId?: string | null } | null;
  attachment?: Array<{ url?: string | null }> | null;
};

type PaymentNode = {
  id: string;
  status?: string | null;
  paymentType?: string | null;
  method?: string | null;
  amount?: { amountMicros?: number | null } | null;
  receiptNumber?: string | null;
  receiptDate?: string | null;
  paidOn?: string | null;
  rentPeriod?: string | null;
  notes?: string | null;
  ownerId?: string | null;
  owner?: { name?: string | null } | null;
  tenant?: { name?: { firstName?: string | null; lastName?: string | null } | null } | null;
  property?: { name?: string | null; ownerId?: string | null } | null;
  receiptFile?: Array<{ url?: string | null }> | null;
};

type RentalNode = {
  id: string;
  ownerId?: string | null;
  owner?: { name?: string | null } | null;
  property?: { name?: string | null; ownerId?: string | null } | null;
  tenant?: { name?: { firstName?: string | null; lastName?: string | null } | null } | null;
  depositSettlement?: unknown;
};

const fullName = (name?: { firstName?: string | null; lastName?: string | null } | null) =>
  [name?.firstName, name?.lastName].filter(Boolean).join(' ');

const nextDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
};

// 'RCP-2026-0012' -> { series: 'RCP-2026', number: 12, width: 4 }
const parseReceiptNumber = (value: string) => {
  const match = /^(.+-\d{4})-(\d+)$/.exec(value.trim());

  return match ? { series: match[1], number: Number(match[2]), width: match[2].length } : null;
};

const MAX_LISTED = 20;

export const receiptGaps = (all: string[], seriesWanted: Set<string>): ReceiptGap[] => {
  const bySeries = new Map<string, { numbers: Set<number>; width: number }>();

  for (const value of all) {
    const parsed = parseReceiptNumber(value);

    if (!parsed || !seriesWanted.has(parsed.series)) continue;
    const entry = bySeries.get(parsed.series) ?? { numbers: new Set<number>(), width: parsed.width };

    entry.numbers.add(parsed.number);
    entry.width = Math.max(entry.width, parsed.width);
    bySeries.set(parsed.series, entry);
  }

  const gaps: ReceiptGap[] = [];

  for (const [series, { numbers, width }] of [...bySeries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const missing: string[] = [];
    const highest = Math.max(...numbers);

    for (let n = 1; n < highest; n++) if (!numbers.has(n)) missing.push(`${series}-${String(n).padStart(width, '0')}`);
    if (missing.length) gaps.push({ series, missing: missing.slice(0, MAX_LISTED), more: Math.max(0, missing.length - MAX_LISTED) });
  }

  return gaps;
};

const loadPayments = (client: CoreApiClient) =>
  queryAll<PaymentNode>(
    client,
    'rentPayments',
    { filter: { status: { in: ['ISSUED', 'SENT', 'VOID'] } }, orderBy: [{ paidOn: 'DescNullsLast' }] },
    {
      id: true,
      status: true,
      paymentType: true,
      method: true,
      amount: { amountMicros: true },
      receiptNumber: true,
      receiptDate: true,
      paidOn: true,
      rentPeriod: true,
      notes: true,
      ownerId: true,
      owner: { name: true },
      tenant: { name: { firstName: true, lastName: true } },
      property: { name: true, ownerId: true },
      receiptFile: { url: true },
    },
  );

// Every receipt number ever claimed (drafts and waivers can hold one too).
const loadReceiptNumbers = async (client: CoreApiClient) =>
  (await queryAll<{ receiptNumber?: string | null }>(client, 'rentPayments', { filter: { receiptNumber: { like: '%-%' } } }, { receiptNumber: true }))
    .map((p) => p.receiptNumber ?? '')
    .filter(Boolean);

const loadIncome = (client: CoreApiClient, from: string, to: string) =>
  queryAll<IncomeNode>(
    client,
    'incomes',
    { filter: { and: [{ incomeDate: { gte: from } }, { incomeDate: { lt: to } }] } },
    {
      id: true,
      name: true,
      incomeDate: true,
      amount: { amountMicros: true },
      category: true,
      method: true,
      receivedFrom: true,
      notes: true,
      ownerId: true,
      owner: { name: true },
      property: { name: true, ownerId: true },
      attachment: { url: true },
    },
  );


// Deposits kept at move-out count as money received on the day they were settled.
const loadKeptDeposits = (client: CoreApiClient, from: string, to: string) =>
  queryAll<RentalNode>(
    client,
    'rentals',
    { filter: { and: [{ depositRefundedOn: { gte: from } }, { depositRefundedOn: { lt: to } }] } },
    {
      id: true,
      ownerId: true,
      owner: { name: true },
      property: { name: true, ownerId: true },
      tenant: { name: { firstName: true, lastName: true } },
      depositSettlement: true,
    },
  );

// from and to are both included (YYYY-MM-DD).
export const loadTransactionsData = async (client: CoreApiClient, scope: Scope, from: string, to: string): Promise<TransactionsData> => {
  const end = nextDay(to);
  const [payments, numbers, income, kept, expenses] = await Promise.all([
    loadPayments(client),
    loadReceiptNumbers(client),
    loadIncome(client, from, end),
    loadKeptDeposits(client, from, end),
    loadExpensesData(client, scope, from, end),
  ]);
  const inRange = (iso: string | null | undefined) => !!iso && iso >= from && iso < end;

  const moneyIn: MoneyIn[] = [];
  // Series the caller issued receipts in during the period (checked for gaps
  // against every receipt, so another workspace's numbers aren't "missing").
  const seriesWanted = new Set<string>();

  for (const p of payments) {
    const ownerId = p.ownerId ?? p.property?.ownerId ?? null;

    if (!inScope(scope, ownerId)) continue;
    const date = p.paidOn ?? p.receiptDate ?? null;

    if (p.receiptNumber && inRange(p.receiptDate ?? date)) {
      const parsed = parseReceiptNumber(p.receiptNumber);

      if (parsed) seriesWanted.add(parsed.series);
    }
    if (!date || !inRange(date)) continue;

    moneyIn.push({
      id: p.id,
      date,
      status: p.status ?? 'ISSUED',
      type: p.paymentType ?? 'RENT',
      category: null,
      method: p.method ?? null,
      amount: (p.amount?.amountMicros ?? 0) / 1_000_000,
      receiptNumber: p.receiptNumber ?? '',
      receiptDate: p.receiptDate ?? null,
      month: p.rentPeriod ?? null,
      tenantName: fullName(p.tenant?.name),
      propertyName: p.property?.name ?? '',
      ownerId,
      ownerName: p.owner?.name ?? '',
      notes: p.notes ?? '',
      hasFile: Boolean(p.receiptFile?.some((file) => file?.url)),
    });
  }

  for (const r of kept) {
    const settlement = r.depositSettlement as { kept?: number; settledOn?: string } | null;
    const ownerId = r.ownerId ?? r.property?.ownerId ?? null;

    if (!settlement?.kept || settlement.kept <= 0 || !settlement.settledOn || !inScope(scope, ownerId)) continue;
    moneyIn.push({
      id: `kept:${r.id}`,
      date: settlement.settledOn,
      status: 'KEPT',
      type: 'DEPOSIT_KEPT',
      category: null,
      method: null,
      amount: settlement.kept,
      receiptNumber: '',
      receiptDate: null,
      month: null,
      tenantName: fullName(r.tenant?.name),
      propertyName: r.property?.name ?? '',
      ownerId,
      ownerName: r.owner?.name ?? '',
      notes: 'Kept from the deposit at move-out',
      hasFile: false,
    });
  }

  for (const i of income) {
    const ownerId = i.ownerId ?? i.property?.ownerId ?? null;

    if (!i.incomeDate || !inScope(scope, ownerId)) continue;
    moneyIn.push({
      id: i.id,
      date: i.incomeDate,
      status: 'RECORDED',
      type: 'INCOME',
      category: i.category ?? 'OTHER',
      method: i.method ?? null,
      amount: (i.amount?.amountMicros ?? 0) / 1_000_000,
      receiptNumber: '',
      receiptDate: null,
      month: null,
      tenantName: i.receivedFrom ?? '',
      propertyName: i.property?.name ?? '',
      ownerId,
      ownerName: i.owner?.name ?? '',
      notes: [i.name, i.notes].filter(Boolean).join(' · '),
      hasFile: Boolean(i.attachment?.some((file) => file?.url)),
    });
  }

  moneyIn.sort((a, b) => b.date.localeCompare(a.date) || b.receiptNumber.localeCompare(a.receiptNumber));

  return {
    moneyIn,
    moneyOut: expenses.expenses,
    owners: expenses.owners,
    properties: expenses.properties,
    gaps: receiptGaps(numbers, seriesWanted),
  };
};
