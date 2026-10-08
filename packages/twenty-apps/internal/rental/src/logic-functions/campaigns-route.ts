import { type CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { CAMPAIGNS_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v4';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { inScope, NOT_ALLOWED, resolveScope, type Scope } from 'src/logic-functions/utils/scope';
import { buildSmartRecipients } from 'src/logic-functions/utils/smart-audience';
import { loadChases, recordChase } from 'src/logic-functions/utils/rent-chase';
import { chaseNote, isRecentChase } from 'src/shared/rent-chase';
import { asAudience, asOptions, asProgress, asRepeat, CAMPAIGN_FIELDS, rollCampaigns, toRow } from 'src/logic-functions/utils/campaign-rows';
import {
  type Audience,
  CAMPAIGN_KINDS,
  type CampaignRow,
  EMPTY_PROGRESS,
  type Language,
  OCCASIONS,
  PERSON_TAGS,
  type Progress,
  type Recipient,
  CAMPAIGN_SOURCES,
  cycleStart,
  repeatCycle,
  type SourceOptions,
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
  source?: string;
  sourceOptions?: SourceOptions;
  key?: string; // which row to mark (person, or "person|thing")
  name?: string;
  ownerId?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ success: false, message }, status);

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
const buildAudience = (scope: Scope, audience: Audience, people: PersonRow[], tenancies: TenancyRow[], replied: Map<string, string> = new Map()) => {
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
  for (const [personId, outcome] of replied) add(personId, `Replied: ${outcome.toLowerCase().replace(/_/g, ' ')}`);

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

// People who answered an earlier campaign a certain way (latest answer wins).
const loadReplied = async (client: CoreApiClient, scope: Scope, audience: Audience) => {
  const replied = new Map<string, string>();

  if (!audience.fromReplies) return replied;

  // Only replies to your own campaigns.
  const source = await loadCampaign(client, audience.fromReplies.campaignId);

  if (!source || !inScope(scope, source.ownerId)) return replied;

  const { contactActivities } = (await client.query({
    contactActivities: {
      __args: { filter: { campaignId: { eq: audience.fromReplies.campaignId } }, first: 500, orderBy: [{ createdAt: 'AscNullsLast' }] },
      edges: { node: { personId: true, kind: true } },
    },
  } as never)) as { contactActivities?: { edges?: Array<{ node: { personId?: string | null; kind?: string | null } }> } };
  const latest = new Map<string, string>();

  for (const { node } of contactActivities?.edges ?? []) if (node.personId && node.kind) latest.set(node.personId, node.kind);
  for (const [personId, kind] of latest) if (audience.fromReplies.outcomes.includes(kind)) replied.set(personId, kind);

  return replied;
};

type Row = Omit<Recipient, 'status'> & { optedOut: boolean };

// Everyone a campaign goes to, one row per message.
const campaignRows = async (
  client: CoreApiClient,
  scope: Scope,
  campaign: { source: string; sourceOptions: SourceOptions; audience: Audience; progress?: Progress },
) => {
  if (campaign.source && campaign.source !== 'NONE') {
    const handled = new Set([...Object.keys(campaign.progress?.sent ?? {}), ...Object.keys(campaign.progress?.skipped ?? {})]);
    const smart = await buildSmartRecipients(client, scope, campaign.source, campaign.sourceOptions, handled);

    return {
      rows: smart.map((x): Row => ({ id: x.key, personId: x.personId, name: x.name, firstName: x.firstName, phone: x.phone, language: x.language, reasons: x.reasons, values: x.values, attachment: x.attachment, chase: x.chase, optedOut: false })),
      optedOut: 0,
      noPhone: smart.filter((x) => !x.phone).length,
    };
  }

  const [people, tenancies, replied] = await Promise.all([loadPeople(client), loadTenancies(client), loadReplied(client, scope, campaign.audience)]);
  const result = buildAudience(scope, campaign.audience, people, tenancies, replied);

  return {
    rows: result.list.map((p): Row => ({ id: p.id, personId: p.id, name: p.name, firstName: p.firstName, phone: p.phone, language: p.language, reasons: p.reasons, values: { name: p.firstName }, optedOut: false })),
    optedOut: result.optedOut,
    noPhone: result.noPhone,
  };
};

// ---------------------------------------------------------------- handler

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (!body.action || body.action === 'list') {
      const loadAll = async () =>
        ((await client.query({
          campaigns: { __args: { first: 200, orderBy: [{ createdAt: 'DescNullsLast' }] }, edges: { node: CAMPAIGN_FIELDS } },
        } as never)) as { campaigns?: { edges?: Array<{ node: Record<string, unknown> }> } }).campaigns?.edges?.map(({ node }) => toRow(node)) ?? [];

      await rollCampaigns(client, (await loadAll()).filter((c) => inScope(scope, c.ownerId)));

      const [{ campaigns }, { owners }, audiences] = await Promise.all([
        client.query({
          campaigns: { __args: { first: 200, orderBy: [{ createdAt: 'DescNullsLast' }] }, edges: { node: CAMPAIGN_FIELDS } },
        } as never) as Promise<{ campaigns?: { edges?: Array<{ node: Record<string, unknown> }> } }>,
        client.query({ owners: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true } } } }),
        client.query({
          savedAudiences: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true, audience: true, ownerId: true } } },
        } as never) as Promise<{ savedAudiences?: { edges?: Array<{ node: { id: string; name?: string; audience?: unknown; ownerId?: string | null } }> } }>,
      ]);

      return json({
        success: true,
        campaigns: (campaigns?.edges ?? []).map(({ node }) => toRow(node)).filter((c) => inScope(scope, c.ownerId)),
        owners: (owners?.edges ?? []).map(({ node }) => ({ id: node.id, name: node.name ?? 'Workspace' })).filter((o) => inScope(scope, o.id)),
        canUseTags: scope.all,
        audiences: (audiences.savedAudiences?.edges ?? [])
          .filter(({ node }) => inScope(scope, node.ownerId ?? null))
          .map(({ node }) => ({ id: node.id, name: node.name ?? 'Audience', audience: asAudience(node.audience), ownerId: node.ownerId ?? null })),
      });
    }

    // ---- saved audiences
    if (body.action === 'saveAudience') {
      if (!body.name?.trim()) return fail('Name the audience.');
      if (!inScope(scope, body.ownerId ?? null)) return json(NOT_ALLOWED, 403);

      const created = (await client.mutation({
        createSavedAudience: { __args: { data: { name: body.name.trim().slice(0, 120), audience: asAudience(body.audience), ownerId: body.ownerId ?? null } }, id: true },
      } as never)) as { createSavedAudience?: { id?: string } };

      return json({ success: true, id: created.createSavedAudience?.id, message: 'Audience saved.' });
    }

    if (body.action === 'deleteAudience') {
      const { savedAudiences } = (await client.query({
        savedAudiences: { __args: { filter: { id: { eq: body.id ?? '' } }, first: 1 }, edges: { node: { id: true, ownerId: true } } },
      } as never)) as { savedAudiences?: { edges?: Array<{ node: { id: string; ownerId?: string | null } }> } };
      const saved = savedAudiences?.edges?.[0]?.node;

      if (!saved) return fail('Not found.', 404);
      if (!inScope(scope, saved.ownerId ?? null)) return json(NOT_ALLOWED, 403);
      await client.mutation({ deleteSavedAudience: { __args: { id: saved.id }, id: true } } as never);

      return json({ success: true });
    }

    if (body.action === 'count') {
      const result = await campaignRows(client, scope, {
        source: CAMPAIGN_SOURCES.some((x) => x.value === body.source) ? (body.source as string) : 'NONE',
        sourceOptions: asOptions(body.sourceOptions),
        audience: asAudience(body.audience),
      });
      const byLanguage: Record<string, number> = {};

      for (const p of result.rows) byLanguage[p.language] = (byLanguage[p.language] ?? 0) + 1;

      return json({
        success: true,
        total: result.rows.length,
        noPhone: result.noPhone,
        optedOut: result.optedOut,
        sample: result.rows.slice(0, 6).map((p) => p.name),
        sampleValues: result.rows[0]?.values ?? null,
        byLanguage,
      });
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
        status:
          input.status === 'DRAFT' || input.status === 'TEMPLATE'
            ? input.status
            : existing?.status === 'SENDING' || existing?.status === 'DONE'
              ? existing.status
              : 'SCHEDULED',
        // A repeating campaign is due on its day in the current round.
        sendOn:
          asRepeat(input.repeat).every !== 'NONE'
            ? cycleStart(asRepeat(input.repeat), todayIso())
            : /^\d{4}-\d{2}-\d{2}$/.test(input.sendOn ?? '')
              ? input.sendOn
              : todayIso(),
        ownerId,
        audience: asAudience(input.audience),
        messageEn: (messages.EN ?? '').slice(0, 4000),
        messageMs: (messages.MS ?? '').slice(0, 4000),
        messageZh: (messages.ZH ?? '').slice(0, 4000),
        content: input.content ?? null,
        source: CAMPAIGN_SOURCES.some((x) => x.value === input.source) ? input.source : 'NONE',
        sourceOptions: (({ year, ...rest }) => (asRepeat(input.repeat).every === 'NONE' && year ? { ...rest, year } : rest))(asOptions(input.sourceOptions)),
        repeat: asRepeat(input.repeat),
      };

      if (existing) {
        await client.mutation({ updateCampaign: { __args: { id: existing.id, data }, id: true } } as never);

        return json({ success: true, id: existing.id });
      }

      // Media copied from a template must belong to a campaign you can see.
      const media: Array<{ fileId: string; label: string }> = [];

      if (input.media?.length) {
        const { campaigns: all } = (await client.query({
          campaigns: { __args: { first: 300 }, edges: { node: { ownerId: true, media: { fileId: true } } } },
        } as never)) as { campaigns?: { edges?: Array<{ node: { ownerId?: string | null; media?: Array<{ fileId?: string }> | null } }> } };
        const allowed = new Set(
          (all?.edges ?? []).filter(({ node }) => inScope(scope, node.ownerId ?? null)).flatMap(({ node }) => (node.media ?? []).map((m) => m.fileId)),
        );

        for (const m of input.media) if (m.fileId && allowed.has(m.fileId)) media.push({ fileId: m.fileId, label: m.label });
      }

      // A repeating campaign starts in the round it's created in.
      let cycle = repeatCycle(data.repeat, todayIso());
      const late = data.repeat.every === 'YEARLY' && Date.parse(todayIso()) - Date.parse(cycleStart(data.repeat, todayIso())) > 31 * 86_400_000;

      if (late) {
        // e.g. year statements set up in October: this year's round is over,
        // the first one is next January.
        data.sendOn = cycleStart(data.repeat, `${Number(todayIso().slice(0, 4)) + 1}-01-01`);
      } else if (todayIso() < cycleStart(data.repeat, todayIso())) {
        cycle = '';
      }
      const created = (await client.mutation({
        createCampaign: {
          __args: {
            data: {
              ...data,
              progress: { ...EMPTY_PROGRESS, ...(cycle ? { cycle } : {}) },
              // Copied from a template / campaign: only files of your own campaigns.
              ...(media.length ? { media } : {}),
            },
          },
          id: true,
        },
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
      const result = await campaignRows(client, scope, campaign);
      // Rent due: say when a tenant was already reminded another way, so
      // they aren't chased twice in a few days.
      const chases = campaign.source === 'RENT_DUE' ? await loadChases(client) : {};
      const today = todayIso();
      // Rows already sent this round stay listed even if the data moved on
      // (e.g. a receipt now marked sent).
      const recipients: Recipient[] = result.rows.map(({ optedOut: _optedOut, ...row }) => {
        const status = campaign.progress.sent[row.id] ? 'sent' : campaign.progress.skipped[row.id] ? 'skipped' : 'pending';
        const chase = row.chase ? chases[row.chase.contractId] : undefined;

        return {
          ...row,
          status,
          ...(status === 'pending' && chase && isRecentChase(chase, today) ? { reasons: [`⚠ ${chaseNote(chase, today)}`, ...row.reasons] } : {}),
        };
      });

      return json({ success: true, campaign, recipients, optedOut: result.optedOut, noPhone: result.noPhone });
    }

    if (body.action === 'mark') {
      const key = body.key ?? body.personId;

      if (!key) return fail('Pick a person.');

      const wasSent = Boolean(campaign.progress.sent[key]);
      const rows = (await campaignRows(client, scope, { ...campaign, progress: { ...campaign.progress, sent: { ...campaign.progress.sent, [key]: 'now' } } })).rows;

      // Re-read just before writing and change only this key, so two quick
      // taps don't overwrite each other.
      const fresh = await loadCampaign(client, campaign.id);
      const progress = asProgress(fresh?.progress ?? campaign.progress);

      delete progress.sent[key];
      delete progress.skipped[key];
      if (body.status === 'sent') progress.sent[key] = new Date().toISOString();
      if (body.status === 'skipped') progress.skipped[key] = new Date().toISOString();
      // Ticks belong to this round, even when sent before its start day.
      if (campaign.repeat.every !== 'NONE' && !progress.cycle) progress.cycle = repeatCycle(campaign.repeat, todayIso());

      // A rent-due message sent: recorded with every other rent reminder, so
      // automatic reminders and Today don't chase the tenant again soon.
      if (campaign.source === 'RENT_DUE' && body.status === 'sent') {
        const row = rows.find((x) => x.id === key);

        if (row?.chase) {
          // Late months as an overdue reminder; months not due yet as an
          // early one (so the overdue reminder can still follow if unpaid).
          const late = row.chase.overdue ?? row.chase.months;
          const early = row.chase.months.filter((m) => !late.includes(m));
          const base = { contractId: row.chase.contractId, channel: 'CAMPAIGN' as const, status: 'SENT' as const, title: `Campaign · ${campaign.name} · ${row.name}`, to: row.phone, body: '' };

          if (late.length) await recordChase(client, { ...base, months: late, kind: 'RENT_OVERDUE' });
          if (early.length) await recordChase(client, { ...base, months: early, kind: 'RENT_UPCOMING' });
        }
      }

      // A receipt sent through the campaign counts as sent to the tenant.
      // Undo puts it back to issued — only if this campaign sent it.
      if (campaign.source === 'RECEIPTS' && (body.status === 'sent' || (body.status === 'pending' && wasSent))) {
        const row = rows.find((x) => x.id === key);

        if (row?.attachment?.kind === 'receipt') {
          const sent = body.status === 'sent';

          await client.mutation({
            updateRentPayment: {
              __args: { id: row.attachment.paymentId, data: { status: sent ? 'SENT' : 'ISSUED', receiptSentAt: sent ? new Date().toISOString() : null } },
              id: true,
            },
          } as never);
        }
      }

      // Done once everyone is sent or skipped.
      const audience = rows;
      const handled = audience.filter((p) => progress.sent[p.id] || progress.skipped[p.id]).length;
      // For receipts the sent ones drop out of the list, so count what's left.
      const remaining = audience.filter((p) => !progress.sent[p.id] && !progress.skipped[p.id]).length;
      const status = (audience.length > 0 && handled >= audience.length) || (campaign.source === 'RECEIPTS' && remaining === 0 && handled > 0) ? 'DONE' : handled > 0 || Object.keys(progress.sent).length > 0 ? 'SENDING' : campaign.status === 'DRAFT' ? 'DRAFT' : 'SCHEDULED';

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
