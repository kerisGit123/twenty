import { type CoreApiClient } from 'twenty-client-sdk/core';

import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { todayIso } from 'src/logic-functions/utils/dates';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';
import { type StatementSource } from 'src/shared/year-statement';

// Reads what a tenant year statement needs: the contract, its issued rent
// receipts for the year, and the letterhead from Receipt settings. Returns
// null when the contract doesn't exist or isn't in the caller's workspaces.
export const loadStatementSource = async (
  client: CoreApiClient,
  scope: Scope,
  rentalId: string,
  year: number,
): Promise<StatementSource | null> => {
  const { rentals } = await client.query({
    rentals: {
      __args: { filter: { id: { eq: rentalId } }, first: 1 },
      edges: {
        node: {
          id: true,
          ownerId: true,
          startDate: true,
          endDate: true,
          stampedOn: true,
          monthlyRent: { amountMicros: true },
          newRent: { amountMicros: true },
          newRentFrom: true,
          tenantDetails: true,
          statementNote: true,
          tenant: { name: { firstName: true, lastName: true } },
          property: { propertyType: true, ownerId: true, monthlyRent: { amountMicros: true } },
          owner: { name: true },
        },
      },
    },
  });
  const rental = rentals?.edges?.[0]?.node;

  if (!rental || !inScope(scope, rental.ownerId ?? rental.property?.ownerId)) return null;

  const [{ rentPayments }, settings] = await Promise.all([
    client.query({
      rentPayments: {
        __args: {
          filter: { rentalId: { eq: rentalId }, paymentType: { eq: 'RENT' }, status: { in: ['ISSUED', 'SENT', 'WAIVED'] } },
          first: 500,
        },
        edges: { node: { rentPeriod: true, paidOn: true, method: true, status: true, amount: { amountMicros: true } } },
      },
    }),
    loadReceiptSettings(client),
  ]);

  return {
    year,
    today: todayIso(),
    landlordName: settings?.businessName?.trim() || rental.owner?.name || '',
    landlordDetails: settings?.businessDetails ?? '',
    rental: {
      propertyType: (rental.property?.propertyType as string | null) ?? null,
      startDate: rental.startDate ?? null,
      endDate: rental.endDate ?? null,
      stampedOn: rental.stampedOn ?? null,
      tenantName: [rental.tenant?.name?.firstName, rental.tenant?.name?.lastName].filter(Boolean).join(' '),
      tenantDetails: (rental.tenantDetails as string | null) ?? '',
      statementNote: (rental.statementNote as string | null) ?? '',
      terms: {
        rent: ((rental.monthlyRent?.amountMicros || rental.property?.monthlyRent?.amountMicros) ?? 0) / 1_000_000,
        newRent: (rental.newRent?.amountMicros ?? 0) / 1_000_000 || null,
        newRentFrom: rental.newRentFrom ?? null,
      },
    },
    // The month a receipt is for: its rent period, else when it was paid.
    payments: (rentPayments?.edges ?? [])
      .map(({ node }) => ({
        month: (node.rentPeriod ?? node.paidOn ?? '').slice(0, 7),
        amount: (node.amount?.amountMicros ?? 0) / 1_000_000,
        fromDeposit: (node.method as string | null) === 'FROM_DEPOSIT',
        waived: (node.status as string | null) === 'WAIVED',
      }))
      .filter((payment) => payment.month.length === 7),
  };
};
