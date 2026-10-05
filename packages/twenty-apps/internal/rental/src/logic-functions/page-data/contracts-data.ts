import { type CoreApiClient } from 'twenty-client-sdk/core';

import { inScope, type Scope } from 'src/logic-functions/utils/scope';
import { type ContractCard, type ContractsData } from 'src/shared/contracts';

// Contracts page data: every contract in the caller's workspaces, with what
// its deposit received, carried over and paid towards rent.

const money = (value: { amountMicros?: number | null } | null | undefined) => (value?.amountMicros ?? 0) / 1_000_000;

const loadRentals = async (client: CoreApiClient) => {
  const nodes = [];
  let after: string | undefined;

  for (;;) {
    const { rentals: page } = await client.query({
      rentals: {
        __args: { first: 200, ...(after ? { after } : {}) },
        edges: {
          node: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            dueDay: true,
            monthlyRent: { amountMicros: true },
            newRent: { amountMicros: true },
            newRentFrom: true,
            depositAmount: { amountMicros: true },
            utilityDeposit: { amountMicros: true },
            depositCarriedIn: { amountMicros: true },
            depositStatus: true,
            depositRefunded: { amountMicros: true },
            depositRefundedOn: true,
            depositNotes: true,
            stampedOn: true,
            agreement: { label: true, url: true },
            renewalOfId: true,
            tenantDetails: true,
            tenantId: true,
            propertyId: true,
            property: { name: true, propertyType: true, ownerId: true, monthlyRent: { amountMicros: true } },
            tenant: {
              name: { firstName: true, lastName: true },
              phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
            },
          },
        },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    nodes.push(...(page?.edges ?? []).map(({ node }) => node));
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return nodes;
};

// Deposit receipts, and rent paid from the deposit.
const loadDepositPayments = async (client: CoreApiClient) => {
  const rows: Array<{ rentalId: string; type: string; method: string; amount: number; month: string }> = [];
  let after: string | undefined;

  for (;;) {
    const { rentPayments: page } = await client.query({
      rentPayments: {
        __args: {
          first: 200,
          ...(after ? { after } : {}),
          filter: {
            status: { in: ['ISSUED', 'SENT'] },
            or: [{ paymentType: { in: ['DEPOSIT', 'UTILITY_DEPOSIT'] } }, { method: { eq: 'FROM_DEPOSIT' } }],
          } as never,
        },
        edges: { node: { rentalId: true, paymentType: true, method: true, rentPeriod: true, paidOn: true, amount: { amountMicros: true } } },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const { node } of page?.edges ?? []) {
      if (!node.rentalId) continue;
      rows.push({
        rentalId: node.rentalId,
        type: (node.paymentType as string) ?? '',
        method: (node.method as string) ?? '',
        amount: money(node.amount),
        month: (node.rentPeriod ?? node.paidOn ?? '').slice(0, 7),
      });
    }
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return rows;
};

export const loadContractsData = async (client: CoreApiClient, scope: Scope): Promise<ContractsData> => {
  const [rentals, payments] = await Promise.all([loadRentals(client), loadDepositPayments(client)]);
  const renewedBy = new Map<string, string>();

  for (const node of rentals) {
    if (node.renewalOfId) renewedBy.set(node.renewalOfId as string, node.id);
  }

  const contracts: ContractCard[] = rentals
    .filter((node) => inScope(scope, node.property?.ownerId ?? null))
    .map((node) => {
      const own = payments.filter((p) => p.rentalId === node.id);
      const sum = (rows: typeof own) => rows.reduce((total, p) => total + p.amount, 0);
      const used = own.filter((p) => p.type === 'RENT' && p.method === 'FROM_DEPOSIT');

      return {
        id: node.id,
        name: node.name ?? '',
        status: (node.status as string) ?? 'DRAFT',
        propertyId: node.propertyId ?? null,
        propertyName: node.property?.name ?? node.name ?? 'Property',
        propertyType: (node.property?.propertyType as string | null) ?? null,
        tenantId: node.tenantId ?? null,
        tenantDetails: (node.tenantDetails as string | null) ?? '',
        tenantName: [node.tenant?.name?.firstName, node.tenant?.name?.lastName].filter(Boolean).join(' ') || 'Tenant',
        tenantPhone: node.tenant?.phones ?? null,
        ownerId: node.property?.ownerId ?? null,
        startDate: node.startDate ?? null,
        endDate: node.endDate ?? null,
        dueDay: node.dueDay ?? 1,
        rent: money(node.monthlyRent) || money(node.property?.monthlyRent),
        newRent: money(node.newRent) || null,
        newRentFrom: node.newRentFrom ?? null,
        stampedOn: node.stampedOn ?? null,
        agreement: ((node.agreement as unknown as Array<{ label?: string | null; url?: string | null }> | null) ?? [])
          .filter((file) => file?.url)
          .map((file) => ({ label: file.label || 'Agreement', url: file.url as string })),
        renewalOfId: (node.renewalOfId as string | null) ?? null,
        renewedById: renewedBy.get(node.id) ?? null,
        deposit: {
          agreed: money(node.depositAmount),
          utilityAgreed: money(node.utilityDeposit),
          received: sum(own.filter((p) => p.type === 'DEPOSIT')),
          utilityReceived: sum(own.filter((p) => p.type === 'UTILITY_DEPOSIT')),
          carriedIn: money(node.depositCarriedIn),
          usedForRent: sum(used),
          usedMonths: used.map((p) => p.month).filter(Boolean).sort(),
          refunded: money(node.depositRefunded),
          refundedOn: node.depositRefundedOn ?? null,
          status: (node.depositStatus as string) ?? 'NOT_RECEIVED',
          notes: (node.depositNotes as string | null) ?? '',
        },
      };
    });

  return { contracts };
};
