import { type CoreApiClient } from 'twenty-client-sdk/core';

// Which rental workspaces (owner records) a team member may see. Admins have
// a membership marked "All workspaces"; everyone else sees only the
// workspaces they're a member of, and nothing if they belong to none.
export type Scope = { all: boolean; ownerIds: Set<string> };

const ALL: Scope = { all: true, ownerIds: new Set() };

export const resolveScope = async (
  client: CoreApiClient,
  workspaceMemberId: string | null | undefined,
): Promise<Scope> => {
  // No person behind the call (cron, install hooks, API keys): full access.
  if (!workspaceMemberId) return ALL;

  const { memberships } = await client.query({
    memberships: {
      __args: { filter: { memberId: { eq: workspaceMemberId } }, first: 200 },
      edges: { node: { ownerId: true, allWorkspaces: true } },
    },
  });
  const rows = (memberships?.edges ?? []).map(({ node }) => node);

  if (rows.some((row) => row.allWorkspaces)) return ALL;

  return { all: false, ownerIds: new Set(rows.map((row) => row.ownerId).filter(Boolean) as string[]) };
};

export const inScope = (scope: Scope, ownerId: string | null | undefined) =>
  scope.all || (!!ownerId && scope.ownerIds.has(ownerId));

export const NOT_ALLOWED = {
  success: false,
  status: 403,
  message: "You don't have access to this workspace.",
} as const;
