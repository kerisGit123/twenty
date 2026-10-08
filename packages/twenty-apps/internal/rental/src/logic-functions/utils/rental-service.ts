import { type CoreApiClient } from 'twenty-client-sdk/core';

import { monthStart, nextMonthStart, todayIso } from 'src/logic-functions/utils/dates';
import { ARREARS_MONTHS, isRentMonth, periodStart, rentForMonth, settleMonth } from 'src/shared/rent-month';

type Money = { amountMicros?: number | null; currencyCode?: string | null } | null | undefined;

export type RentalRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dueDay?: number | null;
  monthlyRent?: Money;
  newRent?: Money;
  newRentFrom?: string | null;
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

// The rent for a month in RM: the contract's (or else the property's) rent,
// or the new rent from its start month.
export const rentalRentForMonth = (rental: RentalRecord, monthIso: string): number => {
  const base = hasAmount(rental.monthlyRent) ? rental.monthlyRent : rental.property?.monthlyRent;

  return rentForMonth(
    {
      rent: (base?.amountMicros ?? 0) / 1_000_000,
      newRent: (rental.newRent?.amountMicros ?? 0) / 1_000_000 || null,
      newRentFrom: rental.newRentFrom ?? null,
    },
    monthIso,
  );
};

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
          newRent: { amountMicros: true, currencyCode: true },
          newRentFrom: true,
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
// Contracts whose renewal has started end: the renewal takes over the rent
// from its start (run daily, and right after renewing).
export const endRenewedContracts = async (client: CoreApiClient, today = todayIso()) => {
  const { rentals } = await client.query({
    rentals: {
      __args: { filter: { status: { eq: 'ACTIVE' }, renewalOfId: { is: 'NOT_NULL' }, startDate: { lte: today } } as never, first: 200 },
      edges: { node: { renewalOfId: true } },
    },
  });
  const oldIds = [...new Set((rentals?.edges ?? []).map(({ node }) => node.renewalOfId as string | null).filter(Boolean) as string[])];
  let ended = 0;

  for (const id of oldIds) {
    const { rentals: old } = await client.query({ rentals: { __args: { filter: { id: { eq: id } }, first: 1 }, edges: { node: { id: true, status: true } } } });

    if (old?.edges?.[0]?.node?.status !== 'ACTIVE') continue;
    await client.mutation({ updateRental: { __args: { id, data: { status: 'ENDED' } as never }, id: true } });
    ended += 1;
  }

  return ended;
};

// The month whose rent period a date falls in (a contract from the 15th:
// 10 Jun is in the May period).
export const rentMonthOf = (startDate: string | null, date: string) => {
  const month = monthStart(date);

  return periodStart(startDate, month) > date ? monthStart(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString()) : month;
};

// A contract's months still owed (up to its end or this month), with what's
// left of each: for settling them from the deposit.
export const unpaidRentMonths = async (client: CoreApiClient, rentalId: string): Promise<Array<{ month: string; amount: number }>> => {
  const rental = await loadRental(client, rentalId);

  if (!rental) return [];

  const { rentPayments } = await client.query({
    rentPayments: {
      __args: { filter: { rentalId: { eq: rentalId }, paymentType: { eq: 'RENT' }, status: { neq: 'VOID' } }, first: 500 },
      edges: { node: { rentPeriod: true, status: true, amount: { amountMicros: true } } },
    },
  });
  const byMonth = new Map<string, Array<{ status: string; amount: number }>>();

  for (const { node } of rentPayments?.edges ?? []) {
    if (!node.rentPeriod) continue;
    const key = monthStart(node.rentPeriod);

    byMonth.set(key, [...(byMonth.get(key) ?? []), { status: (node.status as string) ?? '', amount: (node.amount?.amountMicros ?? 0) / 1_000_000 }]);
  }

  const term = { startDate: rental.startDate ?? null, endDate: rental.endDate ?? null };
  const today = todayIso();
  const last = term.endDate && term.endDate < today ? monthStart(term.endDate) : monthStart(today);
  const out: Array<{ month: string; amount: number }> = [];

  for (let month = monthStart(term.startDate ?? today); month <= last && out.length < 120; month = nextMonthStart(month)) {
    if (!isRentMonth(term, month)) continue;
    const settlement = settleMonth(rentalRentForMonth(rental, month), byMonth.get(month) ?? []);

    if (settlement.state !== 'paid' && settlement.state !== 'waived' && settlement.remaining > 0) out.push({ month, amount: settlement.remaining });
  }

  return out;
};

