import { type CoreApiClient } from 'twenty-client-sdk/core';

import { loadContractsData } from 'src/logic-functions/page-data/contracts-data';
import { loadTodayData } from 'src/logic-functions/page-data/today-data';
import { todayIso } from 'src/logic-functions/utils/dates';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';
import { loadStatementSource } from 'src/logic-functions/utils/statement-data';
import { agendaItems } from 'src/shared/agenda';
import { type Language, type SourceOptions } from 'src/shared/campaigns';
import { depositHeld, endingStage } from 'src/shared/contracts';
import { rentForMonth } from 'src/shared/rent-month';
import { statementFacts } from 'src/shared/year-statement';
import { toE164 } from 'src/shared/whatsapp-link';

// Who a "Rent & receipts" campaign goes to, worked out from the ledger and
// contracts, with the values for each person's {fields}. One row per message:
// its key ("person|thing") is what gets ticked off as sent.

export type SmartAttachment = { kind: 'receipt'; paymentId: string } | { kind: 'statement'; rentalId: string; year: number };

export type SmartRecipient = {
  key: string;
  personId: string;
  name: string;
  firstName: string;
  phone: string | null;
  language: Language;
  optedOut: boolean;
  reasons: string[];
  values: Record<string, string>;
  attachment?: SmartAttachment;
  chase?: { contractId: string; months: string[]; overdue?: string[] }; // rent due: what this message chases
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) => (iso ? `${Number(iso.slice(8, 10))} ${SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');
const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

// "Sep, Oct 2026" / "Dec 2025, Jan 2026"
const monthList = (months: string[]) => {
  const sorted = [...months].sort();
  const years = new Set(sorted.map((m) => m.slice(0, 4)));

  return years.size === 1
    ? `${sorted.map((m) => SHORT[Number(m.slice(5, 7)) - 1]).join(', ')} ${sorted[0].slice(0, 4)}`
    : sorted.map((m) => `${SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`).join(', ');
};

type PersonInfo = { id: string; name: string; firstName: string; phone: string | null; language: Language; optedOut: boolean; birthday: string | null };

const loadPeople = async (client: CoreApiClient, ids: string[] | null): Promise<Map<string, PersonInfo>> => {
  const map = new Map<string, PersonInfo>();

  if (ids && ids.length === 0) return map;

  let after: string | undefined;

  for (;;) {
    const { people: page } = (await client.query({
      people: {
        __args: { first: 200, ...(after ? { after } : {}), ...(ids ? { filter: { id: { in: ids.slice(0, 500) } } } : {}) },
        edges: {
          node: {
            id: true,
            name: { firstName: true, lastName: true },
            phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
            language: true,
            noCampaigns: true,
            birthday: true,
          },
        },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    } as never)) as {
      people?: {
        edges?: Array<{ node: { id: string; name?: { firstName?: string; lastName?: string }; phones?: never; language?: string | null; noCampaigns?: boolean | null; birthday?: string | null } }>;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string };
      };
    };

    for (const { node } of page?.edges ?? []) {
      const first = node.name?.firstName?.trim() ?? '';

      map.set(node.id, {
        id: node.id,
        name: [first, node.name?.lastName?.trim()].filter(Boolean).join(' ') || 'Someone',
        firstName: first,
        phone: toE164(node.phones ?? null),
        language: node.language === 'MS' || node.language === 'ZH' ? node.language : 'EN',
        optedOut: Boolean(node.noCampaigns),
        birthday: node.birthday ?? null,
      });
    }
    if (ids || !page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor || map.size >= 5000) break;
    after = page.pageInfo.endCursor;
  }

  return map;
};

// How tenants pay, per workspace: a workspace with its own Receipt settings
// uses its own details (never another business's), others the default's.
const loadPayTo = async (client: CoreApiClient): Promise<(ownerId: string | null) => string> => {
  try {
    const { receiptSettings } = (await client.query({
      receiptSettings: { __args: { first: 200, orderBy: [{ createdAt: 'AscNullsLast' }] }, edges: { node: { ownerId: true, paymentDetails: true } } },
    } as never)) as { receiptSettings?: { edges?: Array<{ node: { ownerId?: string | null; paymentDetails?: string | null } }> } };
    const rows = (receiptSettings?.edges ?? []).map(({ node }) => node);
    const fallback = rows.find((row) => !row.ownerId)?.paymentDetails?.trim() ?? '';

    return (ownerId) => {
      const own = ownerId ? rows.find((row) => row.ownerId === ownerId) : undefined;

      return own ? (own.paymentDetails?.trim() ?? '') : fallback;
    };
  } catch {
    return () => '';
  }
};

const ownerOk = (scope: Scope, options: SourceOptions, ownerId: string | null) =>
  inScope(scope, ownerId) && (!options.ownerIds?.length || options.ownerIds.includes(ownerId ?? ''));

const recipient = (
  person: PersonInfo | undefined,
  personId: string,
  key: string,
  reasons: string[],
  values: Record<string, string>,
  attachment?: SmartAttachment,
): SmartRecipient => ({
  key,
  personId,
  name: person?.name ?? 'Tenant',
  firstName: person?.firstName ?? '',
  phone: person?.phone ?? null,
  language: person?.language ?? 'EN',
  optedOut: person?.optedOut ?? false,
  reasons,
  values: { name: person?.firstName ?? '', ...values },
  attachment,
});

// Payments of a type in a date window (receipts to send / thank-yous).
const loadPayments = async (client: CoreApiClient, statusIn: string[], from: string) => {
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: {
        filter: { paymentType: { eq: 'RENT' }, status: { in: statusIn }, paidOn: { gte: from } } as never,
        first: 500,
        orderBy: [{ paidOn: 'AscNullsLast' }],
      },
      edges: {
        node: {
          id: true,
          status: true,
          receiptNumber: true,
          rentPeriod: true,
          paidOn: true,
          ownerId: true,
          tenantId: true,
          amount: { amountMicros: true },
          receiptFile: { fileId: true },
          property: { name: true },
        },
      },
    },
  });

  return (rentPayments?.edges ?? []).map(({ node }) => node);
};

export const buildSmartRecipients = async (
  client: CoreApiClient,
  scope: Scope,
  source: string,
  options: SourceOptions,
  // Rows already ticked off this round: a receipt marked sent stays listed.
  handled: Set<string> = new Set(),
): Promise<SmartRecipient[]> => {
  const today = todayIso();
  const list: SmartRecipient[] = [];

  if (source === 'RENT_DUE') {
    const data = await loadTodayData(client, scope);
    const items = agendaItems({ ...data, paid: new Set(data.paid) }, today).filter(
      (i) => (i.kind === 'overdue' || (options.status === 'due' && i.kind === 'due' && i.date <= addDays(today, 7))) && i.contract,
    );
    const byContract = new Map<string, typeof items>();

    for (const item of items) {
      const contract = item.contract as NonNullable<typeof item.contract>;

      if (!contract.tenantId || !ownerOk(scope, options, contract.ownerId)) continue;
      byContract.set(contract.id, [...(byContract.get(contract.id) ?? []), item]);
    }

    const people = await loadPeople(client, [...new Set([...byContract.values()].map((rows) => rows[0].contract?.tenantId as string))]);
    const payTo = await loadPayTo(client);

    for (const [contractId, rows] of byContract) {
      const contract = rows[0].contract as NonNullable<(typeof rows)[0]['contract']>;
      const tenantId = contract.tenantId as string;
      const owed = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
      const oldest = rows[0].date;

      // A new month owed makes it a new message (key changes).
      list.push({
        ...recipient(people.get(tenantId), tenantId, `${tenantId}|${contractId}|${[...rows.map((r) => r.month as string)].sort().pop()}`, [`Tenant · ${contract.propertyName}`, `${rows.length} month${rows.length === 1 ? '' : 's'}`], {
          property: contract.propertyName,
          amount_owed: rm(owed),
          months: monthList(rows.map((r) => r.month as string)),
          due_date: day(oldest),
          days_late: String(Math.max(0, daysBetween(oldest, today))),
          rent: rm(rentForMonth(contract, today)),
          pay_to: payTo(contract.ownerId ?? null),
        }),
        chase: { contractId, months: rows.map((r) => r.month as string), overdue: rows.filter((r) => r.kind === 'overdue').map((r) => r.month as string) },
      });
    }

    return list;
  }

  if (source === 'RECEIPTS' || source === 'THANK_YOU') {
    const days = Math.max(1, Math.min(366, options.days ?? (source === 'RECEIPTS' ? 60 : 14)));
    const payments = (await loadPayments(client, ['ISSUED', 'SENT'], addDays(today, -days))).filter(
      (p) =>
        p.tenantId &&
        ownerOk(scope, options, p.ownerId ?? null) &&
        (source === 'THANK_YOU' ||
          (((p.receiptFile as unknown as unknown[] | null) ?? []).length > 0 && (p.status === 'ISSUED' || handled.has(`${p.tenantId}|${p.id}`)))),
    );
    const people = await loadPeople(client, [...new Set(payments.map((p) => p.tenantId as string))]);
    const seen = new Set<string>();

    // Thank-yous are for the latest payment.
    for (const p of source === 'THANK_YOU' ? [...payments].reverse() : payments) {
      const tenantId = p.tenantId as string;
      const person = people.get(tenantId);

      // Thank-yous: one per tenant, and not to people who opted out.
      if (source === 'THANK_YOU' && (seen.has(tenantId) || person?.optedOut)) continue;
      seen.add(tenantId);

      const values = {
        property: p.property?.name ?? '',
        receipt_no: p.receiptNumber ?? '',
        amount: rm((p.amount?.amountMicros ?? 0) / 1_000_000),
        month: p.rentPeriod ? monthName(p.rentPeriod) : '',
        paid_on: day(p.paidOn),
      };

      list.push(
        recipient(
          person,
          tenantId,
          source === 'RECEIPTS' ? `${tenantId}|${p.id}` : `${tenantId}|thanks`,
          [`${p.receiptNumber ?? 'Payment'} · ${values.month || values.paid_on}`],
          values,
          source === 'RECEIPTS' ? { kind: 'receipt', paymentId: p.id } : undefined,
        ),
      );
    }

    return list;
  }

  if (source === 'RENEWALS' || source === 'RENT_CHANGE' || source === 'STATEMENTS') {
    const { contracts } = await loadContractsData(client, scope);
    const year = options.year ?? (Number(today.slice(5, 7)) <= 3 ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4)));
    const picked = contracts.filter((x) => {
      if (!x.tenantId || !ownerOk(scope, options, x.ownerId)) return false;
      if (source === 'RENEWALS') {
        const stage = endingStage(x, today);

        return stage !== 'none' && stage !== 'ended' && x.endDate !== null && daysBetween(today, x.endDate) <= (options.days ?? 90);
      }
      if (source === 'RENT_CHANGE') return x.status === 'ACTIVE' && Boolean(x.newRent && x.newRentFrom && x.newRentFrom.slice(0, 7) > today.slice(0, 7) && daysBetween(today, x.newRentFrom) <= (options.days ?? 90));

      // Statements: contracts that ran during the year.
      return x.status !== 'DRAFT' && (!x.startDate || x.startDate.slice(0, 4) <= String(year)) && (!x.endDate || x.endDate.slice(0, 4) >= String(year));
    });
    const people = await loadPeople(client, [...new Set(picked.map((x) => x.tenantId as string))]);

    for (const x of picked) {
      const tenantId = x.tenantId as string;

      if (source === 'RENEWALS') {
        const nextStart = addDays(x.endDate as string, 1);

        list.push(
          recipient(people.get(tenantId), tenantId, `${tenantId}|${x.id}`, [`Ends ${day(x.endDate)}`, x.propertyName], {
            property: x.propertyName,
            contract_end: day(x.endDate),
            days_left: String(daysBetween(today, x.endDate as string)),
            new_rent: rm(rentForMonth(x, nextStart)),
            rent: rm(rentForMonth(x, today)),
            deposit: rm(depositHeld(x.deposit)),
          }),
        );
      } else if (source === 'RENT_CHANGE') {
        list.push(
          recipient(people.get(tenantId), tenantId, `${tenantId}|${x.id}`, [`From ${monthName(x.newRentFrom as string)}`, x.propertyName], {
            property: x.propertyName,
            old_rent: rm(x.rent),
            new_rent: rm(x.newRent ?? 0),
            from_month: monthName(x.newRentFrom as string),
          }),
        );
      } else {
        const sourceData = await loadStatementSource(client, scope, x.id, year);
        const total = sourceData ? statementFacts(sourceData).total : 0;

        if (!total) continue;
        list.push(
          recipient(
            people.get(tenantId),
            tenantId,
            `${tenantId}|${x.id}|${year}`,
            [`${year} statement`, x.propertyName],
            { property: x.propertyName, year: String(year), total_paid: rm(total) },
            { kind: 'statement', rentalId: x.id, year },
          ),
        );
      }
    }

    return list;
  }

  if (source === 'BIRTHDAYS') {
    const people = await loadPeople(client, null);
    const tenants = scope.all ? null : new Set((await loadContractsData(client, scope)).contracts.map((x) => x.tenantId));

    for (const person of people.values()) {
      if (!person.birthday || person.optedOut || person.birthday.slice(5, 10) !== today.slice(5, 10)) continue;
      if (tenants && !tenants.has(person.id)) continue;
      list.push(recipient(person, person.id, `${person.id}|birthday`, ['Birthday today'], {}));
    }
  }

  return list;
};
