import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar, useRecordId } from 'twenty-sdk/front-component';

import { ContactLogger } from 'src/front-components/shared/contact-log';
import { todayIso } from 'src/logic-functions/utils/dates';
import { LANGUAGES } from 'src/shared/campaigns';
import { activityKind, type HistoryEntry, QUIET_AFTER } from 'src/shared/contacts';

// A person's WhatsApp page: language and opt-out, a message button, open
// follow-ups, and everything the app has sent them (greetings, newsletters,
// rent reminders, receipts) with the replies and notes you logged.

type Person = { id: string; name: string; firstName: string; phone: string | null; language: string; noCampaigns: boolean; tags: string[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Dates as written; timestamps shown as the Malaysian date.
const when = (iso: string) => {
  if (!iso) return '';

  const date = iso.includes('T') ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(iso)) : iso;

  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
};

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
};

const button = (tone: 'plain' | 'whatsapp' = 'plain'): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 13,
  fontWeight: 500,
  height: 34,
  padding: '0 12px',
  borderRadius: 8,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  boxSizing: 'border-box',
  ...(tone === 'whatsapp' ? { background: '#25D366', color: '#fff', border: '1px solid #25D366' } : { background: c.bg, color: c.text, border: `1px solid ${c.border2}` }),
});

const post = <T,>(body: Record<string, unknown>) => new RestApiClient().post<T & { success: boolean; message?: string }>('/s/contacts', body);

