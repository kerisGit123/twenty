import { type CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { CONTACTS_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v4';
import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, NOT_ALLOWED, resolveScope, type Scope } from 'src/logic-functions/utils/scope';
import { kindOf, occasionOf } from 'src/shared/campaigns';
import { ACTIVITY_KINDS, activityKind, type CampaignResults, type CleanupPerson, type HistoryEntry } from 'src/shared/contacts';
import { toE164 } from 'src/shared/whatsapp-link';

// POST /contacts — the WhatsApp contact book.
//   { action: 'history', personId }                         everything sent + logged
//   { action: 'log', personId, kind, note?, campaignId?, followUpOn? }
//   { action: 'done', activityId }                          follow-up done
//   { action: 'setPerson', personId, language?, noCampaigns? }
//   { action: 'campaignResults', campaignId }               replies per campaign
//   { action: 'cleanup' }                                   people to tidy up

type Body = {
  action?: string;
  personId?: string;
  activityId?: string;
  campaignId?: string;
  kind?: string;
  note?: string;
  followUpOn?: string | null;
  language?: string;
  noCampaigns?: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ success: false, message }, status);

type Tenancy = { tenantId: string; ownerId: string | null; status: string };

const loadTenancies = async (client: CoreApiClient): Promise<Tenancy[]> => {
  const { rentals } = await client.query({
    rentals: { __args: { first: 500 }, edges: { node: { tenantId: true, status: true, property: { ownerId: true } } } },
  });

  return (rentals?.edges ?? [])
    .filter(({ node }) => node.tenantId)
    .map(({ node }) => ({ tenantId: node.tenantId as string, ownerId: node.property?.ownerId ?? null, status: (node.status as string) ?? '' }));
};

// Staff only reach the tenants of contracts in their workspaces.
const reachable = (scope: Scope, tenancies: Tenancy[], personId: string) =>
  scope.all || tenancies.some((t) => t.tenantId === personId && inScope(scope, t.ownerId));

// The workspace a log entry belongs to: the campaign's, else the person's
// current contract's.
const ownerFor = (tenancies: Tenancy[], personId: string, campaignOwner?: string | null) =>
  campaignOwner ?? tenancies.find((t) => t.tenantId === personId && t.status === 'ACTIVE')?.ownerId ?? tenancies.find((t) => t.tenantId === personId)?.ownerId ?? null;

type ActivityRow = { id: string; kind: string; name: string; note: string; followUpOn: string | null; done: boolean; campaignId: string | null; personId: string | null; ownerId: string | null; createdAt: string };

const loadActivities = async (client: CoreApiClient, filter: Record<string, unknown>): Promise<ActivityRow[]> => {
  const { contactActivities } = (await client.query({
    contactActivities: {
      __args: { filter, first: 500, orderBy: [{ createdAt: 'DescNullsLast' }] },
      edges: { node: { id: true, kind: true, name: true, note: true, followUpOn: true, done: true, campaignId: true, personId: true, ownerId: true, createdAt: true } },
    },
  } as never)) as { contactActivities?: { edges?: Array<{ node: Record<string, unknown> }> } };

  return (contactActivities?.edges ?? []).map(({ node }) => ({
    id: node.id as string,
    kind: (node.kind as string) ?? 'NOTE',
    name: (node.name as string) ?? '',
    note: (node.note as string) ?? '',
    followUpOn: (node.followUpOn as string | null) ?? null,
    done: Boolean(node.done),
    campaignId: (node.campaignId as string | null) ?? null,
    personId: (node.personId as string | null) ?? null,
    ownerId: (node.ownerId as string | null) ?? null,
    createdAt: (node.createdAt as string) ?? '',
  }));
};

type CampaignLite = { id: string; name: string; kind: string; occasion: string; ownerId: string | null; sent: Record<string, string> };

// Rent & receipts campaigns tick off "person|thing"; history counts people
// (latest send wins).
const byPersonSent = (sent: Record<string, string>) => {
  const out: Record<string, string> = {};

  for (const [key, at] of Object.entries(sent)) {
    const personId = key.split('|')[0];

    if (!out[personId] || at > out[personId]) out[personId] = at;
  }

  return out;
};

