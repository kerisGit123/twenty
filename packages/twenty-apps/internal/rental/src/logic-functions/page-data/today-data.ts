import { type CoreApiClient } from 'twenty-client-sdk/core';

import { monthStart, todayIso } from 'src/logic-functions/utils/dates';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';
import { loadRepeatingBills } from 'src/logic-functions/utils/repeating-bills';
import { type RepeatingBill } from 'src/shared/repeating';
import { ARREARS_MONTHS, rentForMonth, settleMonth, type MonthPayment } from 'src/shared/rent-month';
import { type TenantPhone } from 'src/shared/whatsapp-link';

// Today page data, limited to the caller's workspaces. Birthdays are personal
// and always included.

const money = (value: { amountMicros?: number | null } | null | undefined) => (value?.amountMicros ?? 0) / 1_000_000;

const personName = (name: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  [name?.firstName, name?.lastName].filter(Boolean).join(' ');

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

export type Contract = {
  id: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  dueDay: number;
  rent: number;
  newRent: number | null; // rent change part-way through the contract
  newRentFrom: string | null;
  stampedOn: string | null;
  renewed: boolean; // another contract renews this one
  ownerId: string | null;
  propertyName: string;
  tenantId: string | null;
  tenantName: string;
  tenantPhone: TenantPhone;
};

export type Person = { id: string; name: string; birthday: string; phone: TenantPhone };
export type Doc = { id: string; name: string; expiresOn: string; ownerId: string | null };
export type Expense = { id: string; name: string; amount: number; hasBill: boolean; noBillNeeded: boolean; ownerId: string | null };

export type TodayData = {
  contracts: Contract[];
  paid: string[]; // settled months (paid in full or waived): `${contractId}|YYYY-MM-01`
  partial: Record<string, number>; // part-paid months: key -> amount received
  people: Person[];
  documents: Doc[];
  expenses: Expense[];
  bills: RepeatingBill[]; // next bills of repeating expenses, not yet added
};

const loadAll = async (client: CoreApiClient, today: string): Promise<TodayData> => {
  const since = `${Number(today.slice(0, 4)) - Math.ceil(ARREARS_MONTHS / 12)}${today.slice(4, 7)}-01`;

  const [{ rentals }, { rentPayments }, { people }, { documents }, { expenses }, bills] = await Promise.all([
    client.query({
      rentals: {
        __args: { filter: { status: { neq: 'DRAFT' } }, first: 200 },
        edges: {
          node: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            dueDay: true,
            stampedOn: true,
            renewalOfId: true,
            monthlyRent: { amountMicros: true },
            newRent: { amountMicros: true },
            newRentFrom: true,
            property: { name: true, ownerId: true },
            tenantId: true,
            tenant: {
              name: { firstName: true, lastName: true },
              phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
            },
          },
        },
      },
    }),
    client.query({
      rentPayments: {
        __args: {
          filter: { paymentType: { eq: 'RENT' }, status: { in: ['ISSUED', 'SENT', 'WAIVED'] }, rentPeriod: { gte: since } },
          first: 1000,
        },
        edges: { node: { rentalId: true, rentPeriod: true, status: true, amount: { amountMicros: true } } },
      },
    }),
    client.query({
      people: {
        __args: { filter: { birthday: { is: 'NOT_NULL' } }, first: 500 },
        edges: {
          node: {
            id: true,
            name: { firstName: true, lastName: true },
            birthday: true,
            phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
          },
        },
      },
    }),
    client.query({
      documents: {
        __args: { filter: { expiresOn: { lte: addDays(today, 60) } }, first: 200 },
        edges: { node: { id: true, name: true, expiresOn: true, ownerId: true } },
      },
    }),
    client.query({
      expenses: {
        __args: { filter: { expenseDate: { gte: addDays(today, -365) } }, first: 500 },
        edges: { node: { id: true, name: true, amount: { amountMicros: true }, receipt: { fileId: true }, noBillNeeded: true, ownerId: true } },
      },
    }),
    loadRepeatingBills(client),
  ]);

  const renewedIds = new Set((rentals?.edges ?? []).map(({ node }) => node.renewalOfId as string | null).filter(Boolean));
  const contracts: Contract[] = (rentals?.edges ?? []).map(({ node }) => ({
      id: node.id,
      status: (node.status as string) ?? '',
      startDate: node.startDate ?? null,
      endDate: node.endDate ?? null,
      dueDay: node.dueDay ?? 1,
      rent: money(node.monthlyRent),
      newRent: money(node.newRent) || null,
      newRentFrom: node.newRentFrom ?? null,
      stampedOn: node.stampedOn ?? null,
      renewed: renewedIds.has(node.id),
      ownerId: node.property?.ownerId ?? null,
      propertyName: node.property?.name ?? 'Property',
      tenantId: node.tenantId ?? null,
      tenantName: personName(node.tenant?.name) || 'Tenant',
      tenantPhone: node.tenant?.phones ?? null,
    }));

  // Payments per contract-month, then settled vs part-paid.
  const byMonth = new Map<string, MonthPayment[]>();

  for (const { node } of rentPayments?.edges ?? []) {
    if (!node.rentalId || !node.rentPeriod) continue;

    const key = `${node.rentalId}|${monthStart(node.rentPeriod as string)}`;

    byMonth.set(key, [...(byMonth.get(key) ?? []), { status: (node.status as string) ?? '', amount: money(node.amount) }]);
  }

  const terms = new Map(contracts.map((contract) => [contract.id, contract]));
  const paid: string[] = [];
  const partial: Record<string, number> = {};

  for (const [key, payments] of byMonth) {
    const [contractId, month] = key.split('|');
    const contract = terms.get(contractId);
    const settlement = settleMonth(contract ? rentForMonth(contract, month) : 0, payments);

    if (settlement.state === 'paid' || settlement.state === 'waived') paid.push(key);
    else if (settlement.state === 'partial') partial[key] = settlement.received;
  }

  return {
    contracts,
    paid,
    partial,
    people: (people?.edges ?? [])
      .filter(({ node }) => node.birthday)
      .map(({ node }) => ({
        id: node.id,
        name: personName(node.name) || 'Someone',
        birthday: node.birthday as string,
        phone: node.phones ?? null,
      })),
    documents: (documents?.edges ?? [])
      .filter(({ node }) => node.expiresOn)
      .map(({ node }) => ({
        id: node.id,
        name: node.name ?? 'Document',
        expiresOn: node.expiresOn as string,
        ownerId: node.ownerId ?? null,
      })),
    expenses: (expenses?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? '',
      amount: money(node.amount),
      hasBill: ((node.receipt as unknown as unknown[] | null) ?? []).length > 0,
      noBillNeeded: Boolean(node.noBillNeeded),
      ownerId: node.ownerId ?? null,
    })),
    bills,
  };
};

export const loadTodayData = async (client: CoreApiClient, scope: Scope): Promise<TodayData> => {
  const data = await loadAll(client, todayIso());
  const contracts = data.contracts.filter((contract) => inScope(scope, contract.ownerId));
  const ids = new Set(contracts.map((contract) => contract.id));

  return {
    ...data,
    contracts,
    paid: data.paid.filter((key) => ids.has(key.split('|')[0])),
    partial: Object.fromEntries(Object.entries(data.partial).filter(([key]) => ids.has(key.split('|')[0]))),
    documents: data.documents.filter((doc) => inScope(scope, doc.ownerId)),
    expenses: data.expenses.filter((expense) => inScope(scope, expense.ownerId)),
    bills: data.bills.filter((bill) => inScope(scope, bill.ownerId)),
  };
};
