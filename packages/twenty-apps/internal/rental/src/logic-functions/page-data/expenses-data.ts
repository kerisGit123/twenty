import { type CoreApiClient } from 'twenty-client-sdk/core';

import { inScope, type Scope } from 'src/logic-functions/utils/scope';

// Expenses page data, limited to the caller's workspaces.

export type Expense = {
  id: string;
  name: string;
  date: string | null;
  amount: number;
  currency: string; // MYR, SGD, USD...
  category: string;
  paidTo: string;
  propertyId: string | null;
  propertyName: string;
  ownerId: string | null;
  ownerName: string;
  files: number;
  noBillNeeded: boolean;
};

export type Option = { id: string; name: string; ownerId?: string | null };

export type ExpensesData = { expenses: Expense[]; owners: Option[]; properties: Option[] };

const loadExpenses = async (client: CoreApiClient, from: string, to: string): Promise<Expense[]> => {
  const rows: Expense[] = [];
  let after: string | undefined;

  for (;;) {
    const { expenses: page } = await client.query({
      expenses: {
        __args: {
          filter: { and: [{ expenseDate: { gte: from } }, { expenseDate: { lt: to } }] },
          orderBy: [{ expenseDate: 'DescNullsLast' }],
          first: 200,
          ...(after ? { after } : {}),
        },
        edges: {
          node: {
            id: true,
            name: true,
            expenseDate: true,
            amount: { amountMicros: true, currencyCode: true },
            category: true,
            paidTo: true,
            receipt: { fileId: true },
            noBillNeeded: true,
            propertyId: true,
            ownerId: true,
            property: { name: true },
            owner: { name: true },
          },
        },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const { node } of page?.edges ?? []) {
      const files = (node.receipt as unknown as Array<{ isDeleted?: boolean }> | null) ?? [];

      rows.push({
        id: node.id,
        name: node.name ?? '',
        date: node.expenseDate ?? null,
        amount: (node.amount?.amountMicros ?? 0) / 1_000_000,
        currency: node.amount?.currencyCode || 'MYR',
        category: (node.category as string | null) ?? 'OTHER',
        paidTo: node.paidTo ?? '',
        propertyId: node.propertyId ?? null,
        propertyName: node.property?.name ?? '',
        ownerId: node.ownerId ?? null,
        ownerName: node.owner?.name ?? '',
        files: files.filter((file) => !file?.isDeleted).length,
        noBillNeeded: Boolean(node.noBillNeeded),
      });
    }

    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return rows;
};

const loadOptions = async (client: CoreApiClient) => {
  const [{ owners }, { properties }] = await Promise.all([
    client.query({
      owners: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true } } },
    }),
    client.query({
      properties: {
        __args: { first: 500, orderBy: [{ name: 'AscNullsLast' }] },
        edges: { node: { id: true, name: true, ownerId: true } },
      },
    }),
  ]);

  return {
    owners: (owners?.edges ?? []).map(({ node }) => ({ id: node.id, name: node.name ?? 'Owner' })),
    properties: (properties?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? 'Property',
      ownerId: node.ownerId ?? null,
    })),
  };
};

export const loadExpensesData = async (
  client: CoreApiClient,
  scope: Scope,
  from: string,
  to: string,
): Promise<ExpensesData> => {
  const [expenses, options] = await Promise.all([loadExpenses(client, from, to), loadOptions(client)]);

  return {
    expenses: expenses.filter((expense) => inScope(scope, expense.ownerId)),
    owners: options.owners.filter((owner) => inScope(scope, owner.id)),
    properties: options.properties.filter((property) => inScope(scope, property.ownerId)),
  };
};