// The month a new rent payment is for: the oldest owed month that has no
// payment yet (so a gap isn't skipped), else the month after the latest.
export const nextRentPeriod = async (client: CoreApiClient, rental: RentalRecord) => {
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: { filter: { rentalId: { eq: rental.id }, paymentType: { eq: 'RENT' }, status: { neq: 'VOID' } }, first: 500 },
      edges: { node: { rentPeriod: true } },
    },
  });
  const covered = new Set((rentPayments?.edges ?? []).map(({ node }) => (node.rentPeriod ? monthStart(node.rentPeriod) : '')).filter(Boolean));
  const latest = [...covered].sort().pop();
  const today = todayIso();
  const term = { startDate: rental.startDate ?? null, endDate: rental.endDate ?? null };
  const oldest = monthStart(`${Number(today.slice(0, 4)) - Math.floor(ARREARS_MONTHS / 12)}${today.slice(4, 10)}`);
  let month = rental.startDate && monthStart(rental.startDate) > oldest ? monthStart(rental.startDate) : oldest;

  for (; month <= monthStart(today); month = nextMonthStart(month)) {
    if (isRentMonth(term, month) && !covered.has(month)) return month;
  }

  if (latest) return nextMonthStart(latest);
  if (rental.startDate) return monthStart(rental.startDate);

  return monthStart(today);
};

// After making a draft for a month: if another request made one at the same
// moment, the older draft is kept and this one removed (soft delete).
export const keepOneDraft = async (client: CoreApiClient, rentalId: string, monthIso: string, createdId: string): Promise<string> => {
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: {
        filter: {
          rentalId: { eq: rentalId },
          paymentType: { eq: 'RENT' },
          status: { eq: 'DRAFT' },
          and: [{ rentPeriod: { gte: monthStart(monthIso) } }, { rentPeriod: { lt: nextMonthStart(monthIso) } }],
        },
        first: 20,
      },
      edges: { node: { id: true, createdAt: true } },
    },
  });
  const drafts = (rentPayments?.edges ?? []).map(({ node }) => node).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  const keeper = drafts[0]?.id ?? createdId;

  if (keeper !== createdId) await client.mutation({ deleteRentPayment: { __args: { id: createdId }, id: true } });

  return keeper;
};

export type MonthPaymentRow = { id: string; status: string; amount: number; receiptNumber: string | null };

// All of the rental's (non-void) rent payments for a month: receipts, a draft,
// a waiver.
export const rentPaymentsForMonth = async (client: CoreApiClient, rentalId: string, monthIso: string): Promise<MonthPaymentRow[]> => {
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: {
        filter: {
          rentalId: { eq: rentalId },
          paymentType: { eq: 'RENT' },
          status: { neq: 'VOID' },
          and: [{ rentPeriod: { gte: monthStart(monthIso) } }, { rentPeriod: { lt: nextMonthStart(monthIso) } }],
        },
        first: 50,
      },
      edges: { node: { id: true, status: true, receiptNumber: true, amount: { amountMicros: true } } },
    },
  });

  return (rentPayments?.edges ?? []).map(({ node }) => ({
    id: node.id,
    status: (node.status as string) ?? 'DRAFT',
    amount: (node.amount?.amountMicros ?? 0) / 1_000_000,
    receiptNumber: node.receiptNumber ?? null,
  }));
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
  const rent = { amountMicros: Math.round(rentalRentForMonth(rental, periodIso) * 1_000_000), currencyCode: 'MYR' };
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

  const period = !isDeposit ? (payment.rentPeriod ?? (await nextRentPeriod(client, rental))) : null;

  if (!isDeposit && !payment.rentPeriod) data.rentPeriod = period;

  if (!hasAmount(payment.amount)) {
    if (isDeposit) {
      const source = isUtilityDeposit ? rental.utilityDeposit : hasAmount(rental.depositAmount) ? rental.depositAmount : rental.property?.depositAmount;

      if (hasAmount(source)) data.amount = toMoneyInput(source);
    } else if (period) {
      // The rent for that month, after any rent change.
      const rent = rentalRentForMonth(rental, period);

      if (rent > 0) data.amount = { amountMicros: Math.round(rent * 1_000_000), currencyCode: 'MYR' };
    }
  }

  await client.mutation({
    updateRentPayment: { __args: { id: payment.id, data }, id: true },
  });
};
