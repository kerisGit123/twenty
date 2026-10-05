import { type CoreApiClient } from 'twenty-client-sdk/core';

import { inScope, type Scope } from 'src/logic-functions/utils/scope';

// Year summary data: a year's (and the year before's) receipts and expenses,
// limited to the caller's workspaces. The page adds them up per month,
// category and property.

export type YearPayment = {
  ownerId: string | null;
  propertyId: string | null;
  type: string; // RENT | DEPOSIT | UTILITY_DEPOSIT
  amount: number; // RM
  date: string; // paidOn, YYYY-MM-DD
};

export type YearExpense = {
  id: string;
  name: string;
  ownerId: string | null;
  propertyId: string | null;
  category: string;
  amount: number; // RM
  date: string; // YYYY-MM-DD
  hasBill: boolean;
};

export type YearProperty = { id: string; name: string; ownerId: string | null; status: string };

export type YearData = {
  year: number;
  payments: YearPayment[];
  expenses: YearExpense[];
  properties: YearProperty[];
};

const loadPayments = async (client: CoreApiClient, from: string, to: string): Promise<YearPayment[]> => {
  const rows: YearPayment[] = [];
  let after: string | undefined;

  for (;;) {
    const { rentPayments: page } = await client.query({
      rentPayments: {
        __args: {
          filter: { and: [{ paidOn: { gte: from } }, { paidOn: { lt: to } }, { status: { in: ['ISSUED', 'SENT'] } }] },
          first: 500,
          ...(after ? { after } : {}),
        },
        edges: { node: { ownerId: true, propertyId: true, paymentType: true, amount: { amountMicros: true }, paidOn: true } },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const { node } of page?.edges ?? []) {
      if (!node.paidOn) continue;
      rows.push({
        ownerId: node.ownerId ?? null,
        propertyId: node.propertyId ?? null,
        type: (node.paymentType as string | null) ?? 'RENT',
        amount: (node.amount?.amountMicros ?? 0) / 1_000_000,
        date: node.paidOn,
      });
    }

    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return rows;
};

const loadExpenses = async (client: CoreApiClient, from: string, to: string): Promise<YearExpense[]> => {
  const rows: YearExpense[] = [];
  let after: string | undefined;

  for (;;) {
    const { expenses: page } = await client.query({
      expenses: {
        __args: {
          filter: { and: [{ expenseDate: { gte: from } }, { expenseDate: { lt: to } }] },
          first: 500,
          ...(after ? { after } : {}),
        },
        edges: {
          node: {
            id: true,
            name: true,
            ownerId: true,
            propertyId: true,
            category: true,
            amount: { amountMicros: true, currencyCode: true },
            expenseDate: true,
            receipt: { fileId: true },
            noBillNeeded: true,
          },
        },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const { node } of page?.edges ?? []) {
      // The summary is in ringgit; expenses in other currencies aren't added in.
      if (!node.expenseDate || (node.amount?.currencyCode && node.amount.currencyCode !== 'MYR')) continue;

      const files = (node.receipt as unknown as Array<{ isDeleted?: boolean }> | null) ?? [];

      rows.push({
        id: node.id,
        name: node.name ?? '',
        ownerId: node.ownerId ?? null,
        propertyId: node.propertyId ?? null,
        category: (node.category as string | null) ?? 'OTHER',
        amount: (node.amount?.amountMicros ?? 0) / 1_000_000,
        date: node.expenseDate,
        hasBill: Boolean(node.noBillNeeded) || files.some((file) => !file?.isDeleted),
      });
    }

    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return rows;
};

// From 1 January of the year before, so the page can compare with last year.
export const loadYearData = async (client: CoreApiClient, scope: Scope, year: number): Promise<YearData> => {
  const from = `${year - 1}-01-01`;
  const to = `${year + 1}-01-01`;
  const [payments, expenses, { properties }] = await Promise.all([
    loadPayments(client, from, to),
    loadExpenses(client, from, to),
    client.query({
      properties: {
        __args: { first: 500, orderBy: [{ name: 'AscNullsLast' }] },
        edges: { node: { id: true, name: true, ownerId: true, status: true } },
      },
    }),
  ]);

  return {
    year,
    payments: payments.filter((payment) => inScope(scope, payment.ownerId)),
    expenses: expenses.filter((expense) => inScope(scope, expense.ownerId)),
    properties: (properties?.edges ?? [])
      .map(({ node }) => ({
        id: node.id,
        name: node.name ?? 'Property',
        ownerId: node.ownerId ?? null,
        status: (node.status as string | null) ?? '',
      }))
      .filter((property) => inScope(scope, property.ownerId)),
  };
};
