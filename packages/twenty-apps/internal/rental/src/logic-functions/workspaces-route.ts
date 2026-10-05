import { type CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { WORKSPACES_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { canManage, inScope, resolveScope, type Scope } from 'src/logic-functions/utils/scope';
import { workspaceLabel } from 'src/logic-functions/utils/workspace-label';

export type WorkspaceRole = 'ADMIN' | 'HOST' | 'MEMBER';

export type WorkspaceCard = {
  id: string;
  name: string;
  type: string;
  role: WorkspaceRole;
  canManage: boolean;
  hosts: string[];
  properties: number;
  occupied: number;
  rent: number;
  expenses: number;
  members: number;
};

export type WorkspaceMemberRow = {
  membershipId: string;
  memberId: string;
  name: string;
  email: string;
  role: 'HOST' | 'MEMBER';
};

export type WorkspaceMembersResponse = {
  success: boolean;
  message?: string;
  canManage?: boolean;
  isAdmin?: boolean;
  me?: string | null;
  members?: WorkspaceMemberRow[];
  admins?: { membershipId: string; memberId: string; name: string; email: string }[];
  pending?: { membershipId: string; email: string }[];
  team?: { memberId: string; name: string; email: string }[];
};

const TYPES = ['FAMILY', 'INDIVIDUAL', 'COMPANY', 'NGO', 'OTHER'];

type Body = {
  action?: string;
  id?: string;
  name?: string;
  type?: string;
  memberId?: string;
  email?: string;
  membershipId?: string;
  role?: string;
  on?: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const refuse = (message: string) => json({ success: false, message }, 403);

const money = (value: { amountMicros?: number | null } | null | undefined) => (value?.amountMicros ?? 0) / 1_000_000;

type MembershipRow = {
  id: string;
  ownerId: string | null;
  memberId: string | null;
  name: string;
  email: string;
  role: string;
  allWorkspaces: boolean;
};

export const loadMemberships = async (client: CoreApiClient): Promise<MembershipRow[]> => {
  const { memberships } = await client.query({
    memberships: {
      __args: { first: 1000 },
      edges: { node: { id: true, ownerId: true, memberId: true, name: true, email: true, memberRole: true, allWorkspaces: true } },
    },
  });

  return (memberships?.edges ?? []).map(({ node }) => ({
    id: node.id,
    ownerId: node.ownerId ?? null,
    memberId: node.memberId ?? null,
    name: node.name ?? '',
    email: node.email ?? '',
    role: (node.memberRole as string | null) ?? 'MEMBER',
    allWorkspaces: Boolean(node.allWorkspaces),
  }));
};

const loadTeam = async (client: CoreApiClient) => {
  const { workspaceMembers } = await client.query({
    workspaceMembers: {
      __args: { first: 200 },
      edges: { node: { id: true, userEmail: true, name: { firstName: true, lastName: true } } },
    },
  });

  return (workspaceMembers?.edges ?? [])
    .map(({ node }) => ({
      memberId: node.id,
      name: [node.name?.firstName, node.name?.lastName].filter(Boolean).join(' ') || node.userEmail || 'Member',
      email: node.userEmail ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const roleIn = (scope: Scope, ownerId: string): WorkspaceRole =>
  scope.hostIds.has(ownerId) ? 'HOST' : scope.all ? 'ADMIN' : 'MEMBER';

const list = async (client: CoreApiClient, scope: Scope) => {
  const year = todayIso().slice(0, 4);
  const inYear = { and: [{ paidOn: { gte: `${year}-01-01` } }, { paidOn: { lt: `${Number(year) + 1}-01-01` } }] };
  const [{ owners }, { properties }, { rentPayments }, { expenses }, memberships] = await Promise.all([
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
    loadMemberships(client),
  ]);

  const cards: WorkspaceCard[] = (owners?.edges ?? [])
    .filter(({ node }) => inScope(scope, node.id))
    .map(({ node }) => {
      const mine = (row: { ownerId?: string | null }) => row.ownerId === node.id;
      const props = (properties?.edges ?? []).map((e) => e.node).filter(mine);
      const people = memberships.filter((m) => mine(m) && m.memberId);
      const hosts = people.filter((m) => m.role === 'HOST').map((m) => m.name);
      const type = (node.ownerType as string | null) ?? '';

      return {
        id: node.id,
        name: workspaceLabel({ id: node.id, name: node.name ?? 'Workspace', type }, scope, hosts),
        type,
        role: roleIn(scope, node.id),
        canManage: canManage(scope, node.id),
        hosts,
        properties: props.length,
        occupied: props.filter((p) => p.status === 'OCCUPIED').length,
        rent: (rentPayments?.edges ?? []).map((e) => e.node).filter(mine).reduce((s, p) => s + money(p.amount), 0),
        expenses: (expenses?.edges ?? []).map((e) => e.node).filter(mine).reduce((s, x) => s + money(x.amount), 0),
        members: people.length,
      };
    })
    // Your own Personal first, then other Personal workspaces, then by name.
    .sort((a, b) => {
      const rank = (card: WorkspaceCard) => (card.type === 'PERSONAL' ? (card.role === 'HOST' ? 0 : 1) : 2);

      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });

  return json({ success: true, admin: scope.all, year, workspaces: cards });
};

const members = async (client: CoreApiClient, scope: Scope, ownerId: string) => {
  const [rows, team] = await Promise.all([loadMemberships(client), loadTeam(client)]);
  const byId = new Map(team.map((person) => [person.memberId, person]));
  const here = rows.filter((row) => row.ownerId === ownerId && !row.allWorkspaces);
  const manage = canManage(scope, ownerId);

  const current: WorkspaceMemberRow[] = here
    .filter((row) => row.memberId)
    .map((row) => ({
      membershipId: row.id,
      memberId: row.memberId as string,
      name: byId.get(row.memberId as string)?.name ?? row.name,
      email: byId.get(row.memberId as string)?.email ?? '',
      role: (row.role === 'HOST' ? 'HOST' : 'MEMBER') as 'HOST' | 'MEMBER',
    }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'HOST' ? -1 : 1));
  const admins = rows
    .filter((row) => row.allWorkspaces && row.memberId)
    .map((row) => ({
      membershipId: row.id,
      memberId: row.memberId as string,
      name: byId.get(row.memberId as string)?.name ?? row.name,
      email: byId.get(row.memberId as string)?.email ?? '',
    }));
  const taken = new Set([...current.map((m) => m.memberId), ...admins.map((a) => a.memberId)]);

  const response: WorkspaceMembersResponse = {
    success: true,
    canManage: manage,
    isAdmin: scope.all,
    me: scope.memberId,
    members: current,
    admins,
    pending: manage ? here.filter((row) => !row.memberId && row.email).map((row) => ({ membershipId: row.id, email: row.email })) : [],
    team: manage ? team.filter((person) => !taken.has(person.memberId)) : [],
  };

  return json(response);
};

// POST { action } on the caller's rental workspaces:
//   list                               -> cards with this year's numbers
//   create { name, type }              -> new workspace; the caller hosts it
//   update { id, name?, type? }        -> rename / retype (hosts and admins)
//   members { id }                     -> who's in it
//   add { id, memberId? | email? }     -> add a teammate or keep an invite (hosts and admins)
//   remove { id, membershipId }        -> take someone out / cancel an invite (hosts and admins)
//   setRole { id, membershipId, role } -> make someone host or member (hosts and admins)
//   setAdmin { memberId, on }          -> "All workspaces" access (admins)
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (!body.action || body.action === 'list') return await list(client, scope);

    if (body.action === 'create') {
      if (!scope.all && !scope.memberId) return refuse('Sign in to add a workspace.');
      if (!body.name?.trim()) return json({ success: false, message: 'Give the workspace a name.' }, 400);

      const { createOwner } = await client.mutation({
        createOwner: {
          __args: { data: { name: body.name.trim(), ownerType: (TYPES.includes(body.type ?? '') ? body.type : 'OTHER') as never } },
          id: true,
        },
      });

      if (createOwner?.id && scope.memberId) {
        const team = await loadTeam(client);

        await client.mutation({
          createMembership: {
            __args: {
              data: {
                ownerId: createOwner.id,
                memberId: scope.memberId,
                name: team.find((person) => person.memberId === scope.memberId)?.name ?? 'Host',
                memberRole: 'HOST' as never,
              },
            },
            id: true,
          },
        });
      }

      return json({ success: true, id: createOwner?.id });
    }

    if (body.action === 'setAdmin') {
      if (!scope.all) return refuse('Only admins can change who sees every workspace.');
      if (!body.memberId) return json({ success: false, message: 'Pick a person.' }, 400);
      if (!body.on && body.memberId === scope.memberId) return refuse("You can't remove your own admin access.");

      const rows = await loadMemberships(client);
      const existing = rows.find((row) => row.allWorkspaces && row.memberId === body.memberId);

      if (body.on && !existing) {
        const team = await loadTeam(client);
        const name = team.find((person) => person.memberId === body.memberId)?.name ?? 'Member';

        await client.mutation({
          createMembership: {
            __args: { data: { memberId: body.memberId, allWorkspaces: true, name: `${name} (all workspaces)` } },
            id: true,
          },
        });
      } else if (!body.on && existing) {
        await client.mutation({ deleteMembership: { __args: { id: existing.id }, id: true } });
      }

      return json({ success: true });
    }

    // Everything below is about one workspace.
    const ownerId = body.id;

    if (!ownerId || !inScope(scope, ownerId)) return refuse("You don't have access to this workspace.");
    if (body.action === 'members') return await members(client, scope, ownerId);
    if (!canManage(scope, ownerId)) return refuse('Only the workspace host can change this.');

    if (body.action === 'update') {
      const { owners } = await client.query({
        owners: { __args: { filter: { id: { eq: ownerId } }, first: 1 }, edges: { node: { ownerType: true } } },
      });
      const isPersonal = (owners?.edges?.[0]?.node?.ownerType as string | null) === 'PERSONAL';
      const data: Record<string, unknown> = {};

      if (body.name?.trim()) data.name = body.name.trim();
      // A Personal workspace stays Personal; others can't become one.
      if (!isPersonal && body.type && TYPES.includes(body.type)) data.ownerType = body.type;
      if (Object.keys(data).length === 0) return json({ success: false, message: 'Nothing to change.' }, 400);

      await client.mutation({ updateOwner: { __args: { id: ownerId, data: data as never }, id: true } });

      return json({ success: true });
    }

    const rows = (await loadMemberships(client)).filter((row) => row.ownerId === ownerId && !row.allWorkspaces);

    if (body.action === 'add') {
      const team = await loadTeam(client);
      const email = body.email?.trim().toLowerCase() ?? '';
      const person = body.memberId
        ? team.find((p) => p.memberId === body.memberId)
        : team.find((p) => email && p.email.toLowerCase() === email);

      if (person) {
        if (!rows.some((row) => row.memberId === person.memberId)) {
          await client.mutation({
            createMembership: { __args: { data: { ownerId, memberId: person.memberId, name: person.name } }, id: true },
          });
        }

        return json({ success: true, joined: true, name: person.name });
      }
      if (body.memberId) return json({ success: false, message: 'That person is not on the team.' }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ success: false, message: 'Enter a valid email address.' }, 400);

      // Not on the team yet: keep the invite; on-member-joined links it.
      if (!rows.some((row) => !row.memberId && row.email === email)) {
        await client.mutation({ createMembership: { __args: { data: { ownerId, email, name: email } }, id: true } });
      }

      return json({ success: true, joined: false });
    }

    const target = rows.find((row) => row.id === body.membershipId);

    if (!target) return json({ success: false, message: 'That person is not in this workspace.' }, 400);

    const otherHosts = rows.filter((row) => row.role === 'HOST' && row.memberId && row.id !== target.id).length;

    if (body.action === 'remove') {
      if (target.role === 'HOST' && otherHosts === 0) {
        return json({ success: false, message: 'A workspace needs a host. Make someone else host first.' }, 400);
      }
      await client.mutation({ deleteMembership: { __args: { id: target.id }, id: true } });

      return json({ success: true });
    }

    if (body.action === 'setRole') {
      const role = body.role === 'HOST' ? 'HOST' : 'MEMBER';

      if (!target.memberId) return json({ success: false, message: 'They have to join first.' }, 400);
      if (role === 'MEMBER' && target.role === 'HOST' && otherHosts === 0) {
        return json({ success: false, message: 'A workspace needs a host. Make someone else host first.' }, 400);
      }
      await client.mutation({ updateMembership: { __args: { id: target.id, data: { memberRole: role } as never }, id: true } });

      return json({ success: true });
    }

    return json({ success: false, message: `Unknown action: ${body.action}` }, 400);
  } catch (error) {
    console.error('[rental] workspaces failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: WORKSPACES_ROUTE_FUNCTION_ID,
  name: 'workspaces-route',
  description: "Lists the caller's rental workspaces, adds them, and lets hosts rename them and manage members.",
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/workspaces', httpMethod: 'POST', isAuthRequired: true },
});