const loadCampaigns = async (client: CoreApiClient): Promise<CampaignLite[]> => {
  const { campaigns } = (await client.query({
    campaigns: { __args: { first: 300 }, edges: { node: { id: true, name: true, kind: true, occasion: true, ownerId: true, progress: true } } },
  } as never)) as { campaigns?: { edges?: Array<{ node: Record<string, unknown> }> } };

  return (campaigns?.edges ?? []).map(({ node }) => ({
    id: node.id as string,
    name: (node.name as string) ?? 'Campaign',
    kind: (node.kind as string) ?? 'GREETING',
    occasion: (node.occasion as string) ?? 'CUSTOM',
    ownerId: (node.ownerId as string | null) ?? null,
    sent: byPersonSent(((node.progress as { sent?: Record<string, string> } | null)?.sent) ?? {}),
  }));
};

const loadPerson = async (client: CoreApiClient, personId: string) => {
  const { people } = (await client.query({
    people: {
      __args: { filter: { id: { eq: personId } }, first: 1 },
      edges: { node: { id: true, name: { firstName: true, lastName: true }, phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true }, language: true, noCampaigns: true, tags: true } },
    },
  } as never)) as { people?: { edges?: Array<{ node: { id: string; name?: { firstName?: string; lastName?: string }; phones?: never; language?: string | null; noCampaigns?: boolean | null; tags?: string[] | null } }> } };
  const node = people?.edges?.[0]?.node;

  if (!node) return null;

  return {
    id: node.id,
    name: [node.name?.firstName, node.name?.lastName].filter(Boolean).join(' ') || 'Someone',
    firstName: node.name?.firstName ?? '',
    phone: toE164(node.phones ?? null),
    language: node.language ?? 'EN',
    noCampaigns: Boolean(node.noCampaigns),
    tags: node.tags ?? [],
  };
};

