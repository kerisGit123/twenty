import { type CoreApiClient } from 'twenty-client-sdk/core';

// Every record of an object, page by page (one query caps at a few hundred,
// and a missing page silently turns paid months into "overdue").
export const queryAll = async <Node>(
  client: CoreApiClient,
  objectPlural: string,
  args: Record<string, unknown>,
  node: Record<string, unknown>,
  limit = 20_000,
): Promise<Node[]> => {
  const all: Node[] = [];
  let after: string | undefined;

  for (;;) {
    const result = (await client.query({
      [objectPlural]: {
        __args: { ...args, first: 200, ...(after ? { after } : {}) },
        edges: { node },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    } as never)) as Record<string, { edges?: Array<{ node: Node }>; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } | undefined>;
    const page = result[objectPlural];

    for (const edge of page?.edges ?? []) all.push(edge.node);
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor || all.length >= limit) break;
    after = page.pageInfo.endCursor;
  }

  return all;
};
