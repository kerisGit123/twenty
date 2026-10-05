import { type CoreApiClient } from 'twenty-client-sdk/core';

import { monthStart, nextMonthStart, todayIso } from 'src/logic-functions/utils/dates';

type Money = { amountMicros?: number | null; currencyCode?: string | null } | null | undefined;

export type RentalRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dueDay?: number | null;
  monthlyRent?: Money;
  depositAmount?: Money;
  utilityDeposit?: Money;
  propertyId?: string | null;
  tenantId?: string | null;
  ownerId?: string | null;
  property?: {
    name?: string | null;
    ownerId?: string | null;
    monthlyRent?: Money;
    depositAmount?: Money;
  } | null;
  tenant?: { name?: { firstName?: string | null; lastName?: string | null } | null } | null;
};

const hasAmount = (money: Money) => Boolean(money?.amountMicros);

const toMoneyInput = (money: Money) => ({
  amountMicros: money?.amountMicros ?? null,
  currencyCode: money?.currencyCode || 'MYR',
});

export const loadRental = async (
  client: CoreApiClient,
  rentalId: string,
): Promise<RentalRecord | null> => {
  const { rentals } = await client.query({
    rentals: {
      __args: { filter: { id: { eq: rentalId } }, first: 1 },
      edges: {
        node: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          dueDay: true,
          monthlyRent: { amountMicros: true, currencyCode: true },
          depositAmount: { amountMicros: true, currencyCode: true },
          utilityDeposit: { amountMicros: true, currencyCode: true },
          propertyId: true,
          tenantId: true,
          ownerId: true,
          property: {
            name: true,
            ownerId: true,
            monthlyRent: { amountMicros: true, currencyCode: true },
            depositAmount: { amountMicros: true, currencyCode: true },
          },
          tenant: { name: { firstName: true, lastName: true } },
        },
      },
    },
  });

  return (rentals?.edges?.[0]?.node as RentalRecord | undefined) ?? null;
};

// Name "Property · Tenant" and rent/deposit from the property, only where
// empty; the workspace always follows the property.
export const fillRentalDefaults = async (client: CoreApiClient, rental: RentalRecord) => {
  const data: Record<string, unknown> = {};
  const tenantName = [rental.tenant?.name?.firstName, rental.tenant?.name?.lastName]
    .filter(Boolean)
    .join(' ');

  if (!rental.name?.trim()) {
    const name = [rental.property?.name, tenantName].filter(Boolean).join(' · ');

    if (name) data.name = name;
  }
  if (!hasAmount(rental.monthlyRent) && hasAmount(rental.property?.monthlyRent)) {
    data.monthlyRent = toMoneyInput(rental.property?.monthlyRent);
  }
  if (!hasAmount(rental.depositAmount) && hasAmount(rental.property?.depositAmount)) {
    data.depositAmount = toMoneyInput(rental.property?.depositAmount);
  }
  if (rental.property?.ownerId && rental.ownerId !== rental.property.ownerId) {
    data.ownerId = rental.property.ownerId;
  }

  if (Object.keys(data).length > 0) {
    await client.mutation({
      updateRental: { __args: { id: rental.id, data }, id: true },
    });
  }
};

// Property is Occupied (with that tenant) while it has an Active rental,
// otherwise Vacant with no tenant.
export const syncPropertyStatus = async (client: CoreApiClient, propertyId: string) => {
  const { rentals } = await client.query({
    rentals: {
      __args: {
        filter: { propertyId: { eq: propertyId }, status: { eq: 'ACTIVE' } },
        orderBy: [{ startDate: 'DescNullsLast' }],
        first: 1,
      },
      edges: { node: { id: true, tenantId: true } },
    },
  });
  const active = rentals?.edges?.[0]?.node;

  await client.mutation({
    updateProperty: {
      __args: {
        id: propertyId,
        data: active
          ? { status: 'OCCUPIED', tenantId: active.tenantId ?? null }
          : { status: 'VACANT', tenantId: null },
      },
      id: true,
    },
  });
};

type RentPaymentSummary = { id: string; rentPeriod?: string | null; method?: string | null };

// Most recent non-void rent payment of the rental, by rent month.
export const latestRentPayment = async (
  client: CoreApiClient,
  rentalId: string,
): Promise<RentPaymentSummary | null> => {
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: {
        filter: {
          rentalId: { eq: rentalId },
          paymentType: { eq: 'RENT' },
          status: { neq: 'VOID' },
        },
        orderBy: [{ rentPeriod: 'DescNullsLast' }],
        first: 1,
      },
      edges: { node: { id: true, rentPeriod: true, method: true } },
    },
  });

  return (rentPayments?.edges?.[0]?.node as RentPaymentSummary | undefined) ?? null;
};

