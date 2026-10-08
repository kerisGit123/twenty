import { type CoreApiClient } from 'twenty-client-sdk/core';

import { monthStart, todayIso } from 'src/logic-functions/utils/dates';
import { queryAll } from 'src/logic-functions/utils/query-all';
import { loadChases } from 'src/logic-functions/utils/rent-chase';
import { type ChaseInfo } from 'src/shared/rent-chase';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';
import { loadRepeatingBills } from 'src/logic-functions/utils/repeating-bills';
import { type FollowUp } from 'src/shared/contacts';
import { type RepeatingBill } from 'src/shared/repeating';
import { ARREARS_MONTHS, rentForMonth, settleMonth, type MonthPayment } from 'src/shared/rent-month';
import { toE164, type TenantPhone } from 'src/shared/whatsapp-link';

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
  campaigns: TodayCampaign[]; // scheduled or being sent, due within 30 days
  followUps: FollowUp[]; // WhatsApp follow-ups not done, due within 7 days (or late)
  chases: Record<string, ChaseInfo>; // contractId -> latest rent reminder (any channel), last 14 days
};

export type TodayCampaign = { id: string; name: string; kind: string; occasion: string; sendOn: string; status: string; sent: number; ownerId: string | null };

type Money = { amountMicros?: number | null } | null;
type RentalNode = {
  id: string;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dueDay?: number | null;
  stampedOn?: string | null;
  renewalOfId?: string | null;
  monthlyRent?: Money;
  newRent?: Money;
  newRentFrom?: string | null;
  property?: { name?: string | null; ownerId?: string | null } | null;
  tenantId?: string | null;
  tenant?: { name?: { firstName?: string | null; lastName?: string | null } | null; phones?: TenantPhone | null } | null;
};
type PaymentNode = { rentalId?: string | null; rentPeriod?: string | null; status?: string | null; amount?: Money };

const loadAll = async (client: CoreApiClient, today: string): Promise<TodayData> => {
  const since = `${Number(today.slice(0, 4)) - Math.ceil(ARREARS_MONTHS / 12)}${today.slice(4, 7)}-01`;

  const [{ rentals }, { rentPayments }, { people }, { documents }, { expenses }, bills, campaignResult, followUpResult, chases] = await Promise.all([
    // Every contract and payment (paged: a cut-off list would show paid months as overdue).
    queryAll<RentalNode>(
      client,
      'rentals',
      { filter: { status: { neq: 'DRAFT' } } },
      {
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
    ).then((edges) => ({ rentals: { edges: edges.map((node) => ({ node })) } })),
    queryAll<PaymentNode>(
      client,
      'rentPayments',
      { filter: { paymentType: { eq: 'RENT' }, status: { in: ['ISSUED', 'SENT', 'WAIVED'] }, rentPeriod: { gte: since } } },
      { rentalId: true, rentPeriod: true, status: true, amount: { amountMicros: true } },
    ).then((edges) => ({ rentPayments: { edges: edges.map((node) => ({ node })) } })),
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
    client.query({
      campaigns: {
        __args: { first: 100, filter: { status: { in: ['SCHEDULED', 'SENDING'] }, sendOn: { lte: addDays(today, 30) } } },
        edges: { node: { id: true, name: true, kind: true, occasion: true, sendOn: true, status: true, progress: true, ownerId: true } },
      },
    } as never) as Promise<{ campaigns?: { edges?: Array<{ node: Record<string, unknown> }> } }>,
    client.query({
      contactActivities: {
        __args: { first: 200, filter: { done: { eq: false }, followUpOn: { lte: addDays(today, 7) } }, orderBy: [{ followUpOn: 'AscNullsLast' }] },
        edges: {
          node: {
            id: true,
            note: true,
            followUpOn: true,
            campaignId: true,
            ownerId: true,
            personId: true,
            person: { name: { firstName: true, lastName: true }, phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true } },
          },
        },
      },
    } as never) as Promise<{ contactActivities?: { edges?: Array<{ node: Record<string, unknown> }> } }>,
    loadChases(client),
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
    chases,
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
    campaigns: (campaignResult.campaigns?.edges ?? []).map(({ node }) => ({
      id: node.id as string,
      name: (node.name as string) ?? 'Campaign',
      kind: (node.kind as string) ?? 'GREETING',
      occasion: (node.occasion as string) ?? 'CUSTOM',
      sendOn: (node.sendOn as string) ?? today,
      status: (node.status as string) ?? 'SCHEDULED',
      sent: Object.keys(((node.progress as { sent?: Record<string, string> } | null)?.sent) ?? {}).length,
      ownerId: (node.ownerId as string | null) ?? null,
    })),
    followUps: (followUpResult.contactActivities?.edges ?? [])
      .filter(({ node }) => node.personId && node.followUpOn)
      .map(({ node }) => {
        const person = node.person as { name?: { firstName?: string; lastName?: string }; phones?: never } | null;

        return {
          id: node.id as string,
          personId: node.personId as string,
          personName: [person?.name?.firstName, person?.name?.lastName].filter(Boolean).join(' ') || 'Someone',
          phone: toE164(person?.phones ?? null),
          note: (node.note as string) ?? '',
          followUpOn: node.followUpOn as string,
          campaignId: (node.campaignId as string | null) ?? null,
          ownerId: (node.ownerId as string | null) ?? null,
        };
      }),
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
    campaigns: data.campaigns.filter((campaign) => inScope(scope, campaign.ownerId)),
    followUps: data.followUps.filter((f) => scope.all || inScope(scope, f.ownerId)),
    chases: Object.fromEntries(Object.entries(data.chases).filter(([contractId]) => ids.has(contractId))),
  };
};
