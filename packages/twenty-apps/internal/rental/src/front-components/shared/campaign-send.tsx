import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { copyToClipboard, enqueueSnackbar } from 'twenty-sdk/front-component';

import { ContactLogger } from 'src/front-components/shared/contact-log';
import { type CampaignRow, isVideo, LANGUAGES, messageFor, type Recipient, sourceOf } from 'src/shared/campaigns';
import { activityKind, type CampaignResults } from 'src/shared/contacts';

// Sending a campaign, built for a phone first: progress in the header, then
// three tabs — Send (the next person in one big tap, then the queue), Replies
// (log how people answered) and Group / list (share once to a broadcast list
// or a group).

type Tab = 'send' | 'replies' | 'group';

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  green: '#25D366',
};

const btn = (tone: 'plain' | 'whatsapp' | 'ghost' = 'plain'): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 14,
  fontWeight: 600,
  height: 44,
  padding: '0 14px',
  borderRadius: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  boxSizing: 'border-box',
  minWidth: 0,
  ...(tone === 'whatsapp'
    ? { background: c.green, color: '#fff', border: `1px solid ${c.green}` }
    : tone === 'ghost'
      ? { background: 'transparent', color: c.text3, border: 'none' }
      : { background: c.bg, color: c.text, border: `1px solid ${c.border2}` }),
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

