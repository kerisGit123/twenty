import { type CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { CAMPAIGNS_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v4';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { inScope, NOT_ALLOWED, resolveScope, type Scope } from 'src/logic-functions/utils/scope';
import {
  type Audience,
  CAMPAIGN_KINDS,
  type CampaignRow,
  EMPTY_AUDIENCE,
  EMPTY_PROGRESS,
  type Language,
  type NewsletterContent,
  OCCASIONS,
  PERSON_TAGS,
  type Progress,
  type Recipient,
} from 'src/shared/campaigns';
import { toE164 } from 'src/shared/whatsapp-link';

// POST /campaigns — greetings, newsletters and announcements.
//   { action: 'list' }                          campaigns + workspaces + tags
//   { action: 'save', campaign }                create or update
//   { action: 'delete', id }                    soft delete
//   { action: 'recipients', id }                who it goes to, with status
//   { action: 'count', audience }               live audience size (editor)
//   { action: 'mark', id, personId, status }    sent / skipped / pending
//   { action: 'people', query }                 find people to add by hand

type Body = {
  action?: string;
  id?: string;
  personId?: string;
  status?: 'sent' | 'skipped' | 'pending';
  query?: string;
  audience?: Audience;
  campaign?: Partial<CampaignRow>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ success: false, message }, status);

const asAudience = (value: unknown): Audience => {
  const a = (value ?? {}) as Partial<Audience>;
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 2000) : []);

  return {
    tags: strings(a.tags),
    tenants: a.tenants === 'none' || a.tenants === 'all' ? a.tenants : a.tenants === 'active' ? 'active' : EMPTY_AUDIENCE.tenants,
    ownerIds: strings(a.ownerIds),
    include: strings(a.include),
    exclude: strings(a.exclude),
  };
};

const asProgress = (value: unknown): Progress => {
  const p = (value ?? {}) as Partial<Progress>;

  return { sent: { ...(p.sent ?? {}) }, skipped: { ...(p.skipped ?? {}) } };
};

const CAMPAIGN_FIELDS = {
  id: true,
  name: true,
  kind: true,
  occasion: true,
  status: true,
  sendOn: true,
  ownerId: true,
  audience: true,
  messageEn: true,
  messageMs: true,
  messageZh: true,
  content: true,
  progress: true,
  media: { fileId: true, label: true, url: true, extension: true },
  createdAt: true,
} as const;

const toRow = (node: Record<string, unknown>): CampaignRow => ({
  id: node.id as string,
  name: (node.name as string) ?? '',
  kind: (node.kind as string) ?? 'GREETING',
  occasion: (node.occasion as string) ?? 'CUSTOM',
  status: (node.status as string) ?? 'DRAFT',
  sendOn: (node.sendOn as string | null) ?? null,
  ownerId: (node.ownerId as string | null) ?? null,
  audience: asAudience(node.audience),
  messages: { EN: (node.messageEn as string) ?? '', MS: (node.messageMs as string) ?? '', ZH: (node.messageZh as string) ?? '' },
  content: (node.content as NewsletterContent | null) ?? null,
  progress: asProgress(node.progress),
  media: ((node.media as Array<{ fileId?: string; label?: string; url?: string; extension?: string | null }> | null) ?? [])
    .filter((f) => f?.fileId && f.url)
    .map((f) => ({
      fileId: f.fileId as string,
      label: f.label || 'file',
      url: f.url as string,
      extension: (f.extension ?? '').replace(/^\./, '').toLowerCase() || (f.label?.split('.').pop()?.toLowerCase() ?? ''),
    })),
  createdAt: (node.createdAt as string) ?? '',
});

const loadCampaign = async (client: CoreApiClient, id: string) => {
  const { campaigns } = await client.query({
    campaigns: { __args: { filter: { id: { eq: id } }, first: 1 }, edges: { node: CAMPAIGN_FIELDS } },
  } as never) as { campaigns?: { edges?: Array<{ node: Record<string, unknown> }> } };
  const node = campaigns?.edges?.[0]?.node;

  return node ? toRow(node) : null;
};

// ---------------------------------------------------------------- people and audiences

type PersonRow = { id: string; name: string; firstName: string; phone: string | null; tags: string[]; language: Language; optedOut: boolean };
type TenancyRow = { tenantId: string; status: string; ownerId: string | null; property: string };

const loadPeople = async (client: CoreApiClient): Promise<PersonRow[]> => {
  const rows: PersonRow[] = [];
  let after: string | undefined;

  for (;;) {
    const { people: page } = (await client.query({
      people: {
        __args: { first: 200, ...(after ? { after } : {}) },
        edges: {
          node: {
            id: true,
            name: { firstName: true, lastName: true },
            phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
            tags: true,
            language: true,
            noCampaigns: true,
          },
        },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    } as never)) as {
      people?: {
        edges?: Array<{ node: { id: string; name?: { firstName?: string; lastName?: string }; phones?: never; tags?: string[] | null; language?: string | null; noCampaigns?: boolean | null } }>;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string };
      };
    };

    for (const { node } of page?.edges ?? []) {
      const first = node.name?.firstName?.trim() ?? '';

      rows.push({
        id: node.id,
        name: [first, node.name?.lastName?.trim()].filter(Boolean).join(' ') || 'Someone',
        firstName: first,
        phone: toE164(node.phones ?? null),
        tags: node.tags ?? [],
        language: node.language === 'MS' || node.language === 'ZH' ? node.language : 'EN',
        optedOut: Boolean(node.noCampaigns),
      });
    }
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor || rows.length >= 5000) break;
    after = page.pageInfo.endCursor;
  }

  return rows;
};