export const PersonWhatsapp = () => {
  const personId = useRecordId();
  const today = todayIso();
  const [person, setPerson] = useState<Person | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState('');
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!personId) return;

    const result = await post<{ person?: Person; entries?: HistoryEntry[] }>({ action: 'history', personId });

    if (!result.success) {
      setError(result.message ?? 'Could not load.');

      return;
    }
    setPerson(result.person ?? null);
    setEntries(result.entries ?? []);
  }, [personId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = async (data: Record<string, unknown>, message: string) => {
    const result = await post<Record<string, never>>({ action: 'setPerson', personId, ...data });

    await enqueueSnackbar({ message: result.success ? message : result.message ?? 'Could not save.', variant: result.success ? 'success' : 'error' });
    if (result.success) await load();
  };

  const done = async (activityId: string) => {
    const result = await post<Record<string, never>>({ action: 'done', activityId });

    await enqueueSnackbar({ message: result.message ?? 'Done.', variant: result.success ? 'success' : 'error' });
    if (result.success) await load();
  };

  if (error) return <div style={{ padding: 16, fontFamily: c.font, fontSize: 13, color: c.text3 }}>{error}</div>;
  if (!person) return <div style={{ padding: 16, fontFamily: c.font, fontSize: 13, color: c.text3 }}>Loading…</div>;

  const followUps = entries.filter((e) => e.followUpOn && !e.done).sort((a, b) => (a.followUpOn ?? '').localeCompare(b.followUpOn ?? ''));
  const sentCount = entries.filter((e) => e.kind !== 'activity').length;
  const replies = entries.filter((e) => e.kind === 'activity' && e.outcome && e.outcome !== 'WRONG_NUMBER').length;
  // How they respond to campaigns: answered = a reply logged against it.
  const campaigns = entries.filter((e) => e.kind === 'campaign');
  const answered = campaigns.filter((e) => e.outcome && e.outcome !== 'WRONG_NUMBER').length;
  const lastReply = entries.filter((e) => e.kind === 'activity' && e.outcome && e.outcome !== 'WRONG_NUMBER').map((e) => e.at).sort().pop() ?? null;
  const quiet = campaigns.length >= QUIET_AFTER && answered === 0 && !person.noCampaigns;

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Contact */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 650 }}>WhatsApp</div>
          <div style={{ fontSize: 13, color: c.text3 }}>
            {person.phone ?? 'No phone number'} · {sentCount} message{sentCount === 1 ? '' : 's'} sent · {replies} repl{replies === 1 ? 'y' : 'ies'} logged
          </div>
        </div>
        {person.phone && (
          <a href={`https://wa.me/${person.phone.replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer" style={button('whatsapp')}>
            💬 Message
          </a>
        )}
        <button onClick={() => setLogOpen(!logOpen)} style={button()}>
          ＋ Log reply / note
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: c.text3 }}>Greetings & newsletters in</span>
        <div style={{ display: 'flex', background: c.bg2, borderRadius: 8, padding: 2, gap: 2 }}>
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              onClick={() => person.language !== l.value && setField({ language: l.value }, `${person.firstName || person.name} now gets ${l.label}.`)}
              style={{ ...button(), height: 28, border: 'none', background: person.language === l.value ? c.bg : 'transparent', boxShadow: person.language === l.value ? `0 0 0 1px ${c.border2}` : 'none', color: person.language === l.value ? c.text : c.text3 }}
            >
              {l.short}
            </button>
          ))}
        </div>
        <button
          onClick={() => setField({ noCampaigns: !person.noCampaigns }, person.noCampaigns ? 'Greetings and newsletters back on.' : 'No more greetings or newsletters.')}
          style={{ ...button(), height: 30, color: person.noCampaigns ? 'var(--t-color-red11)' : c.text2 }}
        >
          {person.noCampaigns ? '🛑 Opted out — turn back on' : 'Opt out of campaigns'}
        </button>
      </div>

      {campaigns.length > 0 && (
        <div style={{ borderRadius: 12, background: c.bg2, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13.5 }}>
            <b>Campaigns:</b> {campaigns.length} sent · {answered} answered
            {campaigns.length ? ` (${Math.round((answered / campaigns.length) * 100)}%)` : ''}
            {lastReply ? ` · last reply ${new Date(lastReply).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}` : ''}
          </span>
          {quiet && (
            <span style={{ fontSize: 12.5, color: 'var(--t-color-amber11)' }}>
              No answer to {campaigns.length} campaigns — check the number is still theirs, or opt them out.
            </span>
          )}
        </div>
      )}

      {logOpen && (
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 12 }}>
          <ContactLogger
            personId={person.id}
            onLogged={async () => {
              setLogOpen(false);
              await load();
            }}
          />
        </div>
      )}

      {/* Follow-ups */}
      {followUps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Follow-ups</span>
          {followUps.map((f) => {
            const late = (f.followUpOn ?? '') < today;

            return (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${late ? 'var(--t-color-red6)' : 'var(--t-color-purple6)'}`, background: late ? 'var(--t-color-red2)' : 'var(--t-color-purple2)', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>⏰ {when(f.followUpOn ?? '')}{late ? ' (late)' : (f.followUpOn ?? '') === today ? ' (today)' : ''}</span>
                  <span style={{ fontSize: 13, color: c.text2 }}> — {f.detail || f.title}</span>
                </span>
                {person.phone && (
                  <a href={`https://wa.me/${person.phone.replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer" style={{ ...button('whatsapp'), height: 30 }}>
                    💬
                  </a>
                )}
                <button onClick={() => f.activityId && done(f.activityId)} style={{ ...button(), height: 30 }}>
                  ✓ Done
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>History</span>
        {entries.length === 0 && <span style={{ fontSize: 13, color: c.text3 }}>Nothing sent from the app yet.</span>}
        {entries.map((e, index) => {
          const outcome = e.outcome ? activityKind(e.outcome) : null;

          return (
            <div key={e.key} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: index ? `1px solid ${c.border}` : 'none' }}>
              <span style={{ width: 32, height: 32, borderRadius: 16, background: e.kind === 'activity' ? c.bg2 : 'var(--t-color-green3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15 }}>
                {e.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</span>
                  {outcome && e.kind !== 'activity' && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 10, background: `var(--t-color-${outcome.color}3)`, color: `var(--t-color-${outcome.color}11)` }}>
                      {outcome.icon} {outcome.label}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: c.text3, marginLeft: 'auto' }}>{when(e.at)}</span>
                </span>
                {e.detail && <span style={{ fontSize: 12.5, color: c.text2, whiteSpace: 'pre-wrap' }}>{e.detail}</span>}
                {e.followUpOn && <span style={{ fontSize: 12, color: e.done ? c.text3 : 'var(--t-color-purple11)' }}>⏰ Follow up {when(e.followUpOn)}{e.done ? ' — done' : ''}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