const results = (campaign: CampaignLite, activities: ActivityRow[]): CampaignResults => {
  const outcomes: Record<string, number> = {};
  const byPerson: Record<string, string> = {};

  // Oldest first, so the latest outcome per person wins.
  for (const a of [...activities].reverse()) {
    if (a.campaignId !== campaign.id || !a.personId || !ACTIVITY_KINDS.find((k) => k.value === a.kind)?.outcome) continue;
    byPerson[a.personId] = a.kind;
  }
  for (const kind of Object.values(byPerson)) outcomes[kind] = (outcomes[kind] ?? 0) + 1;

  const sent = Object.keys(campaign.sent).length;
  const responded = Object.values(byPerson).filter((k) => k !== 'WRONG_NUMBER').length;

  return { sent, outcomes, byPerson, replyRate: sent ? Math.min(1, responded / sent) : 0 };
};

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const tenancies = await loadTenancies(client);

    // ---- one campaign's replies
    if (body.action === 'campaignResults') {
      const campaign = (await loadCampaigns(client)).find((c) => c.id === body.campaignId);

      if (!campaign) return fail('Campaign not found.', 404);
      if (!inScope(scope, campaign.ownerId)) return json(NOT_ALLOWED, 403);

      return json({ success: true, results: results(campaign, await loadActivities(client, { campaignId: { eq: campaign.id } })) });
    }

    // ---- results for every campaign (Campaigns page)
    if (body.action === 'allResults') {
      const [campaigns, activities] = await Promise.all([loadCampaigns(client), loadActivities(client, { campaignId: { is: 'NOT_NULL' } })]);

      return json({
        success: true,
        results: Object.fromEntries(campaigns.filter((c) => inScope(scope, c.ownerId)).map((c) => [c.id, results(c, activities)])),
      });
    }

    // ---- people to tidy up
    if (body.action === 'cleanup') {
      const people: CleanupPerson[] = [];
      let after: string | undefined;
      const wrong = new Set((await loadActivities(client, { kind: { eq: 'WRONG_NUMBER' } })).map((a) => a.personId));
      const tenants = new Set(tenancies.filter((t) => inScope(scope, t.ownerId)).map((t) => t.tenantId));
      // Campaigns each person got (yours only), and how many they answered.
      const [campaignList, activities] = await Promise.all([loadCampaigns(client), loadActivities(client, { campaignId: { is: 'NOT_NULL' } })]);
      const sentTo = new Map<string, number>();
      const answeredBy = new Map<string, number>();

      for (const campaign of campaignList.filter((x) => inScope(scope, x.ownerId))) {
        const byPerson = results(campaign, activities).byPerson;

        for (const personId of Object.keys(campaign.sent)) {
          sentTo.set(personId, (sentTo.get(personId) ?? 0) + 1);
          if (byPerson[personId] && byPerson[personId] !== 'WRONG_NUMBER') answeredBy.set(personId, (answeredBy.get(personId) ?? 0) + 1);
        }
      }

      for (;;) {
        const { people: page } = (await client.query({
          people: {
            __args: { first: 200, ...(after ? { after } : {}), orderBy: [{ name: { firstName: 'AscNullsLast' } }] },
            edges: { node: { id: true, name: { firstName: true, lastName: true }, phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true }, language: true, noCampaigns: true, tags: true } },
            pageInfo: { hasNextPage: true, endCursor: true },
          },
        } as never)) as {
          people?: {
            edges?: Array<{ node: { id: string; name?: { firstName?: string; lastName?: string }; phones?: never; language?: string | null; noCampaigns?: boolean | null; tags?: string[] | null } }>;
            pageInfo?: { hasNextPage?: boolean; endCursor?: string };
          };
        };

        for (const { node } of page?.edges ?? []) {
          if (!scope.all && !tenants.has(node.id)) continue;
          people.push({
            id: node.id,
            name: [node.name?.firstName, node.name?.lastName].filter(Boolean).join(' ') || 'Someone',
            phone: toE164(node.phones ?? null),
            language: node.language ?? 'EN',
            optedOut: Boolean(node.noCampaigns),
            tags: node.tags ?? [],
            isTenant: tenants.has(node.id),
            wrongNumber: wrong.has(node.id),
            campaignsSent: sentTo.get(node.id) ?? 0,
            answered: answeredBy.get(node.id) ?? 0,
          });
        }
        if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor || people.length >= 3000) break;
        after = page.pageInfo.endCursor;
      }

      return json({ success: true, people });
    }

    // ---- follow-up done
    if (body.action === 'done') {
      const [activity] = await loadActivities(client, { id: { eq: body.activityId ?? '' } });

      if (!activity) return fail('Not found.', 404);
      if (!(scope.all || inScope(scope, activity.ownerId))) return json(NOT_ALLOWED, 403);
      await client.mutation({ updateContactActivity: { __args: { id: activity.id, data: { done: true } }, id: true } } as never);

      return json({ success: true, message: 'Follow-up done.' });
    }

    // ---- everything else is about one person
    if (!body.personId) return fail('Pick a person.');
    if (!reachable(scope, tenancies, body.personId)) return json(NOT_ALLOWED, 403);

    const person = await loadPerson(client, body.personId);

    if (!person) return fail('Person not found.', 404);

    if (body.action === 'setPerson') {
      const data: Record<string, unknown> = {};

      if (body.language === 'EN' || body.language === 'MS' || body.language === 'ZH') data.language = body.language;
      if (typeof body.noCampaigns === 'boolean') data.noCampaigns = body.noCampaigns;
      await client.mutation({ updatePerson: { __args: { id: person.id, data }, id: true } } as never);

      return json({ success: true });
    }

    if (body.action === 'log') {
      const kind = ACTIVITY_KINDS.find((k) => k.value === body.kind);

      if (!kind) return fail('Pick what happened.');

      const campaign = body.campaignId ? (await loadCampaigns(client)).find((c) => c.id === body.campaignId) : undefined;

      if (campaign && !inScope(scope, campaign.ownerId)) return json(NOT_ALLOWED, 403);

      const followUpOn = /^\d{4}-\d{2}-\d{2}$/.test(body.followUpOn ?? '') ? body.followUpOn : null;

      await client.mutation({
        createContactActivity: {
          __args: {
            data: {
              name: `${kind.label}${campaign ? ` · ${campaign.name}` : ''}`.slice(0, 200),
              kind: kind.value,
              note: (body.note ?? '').trim().slice(0, 2000),
              followUpOn,
              done: false,
              campaignId: campaign?.id ?? null,
              personId: person.id,
              ownerId: ownerFor(tenancies, person.id, campaign?.ownerId),
            },
          },
          id: true,
        },
      } as never);

      // "Stop" means no more campaigns for them.
      if (kind.value === 'STOP') await client.mutation({ updatePerson: { __args: { id: person.id, data: { noCampaigns: true } }, id: true } } as never);

      return json({ success: true, message: kind.value === 'STOP' ? `${person.name} won’t get greetings or newsletters any more.` : followUpOn ? 'Follow-up added — it shows on Today.' : 'Saved.' });
    }

    if (body.action === 'history') {
      const entries: HistoryEntry[] = [];
      const [campaigns, activities] = await Promise.all([loadCampaigns(client), loadActivities(client, { personId: { eq: person.id } })]);

      for (const c of campaigns) {
        const at = c.sent[person.id];

        if (!at || !inScope(scope, c.ownerId)) continue;

        const outcome = results(c, activities).byPerson[person.id];

        entries.push({
          key: `campaign-${c.id}`,
          at,
          kind: 'campaign',
          icon: c.kind === 'GREETING' ? occasionOf(c.occasion).icon : kindOf(c.kind).icon,
          title: c.name,
          detail: `${kindOf(c.kind).label} sent`,
          outcome,
        });
      }

      // Rent reminders and the morning assistant's messages to this number.
      if (person.phone) {
        const { notificationLogs } = (await client.query({
          notificationLogs: {
            __args: { filter: { recipient: { eq: person.phone }, status: { in: ['SENT'] } }, first: 200, orderBy: [{ createdAt: 'DescNullsLast' }] },
            edges: { node: { id: true, name: true, body: true, createdAt: true } },
          },
        } as never)) as { notificationLogs?: { edges?: Array<{ node: { id: string; name?: string; body?: string; createdAt?: string } }> } };

        for (const { node } of notificationLogs?.edges ?? []) {
          entries.push({ key: `log-${node.id}`, at: node.createdAt ?? '', kind: 'reminder', icon: '🔔', title: (node.name ?? 'Reminder').replace(/^You sent · /, ''), detail: (node.body ?? '').slice(0, 160) });
        }
      }

      // Receipts sent.
      const { rentPayments } = await client.query({
        rentPayments: {
          __args: { filter: { tenantId: { eq: person.id }, receiptSentAt: { is: 'NOT_NULL' } }, first: 200 },
          edges: { node: { id: true, receiptNumber: true, receiptSentAt: true, rentPeriod: true, amount: { amountMicros: true }, ownerId: true } },
        },
      });

      for (const { node } of rentPayments?.edges ?? []) {
        if (!inScope(scope, node.ownerId ?? null)) continue;
        entries.push({
          key: `receipt-${node.id}`,
          at: node.receiptSentAt as string,
          kind: 'receipt',
          icon: '🧾',
          title: `Receipt ${node.receiptNumber ?? ''}`.trim(),
          detail: `RM ${((node.amount?.amountMicros ?? 0) / 1_000_000).toLocaleString('en-MY')}${node.rentPeriod ? ` · rent for ${node.rentPeriod.slice(0, 7)}` : ''}`,
        });
      }

      for (const a of activities) {
        if (!(scope.all || inScope(scope, a.ownerId))) continue;

        const k = activityKind(a.kind);

        entries.push({
          key: `activity-${a.id}`,
          at: a.createdAt,
          kind: 'activity',
          icon: k.icon,
          title: a.name || k.label,
          detail: a.note,
          activityId: a.id,
          followUpOn: a.followUpOn,
          done: a.done,
          outcome: k.outcome ? k.value : undefined,
        });
      }

      entries.sort((a, b) => b.at.localeCompare(a.at));

      return json({ success: true, person, entries });
    }

    return fail('Unknown action.');
  } catch (error) {
    console.error('[rental] contacts route failed:', error);

    return fail(error instanceof Error ? error.message : String(error), 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: CONTACTS_ROUTE_FUNCTION_ID,
  name: 'contacts-route',
  description: 'WhatsApp contact book: history, replies, notes, follow-ups and clean-up.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/contacts', httpMethod: 'POST', isAuthRequired: true },
});
