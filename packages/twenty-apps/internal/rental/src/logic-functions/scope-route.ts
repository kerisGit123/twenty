import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { SCOPE_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { memberPersonalOwnerId } from 'src/logic-functions/utils/owner-sync';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';
import { workspaceLabel } from 'src/logic-functions/utils/workspace-label';

// Matches nothing: a person in no business gets an empty list, not an error.
const NO_ID = '00000000-0000-0000-0000-000000000000';

// Pending memberships (email set, no member yet) for this person's sign-in email
// are given to them. Emails are compared in lower case, as invites store them.
const linkPendingInvites = async (client: ReturnType<typeof appClient>, memberId: string) => {
  const { workspaceMembers } = await client.query({
    workspaceMembers: {
      __args: { filter: { id: { eq: memberId } }, first: 1 },
      edges: { node: { userEmail: true, name: { firstName: true, lastName: true } } },
    },
  });
  const member = workspaceMembers?.edges?.[0]?.node;
  const email = member?.userEmail?.trim().toLowerCase();

  if (!email) return;
  const { memberships } = await client.query({
    memberships: {
      __args: { filter: { email: { eq: email }, memberId: { is: 'NULL' } }, first: 50 },
      edges: { node: { id: true } },
    },
  });
  const name = [member?.name?.firstName, member?.name?.lastName].filter(Boolean).join(' ') || email;

  for (const { node } of memberships?.edges ?? []) {
    await client.mutation({ updateMembership: { __args: { id: node.id, data: { memberId, name } }, id: true } });
  }
};

// POST {} -> { all, owners }: the rental workspaces the caller may switch
// between (all of them for admins).
const handler = async (_event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  try {
    const client = appClient();
    const memberId = context?.workspaceMemberId;

    // Invites kept by email (the person had not signed up yet) are linked by a
    // background job that needs the worker, which this server may not run.
    // Link them here instead, on every load: someone invited to a business sees
    // it as soon as they sign in with that email.
    // A failure here must not hide the businesses they already have.
    if (memberId) await linkPendingInvites(client, memberId).catch((error) => console.error('[rental] linking invites failed:', error));
    let scope = await resolveScope(client, memberId);

    // The background job that gives a new member a Personal business needs the
    // worker, which this server may not run. A member who hosts no business that
    // still exists (new, only invited as a member, or theirs was deleted) gets
    // their Personal one here, on their first load.
    const hostsLive =
      scope.hostIds.size > 0 &&
      ((await client.query({ owners: { __args: { filter: { id: { in: [...scope.hostIds] } }, first: 1 }, edges: { node: { id: true } } } })).owners?.edges ?? []).length > 0;

    if (memberId && !scope.all && !hostsLive) {
      const { workspaceMembers } = await client.query({
        workspaceMembers: {
          __args: { filter: { id: { eq: memberId } }, first: 1 },
          edges: { node: { userEmail: true, name: { firstName: true, lastName: true } } },
        },
      });
      const member = workspaceMembers?.edges?.[0]?.node;
      const name =
        [member?.name?.firstName, member?.name?.lastName].filter(Boolean).join(' ') || member?.userEmail || 'Member';

      await memberPersonalOwnerId(client, memberId, name);
      scope = await resolveScope(client, memberId);
    }
    const [{ owners }, { memberships }] = await Promise.all([
      client.query({
        owners: {
          // Only theirs (an admin sees all): a long list of other businesses must not push theirs past the page.
          __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }], ...(scope.all ? {} : { filter: { id: { in: scope.ownerIds.size ? [...scope.ownerIds] : [NO_ID] } } }) },
          edges: { node: { id: true, name: true, ownerType: true } },
        },
      }),
      client.query({
        memberships: {
          __args: { filter: { memberRole: { eq: 'HOST' }, memberId: { is: 'NOT_NULL' } }, first: 1000 },
          edges: { node: { ownerId: true, name: true } },
        },
      }),
    ]);
    const hostNames = (ownerId: string) =>
      (memberships?.edges ?? []).filter(({ node }) => node.ownerId === ownerId).map(({ node }) => node.name ?? '');

    return new Response(
      JSON.stringify({
        success: true,
        all: scope.all,
        owners: (owners?.edges ?? [])
          .filter(({ node }) => inScope(scope, node.id))
          .map(({ node }) => {
            const type = (node.ownerType as string | null) ?? '';

            return {
              id: node.id,
              name: workspaceLabel({ id: node.id, name: node.name ?? 'Workspace', type }, scope, hostNames(node.id)),
              type,
              mine: scope.hostIds.has(node.id),
            };
          }),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[rental] scope failed:', error);

    return new Response(JSON.stringify({ success: false, all: false, owners: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: SCOPE_ROUTE_FUNCTION_ID,
  name: 'scope-route',
  description: 'Lists the rental businesses the caller may see.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/scope', httpMethod: 'POST', isAuthRequired: true },
});
