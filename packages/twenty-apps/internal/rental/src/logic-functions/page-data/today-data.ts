import { type CoreApiClient } from 'twenty-client-sdk/core';

import { monthStart, todayIso } from 'src/logic-functions/utils/dates';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';
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
  stampedOn: string | null;
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
  paid: string[]; // `${contractId}|YYYY-MM-01`
  people: Person[];
  documents: Doc[];
  expenses: Expense[];
};

const loadAll = async (client: CoreApiClient, today: string): Promise<TodayData> => {
  const since = monthStart(addDays(today, -186));

  const [{ rentals }, { rentPayments }, { people }, { documents }, { expenses }] = await Promise.all([
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
            monthlyRent: { amountMicros: true },
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
          filter: { paymentType: { eq: 'RENT' }, status: { in: ['ISSUED', 'SENT'] }, rentPeriod: { gte: since } },
          first: 500,
        },
        edges: { node: { rentalId: true, rentPeriod: true } },
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
  ]);

  return {
    contracts: (rentals?.edges ?? []).map(({ node }) => ({
      id: node.id,
      status: (node.status as string) ?? '',
      startDate: node.startDate ?? null,
      endDate: node.endDate ?? null,
      dueDay: node.dueDay ?? 1,
      rent: money(node.monthlyRent),
      stampedOn: node.stampedOn ?? null,
      ownerId: node.property?.ownerId ?? null,
      propertyName: node.property?.name ?? 'Property',
      tenantId: node.tenantId ?? null,
      tenantName: personName(node.tenant?.name) || 'Tenant',
      tenantPhone: node.tenant?.phones ?? null,
    })),
    paid: (
      (rentPayments?.edges ?? [])
        .filter(({ node }) => node.rentalId && node.rentPeriod)
        .map(({ node }) => `${node.rentalId}|${monthStart(node.rentPeriod as string)}`)
    ),
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
    documents: data.documents.filter((doc) => inScope(scope, doc.ownerId)),
    expenses: data.expenses.filter((expense) => inScope(scope, expense.ownerId)),
  };
};
