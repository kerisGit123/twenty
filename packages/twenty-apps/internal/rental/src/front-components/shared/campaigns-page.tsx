import { type CSSProperties, type ReactNode, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { AppPath, copyToClipboard, enqueueSnackbar, navigate } from 'twenty-sdk/front-component';

import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { Sheet } from 'src/front-components/shared/sheet';
import { todayIso } from 'src/logic-functions/utils/dates';
import {
  type Audience,
  CAMPAIGN_KINDS,
  CAMPAIGN_STATUSES,
  type CampaignRow,
  EMPTY_AUDIENCE,
  EMPTY_NEWSLETTER,
  kindOf,
  type Language,
  LANGUAGES,
  messageFor,
  type NewsletterContent,
  newsletterText,
  OCCASIONS,
  occasionOf,
  PERSON_TAGS,
  type Recipient,
  upcomingOccasions,
} from 'src/shared/campaigns';

// Campaigns: holiday greetings, newsletters and announcements, sent from your
// own WhatsApp — one tap per person, each in their language, with who's been
// sent it ticked off. Copy the text for a broadcast list or group too.

type Owner = { id: string; name: string };
type ListResult = { success: boolean; message?: string; campaigns?: CampaignRow[]; owners?: Owner[]; canUseTags?: boolean };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '—');
const daysUntil = (today: string, iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;

const post = <T,>(body: Record<string, unknown>) => new RestApiClient().post<T & { success: boolean; message?: string }>('/s/campaigns', body);

// ---------------------------------------------------------------- styles

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  accent: 'var(--t-color-blue9)',
  radius: 'var(--t-border-radius-md)',
  green: '#25D366',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 34,
  padding: '0 10px',
  boxSizing: 'border-box',
  minWidth: 0,
};

const button = (tone: 'plain' | 'primary' | 'whatsapp' | 'danger' = 'plain'): CSSProperties => ({
  ...control,
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  ...(tone === 'primary' ? { background: c.accent, color: '#fff', border: `1px solid ${c.accent}` } : {}),
  ...(tone === 'whatsapp' ? { background: c.green, color: '#fff', border: `1px solid ${c.green}` } : {}),
  ...(tone === 'danger' ? { color: 'var(--t-color-red11)' } : {}),
});

const chip = (active: boolean): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 13,
  fontWeight: 500,
  height: 32,
  padding: '0 12px',
  borderRadius: 16,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  background: active ? 'var(--t-color-blue3)' : c.bg,
  color: active ? 'var(--t-color-blue11)' : c.text,
  border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
});

const pill = (color: string): CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  padding: '3px 9px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
  background: `var(--t-color-${color}3)`,
  color: `var(--t-color-${color}11)`,
});

const card: CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 12, background: c.bg, boxSizing: 'border-box', minWidth: 0 };

const Label = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</span>
);

const SheetHeader = ({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) => (
  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 650, fontSize: 16 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: c.text3, marginTop: 2 }}>{sub}</div>}
    </div>
    <button onClick={onClose} style={{ ...button(), width: 32, height: 32, padding: 0, border: 'none', fontSize: 18, background: 'transparent' }} aria-label="Close">
      ×
    </button>
  </div>
);

// A WhatsApp-style bubble.
const Bubble = ({ text }: { text: string }) => (
  <div style={{ background: '#e5ddd5', borderRadius: 12, padding: 12 }}>
    <div
      style={{
        background: '#dcf8c6',
        color: '#111b21',
        borderRadius: '10px 10px 2px 10px',
        padding: '8px 10px',
        fontSize: 13.5,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        marginLeft: 'auto',
        maxWidth: '92%',
        boxShadow: '0 1px 1px rgba(0,0,0,0.12)',
        fontFamily: c.font,
      }}
    >
      {text || <span style={{ color: '#667781' }}>Your message shows here.</span>}
    </div>
  </div>
);

// ---------------------------------------------------------------- page

