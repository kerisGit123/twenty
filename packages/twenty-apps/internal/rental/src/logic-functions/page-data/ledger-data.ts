import { type CoreApiClient } from 'twenty-client-sdk/core';

import { monthStart } from 'src/logic-functions/utils/dates';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';
import { type TenantPhone } from 'src/shared/whatsapp-link';

// Rent Ledger data: contracts and their rent payments in a period, limited to
// the caller's workspaces.

export type Rental = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  dueDay: number;
  rent: number; // RM
  newRent: number | null; // rent change part-way through
  newRentFrom: string | null;
  propertyName: string;
  propertyType: string | null;
  ownerId: string | null;
  tenantName: string;
  tenantPhone: TenantPhone;
};

export type Payment = {
  id: string;
  status: string;
  rentalId: string;
  month: string; // YYYY-MM-01
  amount: number; // RM
  receiptNumber: string;
  notes: string;
  paidOn: string | null;
  method: string | null;
  fileUrl: string | null;
};

export type LedgerData = { rentals: Rental[]; payments: Payment[] };

const loadRentals = async (client: CoreApiClient): Promise<Rental[]> => {
  const rentals: Rental[] = [];
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
            property: { name: true, propertyType: true, ownerId: true },
            tenant: {
              name: { firstName: true, lastName: true },
              phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
            },
          },
        },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const { node } of page?.edges ?? []) {
      if (node.status === 'DRAFT') continue;

      rentals.push({
        id: node.id,
        name: node.name ?? '',
        status: node.status ?? '',
        startDate: node.startDate ?? null,
        endDate: node.endDate ?? null,
        dueDay: node.dueDay ?? 1,
        rent: (node.monthlyRent?.amountMicros ?? 0) / 1_000_000,
        newRent: (node.newRent?.amountMicros ?? 0) / 1_000_000 || null,
        newRentFrom: node.newRentFrom ?? null,
        propertyName: node.property?.name ?? node.name ?? 'Property',
        propertyType: (node.property?.propertyType as string | null) ?? null,
        ownerId: node.property?.ownerId ?? null,
        tenantName: [node.tenant?.name?.firstName, node.tenant?.name?.lastName].filter(Boolean).join(' '),
        tenantPhone: node.tenant?.phones ?? null,
      });
    }

    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return rentals.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
};

const loadPayments = async (client: CoreApiClient, from: string, to: string): Promise<Payment[]> => {
  const payments: Payment[] = [];
  let after: string | undefined;

  for (;;) {
    const { rentPayments: page } = await client.query({
      rentPayments: {
        __args: {
          first: 200,
          ...(after ? { after } : {}),
          filter: {
            paymentType: { eq: 'RENT' },
            status: { neq: 'VOID' },
            and: [{ rentPeriod: { gte: from } }, { rentPeriod: { lt: to } }],
          },
        },
        edges: {
          node: {
            id: true,
            status: true,
            rentalId: true,
            rentPeriod: true,
            amount: { amountMicros: true },
            receiptNumber: true,
            notes: true,
            paidOn: true,
            method: true,
            receiptFile: { fileId: true, url: true },
          },
        },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const { node } of page?.edges ?? []) {
      if (!node.rentalId || !node.rentPeriod) continue;

      const files = node.receiptFile as unknown as Array<{ url?: string }> | null;

      payments.push({
        id: node.id,
        status: node.status ?? 'DRAFT',
        rentalId: node.rentalId,
        month: monthStart(node.rentPeriod),
        amount: (node.amount?.amountMicros ?? 0) / 1_000_000,
        receiptNumber: node.receiptNumber ?? '',
        notes: (node.notes as string | null) ?? '',
        paidOn: node.paidOn ?? null,
        method: node.method ?? null,
        fileUrl: files?.[0]?.url ?? null,
      });
    }

    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return payments;
};

export const loadLedgerData = async (
  client: CoreApiClient,
  scope: Scope,
  from: string,
  to: string,
): Promise<LedgerData> => {
  const [rentals, payments] = await Promise.all([loadRentals(client), loadPayments(client, from, to)]);
  const visible = rentals.filter((rental) => inScope(scope, rental.ownerId));
  const ids = new Set(visible.map((rental) => rental.id));

  return { rentals: visible, payments: payments.filter((payment) => ids.has(payment.rentalId)) };
};
