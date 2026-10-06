import { type CSSProperties, type ReactNode, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { AppPath, copyToClipboard, enqueueSnackbar, navigate } from 'twenty-sdk/front-component';

import { CampaignEditor } from 'src/front-components/shared/campaign-editor';
import { ContactCleanup } from 'src/front-components/shared/contact-cleanup';
import { SendPanel } from 'src/front-components/shared/campaign-send';
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
  isVideo,
  upcomingOccasions,
} from 'src/shared/campaigns';
import { activityKind, type CampaignResults, OUTCOMES } from 'src/shared/contacts';

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
  const [results, setResults] = useState<Record<string, CampaignResults>>({});
  const [cleanup, setCleanup] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const result = await post<ListResult>({ action: 'list' });

      if (!result.success) throw new Error(result.message ?? 'Could not load campaigns.');
      setCampaigns(result.campaigns ?? []);
      setOwners(result.owners ?? []);
      setCanUseTags(Boolean(result.canUseTags));
      new RestApiClient()
        .post<{ success: boolean; results?: Record<string, CampaignResults> }>('/s/contacts', { action: 'allResults' })
        .then((res) => res.success && setResults(res.results ?? {}))
        .catch(() => undefined);
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: c.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            {x.kind === 'GREETING' ? occasion.icon : kind.icon}
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, color: c.text3 }}>
              <span style={{ ...pill(isReady ? 'green' : status.color), fontSize: 11.5, padding: '2px 8px' }}>{isReady ? 'Ready' : status.label}</span>
              <span>
                {kind.label} · {x.status === 'DONE' ? 'sent' : ''} {day(x.sendOn)}
                {x.status === 'SCHEDULED' && due > 0 ? ` · in ${due}d` : ''}
              </span>
            </div>
          </div>
        </div>
        {(sent > 0 || skipped > 0) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: c.text2, alignItems: 'center' }}>
            <span>✅ {sent} sent{skipped ? ` · ${skipped} skipped` : ''}</span>
            {results[x.id] && sent > 0 && (
              <>
                <span style={{ fontWeight: 600, color: results[x.id].replyRate >= 0.3 ? 'var(--t-color-green11)' : c.text2 }}>
                  {Math.round(results[x.id].replyRate * 100)}% replied
                </span>
                {OUTCOMES.filter((o) => results[x.id].outcomes[o.value]).map((o) => (
                  <span key={o.value} title={o.label}>
                    {o.icon} {results[x.id].outcomes[o.value]}
                  </span>
                ))}
              </>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
              {x.status !== 'DRAFT' && (
                <button onClick={() => setSending(x)} style={{ ...button(isReady ? 'whatsapp' : 'plain'), flex: '1 1 140px', height: 40 }}>
                  {x.status === 'DONE' ? 'Results & replies' : isReady ? '💬 Send now' : 'Send early'}
                </button>
              )}
              <button onClick={() => setEditing(x)} style={{ ...button(), height: 40, flex: x.status === 'DRAFT' ? '1 1 140px' : '0 0 auto' }}>
                {x.status === 'DRAFT' ? 'Finish & schedule' : 'Edit'}
              </button>
              <button onClick={() => setConfirmDelete(x.id)} style={{ ...button('danger'), height: 40, width: 40, padding: 0 }} title="Delete" aria-label="Delete">
                🗑
              </button>
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
        <Sheet width={1000} onClose={() => setEditing(null)}>
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
      {cleanup && (
        <Sheet width={720} onClose={() => setCleanup(false)}>
          <ContactCleanup onClose={() => setCleanup(false)} />
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(8px, 2vw, 16px)', maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 650 }}>Campaigns</div>
            <div style={{ fontSize: 13, color: c.text3 }}>Greetings, newsletters and announcements on WhatsApp.</div>
          </div>
          <button onClick={() => setCleanup(true)} style={button()} title="People without a number, opted out, wrong numbers, languages">
            🧹 Contacts
          </button>
          <OwnerSwitcher scope={scope} />
        </div>

        {/* What to do now comes first */}
        {!loading && section('Ready to send', ready)}

        {/* Start one: three compact tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {CAMPAIGN_KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => newCampaign(k.value)}
              title={k.value === 'GREETING' ? 'Raya, CNY, Deepavali, Christmas…' : k.value === 'NEWSLETTER' ? 'Industry news, tips, updates' : 'Maintenance, new rules, changes'}
              style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', ...card, padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', minWidth: 0 }}
            >
              <span style={{ fontSize: 22 }}>{k.icon}</span>
              <span style={{ fontSize: 'clamp(10.5px, 3cqw, 14px)', fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</span>
              <span style={{ fontSize: 11, color: 'var(--t-color-blue11)', fontWeight: 600 }}>＋ New</span>
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
                    style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', ...card, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 170 }}
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
            {section('Scheduled', scheduled)}
            {section('Drafts', drafts)}
            {section('Sent', done)}
          </>
        )}

        <button onClick={() => setHowOpen(!howOpen)} style={{ ...button(), alignSelf: 'flex-start', border: 'none', background: 'transparent', fontSize: 12.5, color: c.text3, padding: 0 }}>
          {howOpen ? '▾' : '▸'} How sending works
        </button>
        {howOpen && (
          <div style={{ fontSize: 12.5, color: c.text3, lineHeight: 1.5 }}>
            Messages go out from your own WhatsApp: each tap opens the chat with the message written — press Send there. For everyone at once, use Group / list in the send panel
            and share to a WhatsApp broadcast list (people who saved your number get it privately) or a group. People can opt out on their WhatsApp tab.
          </div>
        )}
        <button onClick={() => navigate(AppPath.RecordIndexPage, { objectNamePlural: 'campaigns' })} style={{ ...button(), alignSelf: 'flex-start', border: 'none', background: 'transparent', fontSize: 12, color: c.text3 }}>
          Open as a table →
        </button>
      </div>
    </div>
  );
};
