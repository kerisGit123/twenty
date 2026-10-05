import { type CoreApiClient } from 'twenty-client-sdk/core';

import { nextRepeatDate, type RepeatingBill } from 'src/shared/repeating';

// Every repeating expense whose next bill hasn't been added yet (all
// workspaces; callers keep the ones in scope).
export const loadRepeatingBills = async (client: CoreApiClient): Promise<RepeatingBill[]> => {
  const { expenses } = await client.query({
    expenses: {
      __args: {
        filter: { repeatEvery: { neq: 'NONE' }, repeatHandled: { eq: false } } as never,
        first: 500,
      },
      edges: {
        node: {
          id: true,
          name: true,
          expenseDate: true,
          amount: { amountMicros: true, currencyCode: true },
          category: true,
          repeatEvery: true,
          ownerId: true,
          property: { name: true },
        },
      },
    },
  });

  return (expenses?.edges ?? [])
    .filter(({ node }) => node.expenseDate && node.repeatEvery && node.repeatEvery !== 'NONE')
    .map(({ node }) => ({
      id: node.id,
      name: node.name ?? 'Bill',
      amount: (node.amount?.amountMicros ?? 0) / 1_000_000,
      currency: node.amount?.currencyCode || 'MYR',
      category: (node.category as string | null) ?? 'OTHER',
      every: node.repeatEvery as string,
      lastDate: node.expenseDate as string,
      nextDate: nextRepeatDate(node.expenseDate as string, node.repeatEvery as string),
      ownerId: node.ownerId ?? null,
      propertyName: node.property?.name ?? '',
    }))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
};
