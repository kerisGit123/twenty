import { type CoreApiClient } from 'twenty-client-sdk/core';

import { loadRepeatingBills } from 'src/logic-functions/utils/repeating-bills';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';
import { type RepeatingBill } from 'src/shared/repeating';

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
  fileList: Array<{ label: string; url: string; extension: string | null }>; // the bill / receipt files
  noBillNeeded: boolean;
  repeatEvery: string;
};

export type Option = { id: string; name: string; ownerId?: string | null };

export type ExpensesData = { expenses: Expense[]; owners: Option[]; properties: Option[]; repeating: RepeatingBill[] };

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
            receipt: { fileId: true, label: true, url: true, extension: true },
            noBillNeeded: true,
            repeatEvery: true,
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
      const files = ((node.receipt as unknown as Array<{ isDeleted?: boolean; label?: string; url?: string; extension?: string | null }> | null) ?? []).filter((file) => !file?.isDeleted);

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
        files: files.length,
        fileList: files
          .filter((file) => file?.url)
          .map((file) => ({
            label: file.label || 'Bill',
            url: file.url as string,
            extension: (file.extension ?? '').replace(/^\./, '').toLowerCase() || (file.label?.split('.').pop()?.toLowerCase() ?? null),
          })),
        noBillNeeded: Boolean(node.noBillNeeded),
        repeatEvery: (node.repeatEvery as string | null) ?? 'NONE',
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
  const [expenses, options, repeating] = await Promise.all([loadExpenses(client, from, to), loadOptions(client), loadRepeatingBills(client)]);

  return {
    expenses: expenses.filter((expense) => inScope(scope, expense.ownerId)),
    owners: options.owners.filter((owner) => inScope(scope, owner.id)),
    properties: options.properties.filter((property) => inScope(scope, property.ownerId)),
    repeating: repeating.filter((bill) => inScope(scope, bill.ownerId)),
  };
};
