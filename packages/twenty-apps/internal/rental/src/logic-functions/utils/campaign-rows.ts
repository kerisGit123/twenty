import { type CoreApiClient } from 'twenty-client-sdk/core';

import { todayIso } from 'src/logic-functions/utils/dates';
import {
  type Audience,
  type CampaignRow,
  cycleStart,
  DEFAULT_SOURCE_OPTIONS,
  EMPTY_AUDIENCE,
  EMPTY_PROGRESS,
  type NewsletterContent,
  NO_REPEAT,
  occasionOf,
  type Progress,
  type Repeat,
  repeatCycle,
  type SourceOptions,
} from 'src/shared/campaigns';

// Campaign records as rows, shared by the campaigns route and the hourly cron.

export const asAudience = (value: unknown): Audience => {
  const a = (value ?? {}) as Partial<Audience>;
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 2000) : []);

  return {
    tags: strings(a.tags),
    tenants: a.tenants === 'none' || a.tenants === 'all' ? a.tenants : a.tenants === 'active' ? 'active' : EMPTY_AUDIENCE.tenants,
    ownerIds: strings(a.ownerIds),
    include: strings(a.include),
    exclude: strings(a.exclude),
    ...(a.fromReplies && typeof a.fromReplies.campaignId === 'string'
      ? { fromReplies: { campaignId: a.fromReplies.campaignId, outcomes: strings(a.fromReplies.outcomes) } }
      : {}),
  };
};

export const asOptions = (value: unknown): SourceOptions => {
  const o = (value ?? {}) as Partial<SourceOptions>;

  return {
    ownerIds: Array.isArray(o.ownerIds) ? o.ownerIds.filter((x): x is string => typeof x === 'string') : [],
    status: o.status === 'due' ? 'due' : 'overdue',
    days: Number.isFinite(Number(o.days)) && Number(o.days) > 0 ? Math.min(366, Number(o.days)) : DEFAULT_SOURCE_OPTIONS.days,
    ...(Number.isInteger(Number(o.year)) && Number(o.year) > 2000 ? { year: Number(o.year) } : {}),
  };
};

export const asRepeat = (value: unknown): Repeat => {
  const x = (value ?? {}) as Partial<Repeat>;

  if (x.every !== 'DAILY' && x.every !== 'MONTHLY' && x.every !== 'YEARLY') return NO_REPEAT;

  return {
    every: x.every,
    ...(Number.isInteger(Number(x.day)) ? { day: Math.min(28, Math.max(1, Number(x.day))) } : {}),
    ...(Number.isInteger(Number(x.month)) ? { month: Math.min(12, Math.max(1, Number(x.month))) } : {}),
  };
};

export const asProgress = (value: unknown): Progress => {
  const p = (value ?? {}) as Partial<Progress>;

  return {
    sent: { ...(p.sent ?? {}) },
    skipped: { ...(p.skipped ?? {}) },
    ...(typeof p.cycle === 'string' && p.cycle ? { cycle: p.cycle } : {}),
    ...(typeof p.rolledTo === 'string' && p.rolledTo ? { rolledTo: p.rolledTo } : {}),
  };
};

export const CAMPAIGN_FIELDS = {
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
  source: true,
  sourceOptions: true,
  repeat: true,
  createdAt: true,
} as const;

export const toRow = (node: Record<string, unknown>): CampaignRow => ({
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
  source: (node.source as string) ?? 'NONE',
  sourceOptions: asOptions(node.sourceOptions),
  repeat: asRepeat(node.repeat),
  createdAt: (node.createdAt as string) ?? '',
});

// Repeating campaigns start a fresh round each day / month / year; greetings
// roll over to next year's date as a draft once sent.
export const rollCampaigns = async (client: CoreApiClient, rows: CampaignRow[]) => {
  const today = todayIso();
  let changed = false;

  for (const c of rows) {
    if (c.status === 'TEMPLATE' || c.status === 'DRAFT') continue;

    if (c.repeat.every !== 'NONE') {
      const cycle = repeatCycle(c.repeat, today);
      const start = cycleStart(c.repeat, today);

      if ((!c.progress.cycle || c.progress.cycle < cycle) && today >= start) {
        await client.mutation({
          updateCampaign: { __args: { id: c.id, data: { progress: { sent: {}, skipped: {}, cycle }, status: 'SCHEDULED', sendOn: start } }, id: true },
        } as never);
        changed = true;
      }
      continue;
    }

    // Rolled once only (recorded on the sent greeting), so deleting next
    // year's draft keeps it deleted.
    if (c.kind === 'GREETING' && c.occasion !== 'CUSTOM' && c.status === 'DONE' && c.sendOn && !c.progress.rolledTo) {
      const occasion = occasionOf(c.occasion);
      const next = Object.values(occasion.dates).filter((d) => d > (c.sendOn as string)).sort()[0];
      const planned = rows.some(
        (x) => x.occasion === c.occasion && x.id !== c.id && x.status !== 'TEMPLATE' && x.ownerId === c.ownerId && (x.sendOn ?? '').slice(0, 4) === (next ?? '').slice(0, 4),
      );

      if (!next) continue;

      // Claim the roll first so a parallel run doesn't make a second draft.
      await client.mutation({
        updateCampaign: { __args: { id: c.id, data: { progress: { ...c.progress, rolledTo: next } } }, id: true },
      } as never);
      changed = true;

      if (!planned) {
        await client.mutation({
          createCampaign: {
            __args: {
              data: {
                name: `${occasion.label} ${next.slice(0, 4)}`,
                kind: c.kind,
                occasion: c.occasion,
                status: 'DRAFT',
                sendOn: next,
                ownerId: c.ownerId,
                audience: c.audience,
                messageEn: c.messages.EN,
                messageMs: c.messages.MS,
                messageZh: c.messages.ZH,
                media: c.media.map((m) => ({ fileId: m.fileId, label: m.label })),
                progress: EMPTY_PROGRESS,
                source: 'NONE',
              },
            },
            id: true,
          },
        } as never);
        changed = true;
      }
    }
  }

  return changed;
};



export const rollAllCampaigns = async (client: CoreApiClient) => {
  const { campaigns } = (await client.query({
    campaigns: { __args: { first: 200, orderBy: [{ createdAt: 'DescNullsLast' }] }, edges: { node: CAMPAIGN_FIELDS } },
  } as never)) as { campaigns?: { edges?: Array<{ node: Record<string, unknown> }> } };

  return rollCampaigns(client, (campaigns?.edges ?? []).map(({ node }) => toRow(node)));
};