const loadTenancies = async (client: CoreApiClient): Promise<TenancyRow[]> => {
  const { rentals } = await client.query({
    rentals: {
      __args: { first: 500 },
      edges: { node: { tenantId: true, status: true, property: { name: true, ownerId: true } } },
    },
  });

  return (rentals?.edges ?? [])
    .filter(({ node }) => node.tenantId)
    .map(({ node }) => ({
      tenantId: node.tenantId as string,
      status: (node.status as string) ?? '',
      ownerId: node.property?.ownerId ?? null,
      property: node.property?.name ?? '',
    }));
};

const TAG_LABEL = Object.fromEntries(PERSON_TAGS.map((t) => [t.value, t.label.replace(' (tag)', '')]));

// Who a campaign goes to. People without workspace-wide access only ever
// reach the tenants of contracts in their workspaces.
const buildAudience = (scope: Scope, audience: Audience, people: PersonRow[], tenancies: TenancyRow[]) => {
  const mine = tenancies.filter((t) => inScope(scope, t.ownerId));
  const reachable = scope.all ? null : new Set(mine.map((t) => t.tenantId));
  const reasons = new Map<string, string[]>();
  const add = (personId: string, reason: string) => reasons.set(personId, [...(reasons.get(personId) ?? []), reason]);

  if (audience.tenants !== 'none') {
    for (const t of mine) {
      if (audience.tenants === 'active' && t.status !== 'ACTIVE') continue;
      if (t.status === 'DRAFT') continue;
      if (audience.ownerIds.length && !audience.ownerIds.includes(t.ownerId ?? '')) continue;
      add(t.tenantId, `Tenant · ${t.property || 'contract'}`);
    }
  }
  for (const person of people) {
    for (const tag of person.tags) if (audience.tags.includes(tag)) add(person.id, TAG_LABEL[tag] ?? tag);
  }
  for (const id of audience.include) add(id, 'Added');

  const byId = new Map(people.map((p) => [p.id, p]));
  const excluded = new Set(audience.exclude);
  let optedOut = 0;
  let noPhone = 0;
  const list: Array<PersonRow & { reasons: string[] }> = [];

  for (const [personId, why] of reasons) {
    const person = byId.get(personId);

    if (!person || excluded.has(personId) || (reachable && !reachable.has(personId))) continue;
    if (person.optedOut) {
      optedOut += 1;
      continue;
    }
    if (!person.phone) noPhone += 1;
    list.push({ ...person, reasons: [...new Set(why)] });
  }

  list.sort((a, b) => a.name.localeCompare(b.name));

  return { list, optedOut, noPhone };
};