export const Campaigns = () => {
  const today = todayIso();
  const scope = useOwnerScope();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [canUseTags, setCanUseTags] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CampaignRow> | null>(null);
  const [sending, setSending] = useState<CampaignRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');

  const reload = useCallback(async () => {
    try {
      const result = await post<ListResult>({ action: 'list' });

      if (!result.success) throw new Error(result.message ?? 'Could not load campaigns.');
      setCampaigns(result.campaigns ?? []);
      setOwners(result.owners ?? []);
      setCanUseTags(Boolean(result.canUseTags));
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not load campaigns.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const mine = useMemo(() => campaigns.filter((x) => scope.matches(x.ownerId)), [campaigns, scope.key]);
  const ready = mine.filter((x) => (x.status === 'SCHEDULED' || x.status === 'SENDING') && (x.sendOn ?? today) <= today);
  const scheduled = mine.filter((x) => x.status === 'SCHEDULED' && (x.sendOn ?? today) > today);
  const drafts = mine.filter((x) => x.status === 'DRAFT');
  const done = mine.filter((x) => x.status === 'DONE');
  const upcoming = upcomingOccasions(today, 150).slice(0, 5);
  const defaultOwner = scope.ownerId || owners[0]?.id || '';

  const newCampaign = (kind: string, occasionValue?: string, date?: string) => {
    const occasion = occasionOf(occasionValue ?? 'CUSTOM');
    const year = (date ?? today).slice(0, 4);

    setEditing({
      kind,
      occasion: occasion.value,
      name: kind === 'GREETING' && occasion.value !== 'CUSTOM' ? `${occasion.label} ${year}` : kind === 'NEWSLETTER' ? `Newsletter – ${MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}` : '',
      sendOn: date ?? today,
      ownerId: defaultOwner,
      audience: { ...EMPTY_AUDIENCE },
      messages: kind === 'GREETING' ? { ...occasion.messages } : { EN: '', MS: '', ZH: '' },
      content: kind === 'NEWSLETTER' ? { ...EMPTY_NEWSLETTER, items: [{ headline: '', text: '', link: '' }] } : null,
      status: 'SCHEDULED',
    });
  };

  const remove = async (id: string) => {
    const result = await post<Record<string, never>>({ action: 'delete', id });

    await enqueueSnackbar({ message: result.message ?? (result.success ? 'Deleted.' : 'Could not delete.'), variant: result.success ? 'success' : 'error' });
    setConfirmDelete('');
    if (result.success) await reload();
  };

  const campaignCard = (x: CampaignRow) => {
    const kind = kindOf(x.kind);
    const occasion = occasionOf(x.occasion);
    const status = CAMPAIGN_STATUSES.find((s) => s.value === x.status) ?? CAMPAIGN_STATUSES[0];
    const sent = Object.keys(x.progress.sent).length;
    const skipped = Object.keys(x.progress.skipped).length;
    const due = x.sendOn ? daysUntil(today, x.sendOn) : 0;
    const isReady = (x.status === 'SCHEDULED' || x.status === 'SENDING') && due <= 0;

    return (
      <div key={x.id} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, ...(isReady ? { borderColor: 'var(--t-color-green7)' } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: c.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            {x.kind === 'GREETING' ? occasion.icon : kind.icon}
          </span>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
            <div style={{ fontSize: 13, color: c.text3 }}>
              {kind.label}
              {x.kind === 'GREETING' && x.occasion !== 'CUSTOM' ? ` · ${occasion.label}` : ''} · {x.status === 'DONE' ? 'sent' : 'send'} {day(x.sendOn)}
              {x.status === 'SCHEDULED' && due > 0 ? ` (in ${due} day${due === 1 ? '' : 's'})` : ''}
            </div>
          </div>
          <span style={pill(isReady ? 'green' : status.color)}>{isReady ? 'Ready to send' : status.label}</span>
        </div>
        {(sent > 0 || skipped > 0) && (
          <div style={{ fontSize: 12.5, color: c.text2 }}>
            ✅ {sent} sent{skipped ? ` · ${skipped} skipped` : ''}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {confirmDelete === x.id ? (
            <>
              <span style={{ fontSize: 13, color: c.text2, alignSelf: 'center', flex: 1 }}>Delete this campaign?</span>
              <button onClick={() => setConfirmDelete('')} style={button()}>
                Cancel
              </button>
              <button onClick={() => remove(x.id)} style={{ ...button(), background: 'var(--t-color-red9)', color: '#fff', border: '1px solid var(--t-color-red9)' }}>
                Delete
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirmDelete(x.id)} style={button('danger')} title="Delete">
                🗑
              </button>
              <button onClick={() => setEditing(x)} style={button()}>
                Edit
              </button>
              {x.status !== 'DRAFT' && (
                <button onClick={() => setSending(x)} style={button(isReady ? 'whatsapp' : 'plain')}>
                  {x.status === 'DONE' ? 'View' : isReady ? '💬 Send now' : 'Send early'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const section = (title: string, rows: CampaignRow[], hint?: string) =>
    rows.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <Label>{title}</Label>
          <span style={{ fontSize: 12, color: c.text3 }}>{hint ?? rows.length}</span>
        </div>
        {rows.map(campaignCard)}
      </div>
    );

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', containerType: 'size', boxSizing: 'border-box', position: 'relative' }}>
      {editing && (
        <Sheet width={640} onClose={() => setEditing(null)}>
          <CampaignEditor
            key={editing.id ?? 'new'}
            initial={editing}
            owners={owners}
            canUseTags={canUseTags}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await reload();
            }}
          />
        </Sheet>
      )}
      {sending && (
        <Sheet width={600} onClose={() => setSending(null)}>
          <SendPanel
            key={sending.id}
            campaignId={sending.id}
            onClose={() => setSending(null)}
            onChanged={reload}
          />
        </Sheet>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(4px, 2vw, 16px)', maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 650 }}>Campaigns</div>
            <div style={{ fontSize: 13, color: c.text3 }}>Holiday greetings, newsletters and announcements — sent from your WhatsApp, one tap per person.</div>
          </div>
          <OwnerSwitcher scope={scope} />
        </div>

        {/* Start one */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
          {CAMPAIGN_KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => newCampaign(k.value)}
              style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', ...card, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <span style={{ fontSize: 24 }}>{k.icon}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>New {k.label.toLowerCase()}</span>
                <span style={{ fontSize: 12, color: c.text3 }}>
                  {k.value === 'GREETING' ? 'Raya, CNY, Deepavali, Christmas…' : k.value === 'NEWSLETTER' ? 'Industry news, tips, updates' : 'Maintenance, new rules, changes'}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* Coming up */}
        {upcoming.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Coming up</Label>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {upcoming.map(({ occasion, date }) => {
                const planned = mine.some((x) => x.occasion === occasion.value && (x.sendOn ?? '').slice(0, 4) === date.slice(0, 4));
                const away = daysUntil(today, date);

                return (
                  <button
                    key={occasion.value}
                    onClick={() => newCampaign('GREETING', occasion.value, date)}
                    title={occasion.approx ? 'Date can move by a day — check the official announcement' : undefined}
                    style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', ...card, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 190 }}
                  >
                    <span style={{ fontSize: 22 }}>{occasion.icon}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{occasion.label}</span>
                      <span style={{ fontSize: 12, color: c.text3 }}>
                        {day(date)}
                        {occasion.approx ? '*' : ''} · {away === 0 ? 'today' : `in ${away} days`}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: planned ? 'var(--t-color-green11)' : 'var(--t-color-blue11)' }}>{planned ? '✓ Planned' : '＋ Plan greeting'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ color: c.text3, fontSize: 13, padding: 24, textAlign: 'center' }}>Loading…</div>
        ) : mine.length === 0 ? (
          <div style={{ ...card, color: c.text3, fontSize: 14, padding: '28px 16px', textAlign: 'center' }}>No campaigns yet — plan a greeting for the next holiday above.</div>
        ) : (
          <>
            {section('Ready to send', ready)}
            {section('Scheduled', scheduled)}
            {section('Drafts', drafts)}
            {section('Sent', done)}
          </>
        )}

        <div style={{ fontSize: 12, color: c.text3, lineHeight: 1.5 }}>
          Messages go out from your own WhatsApp: each tap opens the chat with the message written — press Send there. Want everyone at once? Use “Copy message” and paste it in a WhatsApp
          broadcast list (people who saved your number get it privately) or a group. People can opt out: tick “No greetings / newsletters” on their record.
        </div>
        <button onClick={() => navigate(AppPath.RecordIndexPage, { objectNamePlural: 'campaigns' })} style={{ ...button(), alignSelf: 'flex-start', border: 'none', background: 'transparent', fontSize: 12, color: c.text3 }}>
          Open as a table →
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- editor

const CampaignEditor = ({
  initial,
  owners,
  canUseTags,
  onClose,
  onSaved,
}: {
  initial: Partial<CampaignRow>;
  owners: Owner[];
  canUseTags: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const [kind, setKind] = useState(initial.kind ?? 'GREETING');
  const [occasion, setOccasion] = useState(initial.occasion ?? 'CUSTOM');
  const [name, setName] = useState(initial.name ?? '');
  const [sendOn, setSendOn] = useState(initial.sendOn ?? todayIso());
  const [ownerId, setOwnerId] = useState(initial.ownerId ?? owners[0]?.id ?? '');
  const [audience, setAudience] = useState<Audience>(initial.audience ?? { ...EMPTY_AUDIENCE });
  const [messages, setMessages] = useState<Record<Language, string>>(initial.messages ?? { EN: '', MS: '', ZH: '' });
  const [content, setContent] = useState<NewsletterContent>(initial.content ?? { ...EMPTY_NEWSLETTER });
  const [lang, setLang] = useState<Language>('EN');
  const [count, setCount] = useState<{ total: number; noPhone: number; optedOut: number; sample: string[] } | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Array<{ id: string; name: string; phone: string | null; optedOut: boolean }>>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Newsletters: the message is built from the newsletter fields.
  const built = kind === 'NEWSLETTER' ? newsletterText(content, lang) : '';
  const message = kind === 'NEWSLETTER' && lang === 'EN' ? built : messages[lang];

  useEffect(() => {
    if (kind === 'NEWSLETTER') setMessages((m) => ({ ...m, EN: newsletterText(content, 'EN') }));
  }, [kind, content]);

  // Live audience size.
  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(async () => {
      const result = await post<{ total?: number; noPhone?: number; optedOut?: number; sample?: string[] }>({ action: 'count', audience });

      if (result.success) setCount({ total: result.total ?? 0, noPhone: result.noPhone ?? 0, optedOut: result.optedOut ?? 0, sample: result.sample ?? [] });
    }, 400);
  }, [audience]);

  useEffect(() => {
    const term = search.trim();

    if (term.length < 2) {
      setFound([]);

      return;
    }

    const timer = setTimeout(async () => {
      const result = await post<{ people?: typeof found }>({ action: 'people', query: term });

      if (result.success) setFound(result.people ?? []);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const pickOccasion = (value: string) => {
    const o = occasionOf(value);
    const year = Number(sendOn.slice(0, 4));
    const date = o.dates[year] ?? o.dates[year + 1];

    setOccasion(value);
    setMessages({ ...o.messages });
    if (value !== 'CUSTOM') {
      setName(`${o.label} ${(date ?? sendOn).slice(0, 4)}`);
      if (date) setSendOn(date);
    }
  };

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const save = async (status: 'DRAFT' | 'SCHEDULED') => {
    setBusy(true);
    try {
      const result = await post<{ id?: string }>({
        action: 'save',
        campaign: {
          id: initial.id,
          name,
          kind,
          occasion: kind === 'GREETING' ? occasion : 'CUSTOM',
          status,
          sendOn,
          ownerId,
          audience,
          messages: kind === 'NEWSLETTER' ? { ...messages, EN: newsletterText(content, 'EN') } : messages,
          content: kind === 'NEWSLETTER' ? content : null,
        },
      });

      await enqueueSnackbar({
        message: result.success ? (status === 'DRAFT' ? 'Saved as a draft.' : `Scheduled for ${day(sendOn)} — it shows on Today.`) : result.message ?? 'Could not save.',
        variant: result.success ? 'success' : 'error',
      });
      if (result.success) await onSaved();
    } finally {
      setBusy(false);
    }
  };

  const occasionInfo = occasionOf(occasion);
  const sample = messageFor({ ...messages, EN: kind === 'NEWSLETTER' ? built || messages.EN : messages.EN }, lang, (count?.sample[0] ?? 'Ahmad').split(' ')[0]);

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <SheetHeader title={initial.id ? 'Edit campaign' : `New ${kindOf(kind).label.toLowerCase()}`} onClose={onClose} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Kind */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CAMPAIGN_KINDS.map((k) => (
            <button key={k.value} onClick={() => setKind(k.value)} style={chip(kind === k.value)}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>

        {kind === 'GREETING' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Occasion</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {OCCASIONS.map((o) => (
                <button key={o.value} onClick={() => pickOccasion(o.value)} style={chip(occasion === o.value)}>
                  {o.icon} {o.label}
                </button>
              ))}
            </div>
            {occasionInfo.approx && <span style={{ fontSize: 12, color: c.text3 }}>* {occasionInfo.label} follows the moon — the date can move by a day once officially announced.</span>}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
            Name
            <input value={name} onChange={(e) => setName(readValue(e))} placeholder="e.g. Deepavali 2026" style={control} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
            Send on
            <input type="date" value={sendOn} onChange={(e) => { const v = readValue(e); if (v) setSendOn(v); }} style={control} />
          </label>
          {owners.length > 1 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
              Workspace
              <select value={ownerId} onChange={(e) => setOwnerId(readValue(e))} style={control}>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Newsletter builder */}
        {kind === 'NEWSLETTER' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Newsletter</Label>
            <input value={content.title} onChange={(e) => setContent({ ...content, title: readValue(e) })} placeholder="Title, e.g. Property update – October" style={control} />
            <textarea value={content.intro} onChange={(e) => setContent({ ...content, intro: readValue(e) })} placeholder="Intro (optional) — Hi {name}, here’s what’s new this month…" rows={2} style={{ ...control, height: 'auto', padding: '8px 10px', resize: 'vertical' }} />
            {content.items.map((item, index) => (
              <div key={index} style={{ ...card, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: c.bg2 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c.text3 }}>Story {index + 1}</span>
                  <span style={{ flex: 1 }} />
                  {content.items.length > 1 && (
                    <button onClick={() => setContent({ ...content, items: content.items.filter((_, i) => i !== index) })} style={{ ...button(), height: 26, padding: '0 8px', fontSize: 12 }}>
                      Remove
                    </button>
                  )}
                </div>
                <input
                  value={item.headline}
                  onChange={(e) => setContent({ ...content, items: content.items.map((x, i) => (i === index ? { ...x, headline: readValue(e) } : x)) })}
                  placeholder="Headline, e.g. OPR stays at 2.75%"
                  style={control}
                />
                <textarea
                  value={item.text}
                  onChange={(e) => setContent({ ...content, items: content.items.map((x, i) => (i === index ? { ...x, text: readValue(e) } : x)) })}
                  placeholder="A line or two — what it means for them"
                  rows={2}
                  style={{ ...control, height: 'auto', padding: '8px 10px', resize: 'vertical' }}
                />
                <input
                  value={item.link}
                  onChange={(e) => setContent({ ...content, items: content.items.map((x, i) => (i === index ? { ...x, link: readValue(e) } : x)) })}
                  placeholder="Link (optional) — https://…"
                  style={control}
                />
              </div>
            ))}
            {content.items.length < 8 && (
              <button onClick={() => setContent({ ...content, items: [...content.items, { headline: '', text: '', link: '' }] })} style={{ ...button(), alignSelf: 'flex-start' }}>
                ＋ Add a story
              </button>
            )}
            <input value={content.closing} onChange={(e) => setContent({ ...content, closing: readValue(e) })} placeholder="Sign-off (optional), e.g. Have a great week! — Keris" style={control} />
            <button onClick={() => setContent({ ...content, optOut: !content.optOut })} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ width: 36, height: 20, borderRadius: 10, background: content.optOut ? c.accent : c.border2, position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: content.optOut ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: '#fff' }} />
              </span>
              Add “Reply STOP to stop these” at the end
            </button>
          </div>
        )}

        {/* Message per language */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Label>Message</Label>
            <span style={{ flex: 1 }} />
            {LANGUAGES.map((l) => (
              <button key={l.value} onClick={() => setLang(l.value)} style={{ ...chip(lang === l.value), height: 28 }}>
                {l.short}
                {(l.value === 'EN' && kind === 'NEWSLETTER' ? built : messages[l.value])?.trim() ? ' ✓' : ''}
              </button>
            ))}
          </div>
          {kind === 'NEWSLETTER' && lang === 'EN' ? (
            <span style={{ fontSize: 12, color: c.text3 }}>Built from the newsletter above. Add a Malay or Chinese version on their tabs (optional).</span>
          ) : (
            <textarea
              value={messages[lang]}
              onChange={(e) => setMessages({ ...messages, [lang]: readValue(e) })}
              placeholder={lang === 'EN' ? 'Hi {name}, …' : lang === 'MS' ? 'Salam {name}, …' : '{name}，…'}
              rows={6}
              style={{ ...control, height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.45 }}
            />
          )}
          <span style={{ fontSize: 12, color: c.text3 }}>
            {'{name}'} becomes each person’s first name. *bold* and _italic_ work in WhatsApp. People without their language written get English.
          </span>
          {kind === 'NEWSLETTER' && lang !== 'EN' && built.trim() && !messages[lang]?.trim() && (
            <button onClick={() => setMessages({ ...messages, [lang]: newsletterText(content, lang) })} style={{ ...button(), alignSelf: 'flex-start' }}>
              Start from the English version
            </button>
          )}
        </div>

        {/* Audience */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Who gets it</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                ['active', 'Current tenants'],
                ['all', 'All tenants (incl. past)'],
                ['none', 'No tenants'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} onClick={() => setAudience({ ...audience, tenants: value })} style={chip(audience.tenants === value)}>
                {label}
              </button>
            ))}
          </div>
          {owners.length > 1 && audience.tenants !== 'none' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: c.text3 }}>Tenants of</span>
              <button onClick={() => setAudience({ ...audience, ownerIds: [] })} style={{ ...chip(audience.ownerIds.length === 0), height: 28 }}>
                All my workspaces
              </button>
              {owners.map((o) => (
                <button key={o.id} onClick={() => setAudience({ ...audience, ownerIds: toggle(audience.ownerIds, o.id) })} style={{ ...chip(audience.ownerIds.includes(o.id)), height: 28 }}>
                  {o.name}
                </button>
              ))}
            </div>
          )}
          {canUseTags && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: c.text3 }}>Plus people tagged</span>
              {PERSON_TAGS.map((t) => (
                <button key={t.value} onClick={() => setAudience({ ...audience, tags: toggle(audience.tags, t.value) })} style={{ ...chip(audience.tags.includes(t.value)), height: 28 }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <input value={search} onChange={(e) => setSearch(readValue(e))} placeholder="🔍  Add someone by name" style={control} />
          {found.length > 0 && (
            <div style={{ ...card, maxHeight: 200, overflow: 'auto' }}>
              {found.map((p) => {
                const added = audience.include.includes(p.id);

                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setNames({ ...names, [p.id]: p.name });
                      setAudience({ ...audience, include: toggle(audience.include, p.id), exclude: audience.exclude.filter((x) => x !== p.id) });
                    }}
                    style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: '100%', display: 'flex', gap: 8, padding: '8px 12px', borderTop: `1px solid ${c.border}`, fontSize: 13 }}
                  >
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <span style={{ color: c.text3 }}>{p.optedOut ? 'opted out' : p.phone ? p.phone : 'no number'}</span>
                    <span style={{ color: added ? 'var(--t-color-green11)' : 'var(--t-color-blue11)', fontWeight: 600 }}>{added ? '✓ Added' : '＋ Add'}</span>
                  </button>
                );
              })}
            </div>
          )}
          {(audience.include.length > 0 || audience.exclude.length > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {audience.include.map((id) => (
                <button key={id} onClick={() => setAudience({ ...audience, include: audience.include.filter((x) => x !== id) })} style={{ ...chip(true), height: 28 }} title="Remove">
                  ＋ {names[id] ?? 'Added person'} ×
                </button>
              ))}
              {audience.exclude.length > 0 && (
                <button onClick={() => setAudience({ ...audience, exclude: [] })} style={{ ...chip(false), height: 28 }}>
                  {audience.exclude.length} left out · undo
                </button>
              )}
            </div>
          )}
          <div style={{ fontSize: 13, color: count?.total ? c.text : c.text3 }}>
            {count === null
              ? 'Counting…'
              : count.total === 0
                ? 'Nobody yet — pick tenants, tags or add people.'
                : `👥 ${count.total} ${count.total === 1 ? 'person' : 'people'}${count.sample.length ? ` (${count.sample.slice(0, 4).join(', ')}${count.total > 4 ? '…' : ''})` : ''}`}
            {count && count.noPhone > 0 ? <span style={{ color: 'var(--t-color-amber11)' }}> · {count.noPhone} without a phone number</span> : null}
            {count && count.optedOut > 0 ? <span style={{ color: c.text3 }}> · {count.optedOut} opted out</span> : null}
          </div>
        </div>

        {/* Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Preview ({LANGUAGES.find((l) => l.value === lang)?.label})</Label>
          <Bubble text={sample} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
        <button onClick={() => save('DRAFT')} disabled={busy} style={{ ...button(), flex: 1, height: 44 }}>
          Save draft
        </button>
        <button onClick={() => save('SCHEDULED')} disabled={busy || !message?.trim() && !messages.EN.trim()} style={{ ...button('primary'), flex: 1.6, height: 44 }}>
          {busy ? 'Saving…' : sendOn <= todayIso() ? 'Save — ready to send' : `Schedule for ${day(sendOn)}`}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- sending

const SendPanel = ({ campaignId, onClose, onChanged }: { campaignId: string; onClose: () => void; onChanged: () => Promise<void> }) => {
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [extra, setExtra] = useState({ optedOut: 0, noPhone: 0 });
  const [filter, setFilter] = useState<'pending' | 'sent' | 'skipped' | 'all'>('pending');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await post<{ campaign?: CampaignRow; recipients?: Recipient[]; optedOut?: number; noPhone?: number }>({ action: 'recipients', id: campaignId });

    if (result.success) {
      setCampaign(result.campaign ?? null);
      setRecipients(result.recipients ?? []);
      setExtra({ optedOut: result.optedOut ?? 0, noPhone: result.noPhone ?? 0 });
    } else {
      await enqueueSnackbar({ message: result.message ?? 'Could not load.', variant: 'error' });
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const mark = async (personId: string, status: 'sent' | 'skipped' | 'pending') => {
    setRecipients((list) => list.map((r) => (r.id === personId ? { ...r, status } : r)));

    const result = await post<{ status?: string }>({ action: 'mark', id: campaignId, personId, status });

    if (!result.success) {
      await enqueueSnackbar({ message: result.message ?? 'Could not save.', variant: 'error' });
      await load();
    } else if (result.status === 'DONE') {
      await enqueueSnackbar({ message: 'Everyone’s done 🎉', variant: 'success' });
      await onChanged();
    }
  };

  if (loading || !campaign) {
    return (
      <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font }}>
        <SheetHeader title="Send" onClose={onClose} />
        <div style={{ padding: 24, color: c.text3, fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  const textFor = (r: Recipient) => messageFor(campaign.messages, r.language, r.firstName);
  const counts = {
    pending: recipients.filter((r) => r.status === 'pending').length,
    sent: recipients.filter((r) => r.status === 'sent').length,
    skipped: recipients.filter((r) => r.status === 'skipped').length,
  };
  const rows = recipients.filter((r) => filter === 'all' || r.status === filter);
  const next = recipients.find((r) => r.status === 'pending' && r.phone);
  const languagesUsed = LANGUAGES.filter((l) => campaign.messages[l.value]?.trim());
  const progress = recipients.length ? (counts.sent + counts.skipped) / recipients.length : 0;

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <SheetHeader title={campaign.name} sub={`${recipients.length} people · ${counts.sent} sent · ${counts.pending} to go`} onClose={onClose} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ height: 8, background: c.bg2, borderRadius: 4, display: 'block' }}>
          <span style={{ display: 'block', height: 8, width: `${progress * 100}%`, background: 'var(--t-color-green9)', borderRadius: 4 }} />
        </span>

        {/* Next person: one big button */}
        {next ? (
          <div style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'var(--t-color-green7)' }}>
            <span style={{ fontSize: 12, color: c.text3 }}>Next</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>
              {next.name} <span style={{ fontSize: 12, fontWeight: 400, color: c.text3 }}>· {next.reasons.join(', ')} · {LANGUAGES.find((l) => l.value === next.language)?.short}</span>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={waLink(next.phone as string, textFor(next))} target="_blank" rel="noopener noreferrer" onClick={() => mark(next.id, 'sent')} style={{ ...button('whatsapp'), flex: 1, height: 44, fontSize: 14 }}>
                💬 Open WhatsApp & mark sent
              </a>
              <button onClick={() => mark(next.id, 'skipped')} style={{ ...button(), height: 44 }}>
                Skip
              </button>
            </div>
            <span style={{ fontSize: 12, color: c.text3 }}>WhatsApp opens with the message written — press Send there, then come back for the next one.</span>
          </div>
        ) : counts.pending === 0 ? (
          <div style={{ ...card, padding: 14, fontSize: 14, textAlign: 'center' }}>🎉 Everyone has been sent this.</div>
        ) : null}

        {/* Copy for a broadcast list or group */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: c.text3 }}>For a broadcast list or group:</span>
          {languagesUsed.map((l) => (
            <button
              key={l.value}
              onClick={async () => {
                await copyToClipboard(messageFor(campaign.messages, l.value, '').replace(/^(Hi|Salam),?\s*/, (m) => (m.startsWith('Hi') ? 'Hi all, ' : 'Salam semua, ')));
                await enqueueSnackbar({ message: `Copied the ${l.label} message — paste it in WhatsApp.`, variant: 'success' });
              }}
              style={{ ...button(), height: 30 }}
            >
              📋 Copy {l.short}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {(['pending', 'sent', 'skipped', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={chip(filter === f)}>
              {f === 'pending' ? 'To send' : f === 'sent' ? 'Sent' : f === 'skipped' ? 'Skipped' : 'All'}
              <span style={{ opacity: 0.7, marginLeft: 6 }}>{f === 'all' ? recipients.length : counts[f]}</span>
            </button>
          ))}
        </div>

        <div style={{ ...card, overflow: 'hidden' }}>
          {rows.length === 0 && <div style={{ padding: 14, fontSize: 13, color: c.text3 }}>Nobody here.</div>}
          {rows.map((r, index) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: index ? `1px solid ${c.border}` : 'none', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                  {r.status === 'sent' ? '✅ ' : r.status === 'skipped' ? '⏭ ' : ''}
                  {r.name}
                </span>
                <span style={{ fontSize: 12, color: c.text3 }}>
                  {r.reasons.join(', ')} · {LANGUAGES.find((l) => l.value === r.language)?.short}
                  {!r.phone ? ' · no phone number' : ''}
                </span>
              </span>
              {r.status === 'pending' ? (
                <>
                  {r.phone && (
                    <a href={waLink(r.phone, textFor(r))} target="_blank" rel="noopener noreferrer" onClick={() => mark(r.id, 'sent')} style={{ ...button('whatsapp'), height: 32 }}>
                      WhatsApp
                    </a>
                  )}
                  <button onClick={() => mark(r.id, 'skipped')} style={{ ...button(), height: 32 }}>
                    Skip
                  </button>
                </>
              ) : (
                <button onClick={() => mark(r.id, 'pending')} style={{ ...button(), height: 32, color: c.text3 }}>
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>

        {(extra.optedOut > 0 || extra.noPhone > 0) && (
          <div style={{ fontSize: 12, color: c.text3 }}>
            {extra.optedOut > 0 ? `${extra.optedOut} opted out and aren’t listed. ` : ''}
            {extra.noPhone > 0 ? `${extra.noPhone} have no phone number — add one on their record to message them.` : ''}
          </div>
        )}
      </div>
    </div>
  );
};
