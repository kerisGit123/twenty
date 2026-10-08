import { type CoreApiClient } from 'twenty-client-sdk/core';

// Which rental workspaces (owner records) a team member may see. Admins have
// a membership marked "All workspaces"; everyone else sees only the
// workspaces they're a member of, and nothing if they belong to none.
// hostIds: workspaces this person hosts (may rename them and manage members).
export type Scope = { all: boolean; ownerIds: Set<string>; hostIds: Set<string>; memberId: string | null };

const ALL: Scope = { all: true, ownerIds: new Set(), hostIds: new Set(), memberId: null };
const NONE: Scope = { all: false, ownerIds: new Set(), hostIds: new Set(), memberId: null };

// Background jobs (cron, database triggers) say so explicitly to get full
// access; a route call with no person behind it never gets it by accident.
export const SYSTEM = 'system' as const;

export const resolveScope = async (
  client: CoreApiClient,
  workspaceMemberId: string | null | undefined,
): Promise<Scope> => {
  if (workspaceMemberId === SYSTEM) return ALL;
  // No person behind a route call: an API key, or someone whose team-member
  // record is gone. Nothing, unless API keys were allowed (for scripts).
  if (!workspaceMemberId) return process.env.API_KEYS_FULL_ACCESS?.trim().toLowerCase() === 'true' ? ALL : NONE;

  const { memberships } = await client.query({
    memberships: {
      __args: { filter: { memberId: { eq: workspaceMemberId } }, first: 200 },
      edges: { node: { ownerId: true, allWorkspaces: true, memberRole: true } },
    },
  });
  const rows = (memberships?.edges ?? []).map(({ node }) => node);

  const ownerIds = (list: typeof rows) => new Set(list.map((row) => row.ownerId).filter(Boolean) as string[]);
  const hostIds = ownerIds(rows.filter((row) => (row.memberRole as string | null) === 'HOST'));

  if (rows.some((row) => row.allWorkspaces)) return { ...ALL, hostIds, memberId: workspaceMemberId };

  return { all: false, ownerIds: ownerIds(rows), hostIds, memberId: workspaceMemberId };
};

export const inScope = (scope: Scope, ownerId: string | null | undefined) =>
  scope.all || (!!ownerId && scope.ownerIds.has(ownerId));

// Admins and the workspace's hosts may rename it and manage its members.
export const canManage = (scope: Scope, ownerId: string | null | undefined) =>
  scope.all || (!!ownerId && scope.hostIds.has(ownerId));

export const NOT_ALLOWED = {
  success: false,
  status: 403,
  message: "You don't have access to this workspace.",
} as const;