// ---------------------------------------------------------------- handler

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (!body.action || body.action === 'list') {
      const [{ campaigns }, { owners }] = await Promise.all([
        client.query({
          campaigns: { __args: { first: 200, orderBy: [{ createdAt: 'DescNullsLast' }] }, edges: { node: CAMPAIGN_FIELDS } },
        } as never) as Promise<{ campaigns?: { edges?: Array<{ node: Record<string, unknown> }> } }>,
        client.query({ owners: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true } } } }),
      ]);

      return json({
        success: true,
        campaigns: (campaigns?.edges ?? []).map(({ node }) => toRow(node)).filter((c) => inScope(scope, c.ownerId)),
        owners: (owners?.edges ?? []).map(({ node }) => ({ id: node.id, name: node.name ?? 'Workspace' })).filter((o) => inScope(scope, o.id)),
        canUseTags: scope.all,
      });
    }

    if (body.action === 'count') {
      const [people, tenancies] = await Promise.all([loadPeople(client), loadTenancies(client)]);
      const result = buildAudience(scope, asAudience(body.audience), people, tenancies);

      const byLanguage: Record<string, number> = {};

      for (const p of result.list) byLanguage[p.language] = (byLanguage[p.language] ?? 0) + 1;

      return json({ success: true, total: result.list.length, noPhone: result.noPhone, optedOut: result.optedOut, sample: result.list.slice(0, 6).map((p) => p.name), byLanguage });
    }

    if (body.action === 'people') {
      const term = (body.query ?? '').trim().toLowerCase();
      const [people, tenancies] = await Promise.all([loadPeople(client), loadTenancies(client)]);
      const reachable = scope.all ? null : new Set(tenancies.filter((t) => inScope(scope, t.ownerId)).map((t) => t.tenantId));

      return json({
        success: true,
        people: people
          .filter((p) => !reachable || reachable.has(p.id))
          .filter((p) => !term || p.name.toLowerCase().includes(term))
          .slice(0, 25)
          .map((p) => ({ id: p.id, name: p.name, phone: p.phone, optedOut: p.optedOut })),
      });
    }

    if (body.action === 'save') {
      const input = body.campaign ?? {};
      const existing = input.id ? await loadCampaign(client, input.id) : null;

      if (input.id && !existing) return fail('Campaign not found.', 404);
      if (existing && !inScope(scope, existing.ownerId)) return json(NOT_ALLOWED, 403);

      const ownerId = input.ownerId ?? existing?.ownerId ?? null;

      if (!inScope(scope, ownerId)) return json(NOT_ALLOWED, 403);
      if (!input.name?.trim()) return fail('Give the campaign a name.');

      const messages = input.messages ?? { EN: '', MS: '', ZH: '' };

      if (![messages.EN, messages.MS, messages.ZH].some((m) => m?.trim())) return fail('Write the message (at least one language).');

      const data = {
        name: input.name.trim().slice(0, 200),
        kind: CAMPAIGN_KINDS.some((k) => k.value === input.kind) ? input.kind : 'GREETING',
        occasion: OCCASIONS.some((o) => o.value === input.occasion) ? input.occasion : 'CUSTOM',
        status: input.status === 'DRAFT' ? 'DRAFT' : existing?.status === 'SENDING' || existing?.status === 'DONE' ? existing.status : 'SCHEDULED',
        sendOn: /^\d{4}-\d{2}-\d{2}$/.test(input.sendOn ?? '') ? input.sendOn : todayIso(),
        ownerId,
        audience: asAudience(input.audience),
        messageEn: (messages.EN ?? '').slice(0, 4000),
        messageMs: (messages.MS ?? '').slice(0, 4000),
        messageZh: (messages.ZH ?? '').slice(0, 4000),
        content: input.content ?? null,
      };

      if (existing) {
        await client.mutation({ updateCampaign: { __args: { id: existing.id, data }, id: true } } as never);

        return json({ success: true, id: existing.id });
      }

      const created = (await client.mutation({
        createCampaign: { __args: { data: { ...data, progress: EMPTY_PROGRESS } }, id: true },
      } as never)) as { createCampaign?: { id?: string } };

      return json({ success: true, id: created.createCampaign?.id });
    }

    // ---- one campaign
    if (!body.id) return fail('Pick a campaign.');

    const campaign = await loadCampaign(client, body.id);

    if (!campaign) return fail('Campaign not found.', 404);
    if (!inScope(scope, campaign.ownerId)) return json(NOT_ALLOWED, 403);

    if (body.action === 'delete') {
      await client.mutation({ deleteCampaign: { __args: { id: campaign.id }, id: true } } as never);

      return json({ success: true, message: 'Campaign deleted (it can be restored from the Campaigns table).' });
    }

    if (body.action === 'recipients') {
      const [people, tenancies] = await Promise.all([loadPeople(client), loadTenancies(client)]);
      const result = buildAudience(scope, campaign.audience, people, tenancies);
      const recipients: Recipient[] = result.list.map((p) => ({
        id: p.id,
        name: p.name,
        firstName: p.firstName,
        phone: p.phone,
        language: p.language,
        reasons: p.reasons,
        status: campaign.progress.sent[p.id] ? 'sent' : campaign.progress.skipped[p.id] ? 'skipped' : 'pending',
      }));

      return json({ success: true, campaign, recipients, optedOut: result.optedOut, noPhone: result.noPhone });
    }

    if (body.action === 'mark') {
      if (!body.personId) return fail('Pick a person.');

      const progress = asProgress(campaign.progress);

      delete progress.sent[body.personId];
      delete progress.skipped[body.personId];
      if (body.status === 'sent') progress.sent[body.personId] = new Date().toISOString();
      if (body.status === 'skipped') progress.skipped[body.personId] = new Date().toISOString();

      // Done once everyone reachable is sent or skipped.
      const [people, tenancies] = await Promise.all([loadPeople(client), loadTenancies(client)]);
      const audience = buildAudience(scope, campaign.audience, people, tenancies).list;
      const handled = audience.filter((p) => progress.sent[p.id] || progress.skipped[p.id]).length;
      const status = audience.length > 0 && handled >= audience.length ? 'DONE' : handled > 0 ? 'SENDING' : campaign.status === 'DRAFT' ? 'DRAFT' : 'SCHEDULED';

      await client.mutation({ updateCampaign: { __args: { id: campaign.id, data: { progress, status } }, id: true } } as never);

      return json({ success: true, status, handled, total: audience.length });
    }

    return fail('Unknown action.');
  } catch (error) {
    console.error('[rental] campaigns route failed:', error);

    return fail(error instanceof Error ? error.message : String(error), 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: CAMPAIGNS_ROUTE_FUNCTION_ID,
  name: 'campaigns-route',
  description: 'Greetings, newsletters and announcements: audiences, messages and who has been sent them.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/campaigns', httpMethod: 'POST', isAuthRequired: true },
});