const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const SendPanel = ({ campaignId, onClose, onChanged }: { campaignId: string; onClose: () => void; onChanged: () => Promise<void> }) => {
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [extra, setExtra] = useState({ optedOut: 0, noPhone: 0 });
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('send');
  const [logging, setLogging] = useState('');
  const [showHow, setShowHow] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [focus, setFocus] = useState(false);
  // Marks go to the server one at a time, in tap order.
  const marking = useRef<Promise<void>>(Promise.resolve());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await new RestApiClient().post<{ success: boolean; message?: string; campaign?: CampaignRow; recipients?: Recipient[]; optedOut?: number; noPhone?: number }>(
      '/s/campaigns',
      { action: 'recipients', id: campaignId },
    );

    if (result.success) {
      setCampaign(result.campaign ?? null);
      setRecipients(result.recipients ?? []);
      setExtra({ optedOut: result.optedOut ?? 0, noPhone: result.noPhone ?? 0 });

      const res = await new RestApiClient().post<{ success: boolean; results?: CampaignResults }>('/s/contacts', { action: 'campaignResults', campaignId });

      if (res.success) setOutcomes(res.results?.byPerson ?? {});
    } else {
      await enqueueSnackbar({ message: result.message ?? 'Could not load.', variant: 'error' });
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const mark = (key: string, status: 'sent' | 'skipped' | 'pending') => {
    setRecipients((list) => list.map((r) => (r.id === key ? { ...r, status } : r)));

    marking.current = marking.current.then(async () => {
      try {
        const result = await new RestApiClient().post<{ success: boolean; message?: string; status?: string }>('/s/campaigns', { action: 'mark', id: campaignId, key, status });

        if (!result.success) {
          await enqueueSnackbar({ message: result.message ?? 'Could not save.', variant: 'error' });
          await load();
        } else if (result.status === 'DONE') {
          await enqueueSnackbar({ message: 'Everyone’s done 🎉', variant: 'success' });
          await onChanged();
        }
      } catch {
        await enqueueSnackbar({ message: 'Could not save — check your connection.', variant: 'error' });
        await load();
      }
    });
  };

  const header = (sub?: string) => (
    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign?.name ?? 'Send'}</div>
          {sub && <div style={{ fontSize: 12.5, color: c.text3, marginTop: 2 }}>{sub}</div>}
        </div>
        <button onClick={onClose} style={{ ...btn('ghost'), width: 40, height: 36, padding: 0, fontSize: 20 }} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  );

  if (loading || !campaign) {
    return (
      <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font }}>
        {header()}
        <div style={{ padding: 24, color: c.text3, fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  const textFor = (r: Recipient) => messageFor(campaign.messages, r.language, r.firstName, r.values);
  // {fields} that had nothing to fill in for this person.
  const unfilled = (r: Recipient) => [...new Set([...textFor(r).matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];
  const smart = campaign.source !== 'NONE';
  const source = sourceOf(campaign.source);
  const hasMedia = campaign.media.length > 0 || Boolean(source.attachment);
  const mediaWord = source.attachment ? 'PDF' : campaign.media.some((m) => isVideo(m.extension)) ? 'video' : 'photo';
  const shareUrl = (key?: string, language?: string) =>
    new RestApiClient().resolveUrl('/s/campaigns/share', { query: { id: campaign.id, ...(key ? { key } : {}), ...(language ? { lang: language } : {}) } });
  const pending = recipients.filter((r) => r.status === 'pending');
  const sent = recipients.filter((r) => r.status === 'sent');
  const skipped = recipients.filter((r) => r.status === 'skipped');
  const next = pending.find((r) => r.phone);
  const queue = pending.filter((r) => r !== next);
  // Replies are per person, even when someone got two receipts.
  const sentPeople = sent.filter((r, index) => sent.findIndex((x) => x.personId === r.personId) === index);
  const replied = sentPeople.filter((r) => outcomes[r.personId]).length;
  const languagesUsed = LANGUAGES.filter((l) => campaign.messages[l.value]?.trim());
  const progress = recipients.length ? (sent.length + skipped.length) / recipients.length : 0;
  const language = (r: Recipient) => LANGUAGES.find((l) => l.value === r.language)?.short;

  const sendLink = (r: Recipient) => (hasMedia ? shareUrl(r.id) : waLink(r.phone as string, textFor(r)));

  const position = recipients.length - pending.length + 1;

  // Send mode: one person at a time, full screen, with the exact message.
  if (focus && next) {
    return (
      <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${c.border}` }}>
          <span style={{ flex: 1, fontSize: 13, color: c.text3 }}>
            {position} of {recipients.length} · {campaign.name}
          </span>
          <button onClick={() => setFocus(false)} style={{ ...btn(), height: 36, fontSize: 13 }}>
            Exit send mode
          </button>
        </div>
        <span style={{ height: 4, background: c.bg2, display: 'block', flexShrink: 0 }}>
          <span style={{ display: 'block', height: 4, width: `${progress * 100}%`, background: 'var(--t-color-green9)' }} />
        </span>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center' }}>
            <span style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--t-color-green3)', color: 'var(--t-color-green11)', fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {(next.name || '?').charAt(0).toUpperCase()}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{next.name}</span>
            <span style={{ fontSize: 13, color: c.text2 }}>
              {next.phone} · {language(next)}
            </span>
            <span style={{ fontSize: 12.5, color: c.text3 }}>{next.reasons.join(' · ')}</span>
          </div>
          <div style={{ background: '#efeae2', borderRadius: 14, padding: 12 }}>
            <div style={{ background: '#d9fdd3', color: '#111b21', borderRadius: '10px 10px 2px 10px', padding: '8px 10px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginLeft: 'auto', maxWidth: '94%' }}>
              {hasMedia && <div style={{ fontSize: 12, color: '#4a6b44', paddingBottom: 4 }}>📎 with {mediaWord}</div>}
              {textFor(next)}
            </div>
          </div>
          {unfilled(next).length > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--t-color-amber11)', textAlign: 'center' }}>
              ⚠ {unfilled(next).map((k) => `{${k}}`).join(', ')} has no value — fix the message (or Receipt settings) before sending.
            </span>
          )}
          <a href={sendLink(next)} target="_blank" rel="noopener noreferrer" onClick={() => mark(next.id, 'sent')} style={{ ...btn('whatsapp'), width: '100%', height: 56, fontSize: 16 }}>
            {hasMedia ? `📤 Send with ${mediaWord}` : '💬 Open WhatsApp'}
          </a>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              onClick={async () => {
                await copyToClipboard(textFor(next));
                await enqueueSnackbar({ message: 'Message copied.', variant: 'success' });
              }}
              style={{ ...btn(), width: '100%' }}
            >
              📋 Copy text
            </button>
            <button onClick={() => mark(next.id, 'skipped')} style={{ ...btn(), width: '100%' }}>
              Skip ⏭
            </button>
          </div>
          <span style={{ fontSize: 12, color: c.text3, textAlign: 'center' }}>Tap send, press Send in WhatsApp, come back — the next person is ready.</span>
        </div>
      </div>
    );
  }

  const personLine = (r: Recipient) => (
    <span style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
      <span style={{ fontSize: 12, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {language(r)} · {r.phone ? r.reasons.join(', ') : 'no phone number'}
      </span>
    </span>
  );

  const tabButton = (value: Tab, label: string, count?: string) => (
    <button
      key={value}
      onClick={() => setTab(value)}
      style={{
        flex: 1,
        minWidth: 0,
        fontFamily: c.font,
        fontSize: 13.5,
        fontWeight: 600,
        height: 40,
        border: 'none',
        borderBottom: `2px solid ${tab === value ? 'var(--t-color-blue9)' : 'transparent'}`,
        background: 'transparent',
        color: tab === value ? 'var(--t-color-blue11)' : c.text3,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {count ? <span style={{ fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>{count}</span> : null}
    </button>
  );

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      {header(
        `${smart ? plural(recipients.length, 'message', 'messages') : plural(recipients.length, 'person', 'people')} · ${sent.length} sent · ${pending.length} to go${sent.length ? ` · ${plural(replied, 'reply', 'replies')}` : ''}`,
      )}
      <span style={{ height: 4, background: c.bg2, display: 'block', flexShrink: 0 }}>
        <span style={{ display: 'block', height: 4, width: `${progress * 100}%`, background: 'var(--t-color-green9)' }} />
      </span>
      <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        {tabButton('send', 'Send', pending.length ? String(pending.length) : '✓')}
        {tabButton('replies', 'Replies', sentPeople.length ? `${replied}/${sentPeople.length}` : undefined)}
        {!smart && tabButton('group', 'Group / list')}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ---------------- Send */}
        {tab === 'send' && (
          <>
            {next ? (
              <div style={{ border: '1px solid var(--t-color-green7)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--t-color-green2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--t-color-green11)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Next</span>
                  {pending.length > 1 && (
                    <button onClick={() => setFocus(true)} style={{ ...btn(), height: 30, fontSize: 12.5, fontWeight: 500 }} title="One person at a time, full screen">
                      ▶ Send mode
                    </button>
                  )}
                </div>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{next.name}</span>
                  <span style={{ fontSize: 12.5, color: c.text2 }}>
                    {language(next)} · {next.reasons.join(', ')}
                  </span>
                </span>
                {smart && (
                  <span style={{ fontSize: 12.5, color: c.text2, background: c.bg, borderRadius: 10, padding: '8px 10px', whiteSpace: 'pre-wrap', lineHeight: 1.45, maxHeight: 96, overflow: 'auto' }}>{textFor(next)}</span>
                )}
                {unfilled(next).length > 0 && (
                  <span style={{ fontSize: 12.5, color: 'var(--t-color-amber11)', lineHeight: 1.45 }}>
                    ⚠ {unfilled(next).map((k) => `{${k}}`).join(', ')} {unfilled(next).length === 1 ? 'has' : 'have'} no value
                    {unfilled(next).includes('pay_to') ? ' — add “How tenants pay you” in Receipt settings, or edit the message' : ' — edit the message'} before sending.
                  </span>
                )}
                <a href={sendLink(next)} target="_blank" rel="noopener noreferrer" onClick={() => mark(next.id, 'sent')} style={{ ...btn('whatsapp'), width: '100%', height: 52, fontSize: 15.5 }}>
                  {hasMedia ? `📤 Send with ${mediaWord}` : '💬 Open WhatsApp'}
                </a>
                <div style={{ display: 'grid', gridTemplateColumns: hasMedia ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {hasMedia && (
                    <a href={waLink(next.phone as string, textFor(next))} target="_blank" rel="noopener noreferrer" onClick={() => mark(next.id, 'sent')} style={{ ...btn(), width: '100%' }}>
                      Text only
                    </a>
                  )}
                  <button onClick={() => mark(next.id, 'skipped')} style={{ ...btn(), width: '100%' }}>
                    Skip
                  </button>
                </div>
                <button onClick={() => setShowHow(!showHow)} style={{ ...btn('ghost'), height: 24, fontSize: 12.5, fontWeight: 500, alignSelf: 'flex-start', padding: 0 }}>
                  {showHow ? '▾' : '▸'} How sending works
                </button>
                {showHow && (
                  <span style={{ fontSize: 12.5, color: c.text2, lineHeight: 1.5 }}>
                    {source.attachment
                      ? `A page opens with the PDF and the message. On your phone tap Share → WhatsApp → ${next.firstName || 'the person'}. On a computer download the PDF, open the chat and attach it.`
                      : hasMedia
                      ? `A page opens with the ${mediaWord} and the message. On your phone tap Share → WhatsApp → ${next.firstName || 'the person'}. On a computer copy the photo, open the chat and paste.`
                      : 'WhatsApp opens with the message written — press Send there, then come back here for the next person.'}{' '}
                    It’s marked as sent when you tap.
                  </span>
                )}
              </div>
            ) : pending.length === 0 ? (
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 14, padding: 18, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>🎉 Everyone has been sent this</span>
                {sent.length > 0 && (
                  <button onClick={() => setTab('replies')} style={{ ...btn(), alignSelf: 'center' }}>
                    Log replies
                  </button>
                )}
              </div>
            ) : null}

            {queue.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Then · {queue.length}</span>
                <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  {queue.map((r, index) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: index ? `1px solid ${c.border}` : 'none' }}>
                      {personLine(r)}
                      {r.phone && (
                        <a href={sendLink(r)} target="_blank" rel="noopener noreferrer" onClick={() => mark(r.id, 'sent')} style={{ ...btn('whatsapp'), width: 44, padding: 0 }} aria-label={`Send to ${r.name}`}>
                          {hasMedia ? '📤' : '💬'}
                        </a>
                      )}
                      <button onClick={() => mark(r.id, 'skipped')} style={{ ...btn(), width: 44, padding: 0, color: c.text3 }} aria-label={`Skip ${r.name}`} title="Skip">
                        ⏭
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(sent.length > 0 || skipped.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => setShowDone(!showDone)} style={{ ...btn('ghost'), height: 30, fontSize: 13, justifyContent: 'flex-start', padding: 0 }}>
                  {showDone ? '▾' : '▸'} Sent {sent.length}
                  {skipped.length ? ` · skipped ${skipped.length}` : ''}
                </button>
                {showDone && (
                  <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    {[...sent, ...skipped].map((r, index) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: index ? `1px solid ${c.border}` : 'none' }}>
                        <span style={{ width: 20, textAlign: 'center' }}>{r.status === 'sent' ? '✅' : '⏭'}</span>
                        {personLine(r)}
                        <button onClick={() => mark(r.id, 'pending')} style={{ ...btn(), height: 36, fontSize: 13, color: c.text3 }}>
                          Undo
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(extra.optedOut > 0 || extra.noPhone > 0) && (
              <span style={{ fontSize: 12, color: c.text3, lineHeight: 1.5 }}>
                {extra.optedOut > 0 ? `${plural(extra.optedOut, 'person', 'people')} opted out and aren’t listed. ` : ''}
                {extra.noPhone > 0 ? `${plural(extra.noPhone, 'person has', 'people have')} no phone number — add one on their record.` : ''}
              </span>
            )}
          </>
        )}

        {/* ---------------- Replies */}
        {tab === 'replies' && (
          <>
            <span style={{ fontSize: 12.5, color: c.text3, lineHeight: 1.5 }}>
              Replies arrive in your WhatsApp — note them here in one tap. It builds each person’s history; follow-ups show on Today.
            </span>
            {sent.length === 0 && <div style={{ fontSize: 13, color: c.text3, padding: 12, textAlign: 'center' }}>Send to someone first.</div>}
            {[...sentPeople.filter((r) => !outcomes[r.personId]), ...sentPeople.filter((r) => outcomes[r.personId])].map((r) => {
              const outcome = outcomes[r.personId] ? activityKind(outcomes[r.personId]) : null;
              const open = logging === r.id || !outcome;

              return (
                <div key={r.id} style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {personLine(r)}
                    {outcome && (
                      <span style={pill(outcome.color)}>
                        {outcome.icon} {outcome.label}
                      </span>
                    )}
                    {outcome && !open && (
                      <button onClick={() => setLogging(r.id)} style={{ ...btn(), height: 34, fontSize: 13 }}>
                        Change
                      </button>
                    )}
                  </div>
                  {open && (
                    // Outcome chips scroll sideways on a narrow screen.
                    <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                      <ContactLogger
                        personId={r.personId}
                        campaignId={campaign.id}
                        current={outcomes[r.personId]}
                        onLogged={(kind) => {
                          setLogging('');
                          if (activityKind(kind).outcome) setOutcomes((o) => ({ ...o, [r.personId]: kind }));
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ---------------- Group / list */}
        {tab === 'group' && (
          <>
            <span style={{ fontSize: 12.5, color: c.text3, lineHeight: 1.5 }}>
              Send once to a WhatsApp <b>broadcast list</b> (each person gets it privately, if they saved your number) or a <b>group</b>. The greeting starts “Hi all”.
            </span>
            {languagesUsed.map((l) => (
              <div key={l.value} style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{l.label}</span>
                <span style={{ fontSize: 12.5, color: c.text2, whiteSpace: 'pre-wrap', maxHeight: 64, overflow: 'hidden' }}>
                  {messageFor(campaign.messages, l.value, '').replace(/^(Hi|Salam),?\s*/, (m) => (m.startsWith('Hi') ? 'Hi all, ' : 'Salam semua, '))}
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: hasMedia ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {hasMedia && (
                    <a href={shareUrl(undefined, l.value)} target="_blank" rel="noopener noreferrer" style={{ ...btn('whatsapp'), width: '100%' }}>
                      📤 Share with {mediaWord}
                    </a>
                  )}
                  <button
                    onClick={async () => {
                      await copyToClipboard(messageFor(campaign.messages, l.value, '').replace(/^(Hi|Salam),?\s*/, (m) => (m.startsWith('Hi') ? 'Hi all, ' : 'Salam semua, ')));
                      await enqueueSnackbar({ message: `Copied — paste it in WhatsApp.`, variant: 'success' });
                    }}
                    style={{ ...btn(), width: '100%' }}
                  >
                    📋 Copy text
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
