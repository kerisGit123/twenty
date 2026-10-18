import { type CoreApiClient } from 'twenty-client-sdk/core';

import { nextRepeatDate, type RepeatingBill } from 'src/shared/repeating';

type SeriesPart = { name?: string | null; ownerId?: string | null; propertyId?: string | null };

// One series = the same bill name in the same business and property.
const seriesKey = (row: SeriesPart) => [row.name ?? '', row.ownerId ?? '', row.propertyId ?? ''].join('|');

// The day of the month each series is meant to fall on: the day of its first
// (earliest) bill. Each next bill is a copy of the last one, so without this a
// 31st that once fell on 28 Feb would stay on the 28th for good.
export const loadSeriesDays = async (client: CoreApiClient, only?: SeriesPart): Promise<Map<string, number>> => {
  const days = new Map<string, number>();
  let after: string | undefined;

  for (;;) {
    const { expenses: page } = await client.query({
      expenses: {
        __args: {
          filter: {
            repeatEvery: { neq: 'NONE' },
            ...(only
              ? {
                  name: { eq: only.name ?? '' },
                  ownerId: only.ownerId ? { eq: only.ownerId } : { is: 'NULL' },
                  propertyId: only.propertyId ? { eq: only.propertyId } : { is: 'NULL' },
                }
              : {}),
          } as never,
          orderBy: [{ expenseDate: 'AscNullsLast' }],
          first: 200,
          ...(after ? { after } : {}),
        },
        edges: { node: { name: true, expenseDate: true, ownerId: true, propertyId: true } },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const { node } of page?.edges ?? []) {
      const key = seriesKey(node);

      // Oldest first, so the first one seen per series wins.
      if (node.expenseDate && !days.has(key)) days.set(key, Number(String(node.expenseDate).slice(8, 10)));
    }

    // One series only: its first bill is all we need.
    if (only || !page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return days;
};

export const seriesDayOf = (days: Map<string, number>, row: SeriesPart) => days.get(seriesKey(row)) ?? null;

// Every repeating expense whose next bill hasn't been added yet (all
// workspaces; callers keep the ones in scope).
export const loadRepeatingBills = async (client: CoreApiClient): Promise<RepeatingBill[]> => {
  const days = await loadSeriesDays(client);
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
          propertyId: true,
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
      nextDate: nextRepeatDate(node.expenseDate as string, node.repeatEvery as string, seriesDayOf(days, node)),
      ownerId: node.ownerId ?? null,
      propertyName: node.property?.name ?? '',
    }))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
};
