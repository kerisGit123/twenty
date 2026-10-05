import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { SCOPE_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';

// POST {} -> { all, owners }: the rental workspaces the caller may switch
// between (all of them for admins).
const handler = async (_event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const { owners } = await client.query({
      owners: {
        __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] },
        edges: { node: { id: true, name: true, ownerType: true } },
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        all: scope.all,
        owners: (owners?.edges ?? [])
          .filter(({ node }) => inScope(scope, node.id))
          .map(({ node }) => ({ id: node.id, name: node.name ?? 'Workspace', type: (node.ownerType as string | null) ?? '' })),
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
  description: 'Lists the rental workspaces the caller may see.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/scope', httpMethod: 'POST', isAuthRequired: true },
});