// Next month to collect: the month after the last paid one, else the start
// month, else the current month.
export const nextRentPeriod = async (client: CoreApiClient, rental: RentalRecord) => {
  const latest = await latestRentPayment(client, rental.id);

  if (latest?.rentPeriod) return nextMonthStart(latest.rentPeriod);
  if (rental.startDate) return monthStart(rental.startDate);

  return monthStart(todayIso());
};

// The rental's (non-void) rent payment for a month, if any.
export const findRentPaymentForMonth = async (
  client: CoreApiClient,
  rentalId: string,
  monthIso: string,
): Promise<{ id: string; status?: string | null; receiptNumber?: string | null } | null> => {
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: {
        filter: {
          rentalId: { eq: rentalId },
          paymentType: { eq: 'RENT' },
          status: { neq: 'VOID' },
          and: [
            { rentPeriod: { gte: monthStart(monthIso) } },
            { rentPeriod: { lt: nextMonthStart(monthIso) } },
          ],
        },
        first: 1,
      },
      edges: { node: { id: true, status: true, receiptNumber: true } },
    },
  });

  return rentPayments?.edges?.[0]?.node ?? null;
};

export const rentPaymentExistsForMonth = async (
  client: CoreApiClient,
  rentalId: string,
  monthIso: string,
): Promise<boolean> => {
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: {
        filter: {
          rentalId: { eq: rentalId },
          paymentType: { eq: 'RENT' },
          status: { neq: 'VOID' },
          // Twenty allows one operator per field, so the range is split.
          and: [
            { rentPeriod: { gte: monthStart(monthIso) } },
            { rentPeriod: { lt: nextMonthStart(monthIso) } },
          ],
        },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  });

  return (rentPayments?.edges?.length ?? 0) > 0;
};

export const createDraftRentPayment = async (
  client: CoreApiClient,
  rental: RentalRecord,
  periodIso: string,
  method?: string | null,
): Promise<string | undefined> => {
  const rent = hasAmount(rental.monthlyRent) ? rental.monthlyRent : rental.property?.monthlyRent;
  const { createRentPayment } = await client.mutation({
    createRentPayment: {
      __args: {
        data: {
          status: 'DRAFT',
          paymentType: 'RENT',
          rentalId: rental.id,
          propertyId: rental.propertyId ?? null,
          tenantId: rental.tenantId ?? null,
          ownerId: rental.property?.ownerId ?? null,
          rentPeriod: monthStart(periodIso),
          amount: toMoneyInput(rent),
          ...(method ? { method } : {}),
        },
      },
      id: true,
    },
  });

  return createRentPayment?.id;
};

// When a payment is linked to a rental, copy the rental's property and tenant
// onto it and fill amount/month where empty.
export const fillPaymentFromRental = async (client: CoreApiClient, paymentId: string) => {
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: { filter: { id: { eq: paymentId } }, first: 1 },
      edges: {
        node: {
          id: true,
          rentalId: true,
          paymentType: true,
          rentPeriod: true,
          amount: { amountMicros: true, currencyCode: true },
        },
      },
    },
  });
  const payment = rentPayments?.edges?.[0]?.node;

  if (!payment?.rentalId) return;

  const rental = await loadRental(client, payment.rentalId);

  if (!rental) return;

  const data: Record<string, unknown> = {
    propertyId: rental.propertyId ?? null,
    tenantId: rental.tenantId ?? null,
    ...(rental.property?.ownerId ? { ownerId: rental.property.ownerId } : {}),
  };
  const isDeposit = payment.paymentType === 'DEPOSIT' || payment.paymentType === 'UTILITY_DEPOSIT';
  const isUtilityDeposit = payment.paymentType === 'UTILITY_DEPOSIT';

  if (!hasAmount(payment.amount)) {
    const source = isUtilityDeposit
      ? rental.utilityDeposit
      : isDeposit
      ? (hasAmount(rental.depositAmount) ? rental.depositAmount : rental.property?.depositAmount)
      : (hasAmount(rental.monthlyRent) ? rental.monthlyRent : rental.property?.monthlyRent);

    if (hasAmount(source)) data.amount = toMoneyInput(source);
  }
  if (!isDeposit && !payment.rentPeriod) {
    data.rentPeriod = await nextRentPeriod(client, rental);
  }

  await client.mutation({
    updateRentPayment: { __args: { id: payment.id, data }, id: true },
  });
};
