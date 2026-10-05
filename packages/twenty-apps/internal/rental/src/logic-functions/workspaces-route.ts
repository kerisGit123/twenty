import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { WORKSPACES_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';

export type WorkspaceCard = {
  id: string;
  name: string;
  type: string;
  properties: number;
  occupied: number;
  rent: number;
  expenses: number;
  members: number;
};

const TYPES = ['PERSONAL', 'FAMILY', 'INDIVIDUAL', 'COMPANY', 'NGO', 'OTHER'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const money = (value: { amountMicros?: number | null } | null | undefined) => (value?.amountMicros ?? 0) / 1_000_000;

// POST { action: 'list' } -> the caller's workspaces with this year's numbers.
// POST { action: 'create', name, type } -> new workspace (admins only).
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as { action?: string; name?: string; type?: string };

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (body.action === 'create') {
      if (!scope.all) return json({ success: false, message: 'Only admins can add workspaces.' }, 403);
      if (!body.name?.trim()) return json({ success: false, message: 'Give the workspace a name.' }, 400);

      const { createOwner } = await client.mutation({
        createOwner: {
          __args: {
            data: { name: body.name.trim(), ownerType: (TYPES.includes(body.type ?? '') ? body.type : 'OTHER') as never },
          },
          id: true,
        },
      });

      return json({ success: true, id: createOwner?.id });
    }

    const year = todayIso().slice(0, 4);
    const inYear = { and: [{ paidOn: { gte: `${year}-01-01` } }, { paidOn: { lt: `${Number(year) + 1}-01-01` } }] };
    const [{ owners }, { properties }, { rentPayments }, { expenses }, { memberships }] = await Promise.all([
      client.query({ owners: { __args: { first: 200 }, edges: { node: { id: true, name: true, ownerType: true } } } }),
      client.query({ properties: { __args: { first: 1000 }, edges: { node: { ownerId: true, status: true } } } }),
      client.query({
        rentPayments: {
          __args: { filter: { paymentType: { eq: 'RENT' }, status: { in: ['ISSUED', 'SENT'] }, ...inYear }, first: 2000 },
          edges: { node: { ownerId: true, amount: { amountMicros: true } } },
        },
      }),
      client.query({
        expenses: {
          __args: {
            filter: { and: [{ expenseDate: { gte: `${year}-01-01` } }, { expenseDate: { lt: `${Number(year) + 1}-01-01` } }] },
            first: 2000,
          },
          edges: { node: { ownerId: true, amount: { amountMicros: true } } },
        },
      }),
      client.query({
        memberships: { __args: { filter: { memberId: { is: 'NOT_NULL' } }, first: 1000 }, edges: { node: { ownerId: true } } },
      }),
    ]);

    const cards: WorkspaceCard[] = (owners?.edges ?? [])
      .filter(({ node }) => inScope(scope, node.id))
      .map(({ node }) => {
        const mine = (row: { ownerId?: string | null }) => row.ownerId === node.id;
        const props = (properties?.edges ?? []).map((e) => e.node).filter(mine);

        return {
          id: node.id,
          name: node.name ?? 'Workspace',
          type: (node.ownerType as string | null) ?? '',
          properties: props.length,
          occupied: props.filter((p) => p.status === 'OCCUPIED').length,
          rent: (rentPayments?.edges ?? []).map((e) => e.node).filter(mine).reduce((s, p) => s + money(p.amount), 0),
          expenses: (expenses?.edges ?? []).map((e) => e.node).filter(mine).reduce((s, x) => s + money(x.amount), 0),
          members: (memberships?.edges ?? []).map((e) => e.node).filter(mine).length,
        };
      })
      // Personal first, then by name.
      .sort((a, b) =>
        (a.type === 'PERSONAL') !== (b.type === 'PERSONAL') ? (a.type === 'PERSONAL' ? -1 : 1) : a.name.localeCompare(b.name),
      );

    return json({ success: true, admin: scope.all, year, workspaces: cards });
  } catch (error) {
    console.error('[rental] workspaces failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: WORKSPACES_ROUTE_FUNCTION_ID,
  name: 'workspaces-route',
  description: "Lists the caller's rental workspaces with this year's numbers, and adds workspaces.",
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/workspaces', httpMethod: 'POST', isAuthRequired: true },
});
