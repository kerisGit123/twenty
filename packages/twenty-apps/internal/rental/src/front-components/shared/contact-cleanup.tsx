import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar, openSidePanelPage, SidePanelPages } from 'twenty-sdk/front-component';

import { LANGUAGES, PERSON_TAGS } from 'src/shared/campaigns';
import { type CleanupPerson, QUIET_AFTER } from 'src/shared/contacts';

// Tidy the contact book so campaigns reach more people: who has no number,
// a wrong number, opted out, the wrong language, or never answers.

type Tab = 'noPhone' | 'wrong' | 'quiet' | 'optedOut' | 'language';

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

const button: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  fontWeight: 500,
  height: 30,
  padding: '0 10px',
  borderRadius: 8,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  background: c.bg,
  color: c.text,
  border: `1px solid ${c.border2}`,
};

const chip = (active: boolean): CSSProperties => ({
  ...button,
  height: 32,
  borderRadius: 16,
  padding: '0 12px',
  flexShrink: 0,
  background: active ? 'var(--t-color-blue3)' : c.bg,
  color: active ? 'var(--t-color-blue11)' : c.text,
  border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
});

const TAG = Object.fromEntries(PERSON_TAGS.map((t) => [t.value, t.label.replace(' (tag)', '')]));

const post = <T,>(body: Record<string, unknown>) => new RestApiClient().post<T & { success: boolean; message?: string }>('/s/contacts', body);

export const ContactCleanup = ({ onClose }: { onClose: () => void }) => {
  const [people, setPeople] = useState<CleanupPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('noPhone');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const result = await post<{ people?: CleanupPerson[] }>({ action: 'cleanup' });

    if (result.success) setPeople(result.people ?? []);
    else await enqueueSnackbar({ message: result.message ?? 'Could not load.', variant: 'error' });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Only people campaigns would reach: tenants or tagged.
  const relevant = useMemo(() => people.filter((p) => p.isTenant || p.tags.length > 0), [people]);
  const lists: Record<Tab, CleanupPerson[]> = {
    noPhone: relevant.filter((p) => !p.phone),
    wrong: relevant.filter((p) => p.wrongNumber),
    quiet: relevant.filter((p) => p.phone && !p.optedOut && p.campaignsSent >= QUIET_AFTER && p.answered === 0),
    optedOut: relevant.filter((p) => p.optedOut),
    language: relevant.filter((p) => p.phone && !p.optedOut),
  };
  const term = search.trim().toLowerCase();
  const rows = lists[tab].filter((p) => !term || p.name.toLowerCase().includes(term));

  const setPerson = async (person: CleanupPerson, data: Record<string, unknown>) => {
    setPeople((list) => list.map((p) => (p.id === person.id ? { ...p, ...(data.language ? { language: data.language as string } : {}), ...(typeof data.noCampaigns === 'boolean' ? { optedOut: data.noCampaigns } : {}) } : p)));

    const result = await post<Record<string, never>>({ action: 'setPerson', personId: person.id, ...data });

    if (!result.success) {
      await enqueueSnackbar({ message: result.message ?? 'Could not save.', variant: 'error' });
      await load();
    }
  };

  const open = (id: string) => openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: id, objectNameSingular: 'person' });

  const tabs: Array<[Tab, string, string]> = [
    ['noPhone', 'No phone number', 'Add a number so they can be messaged.'],
    ['wrong', 'Wrong number', 'You logged a wrong number — fix it on their record.'],
    ['quiet', 'Never answer', `Sent ${QUIET_AFTER}+ campaigns and never replied — maybe an old number, or they’d rather not get them.`],
    ['optedOut', 'Opted out', 'They don’t get greetings, newsletters or announcements. Rent reminders still go out.'],
    ['language', 'Languages', 'Each person gets greetings in this language.'],
  ];

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: 16 }}>Contacts</div>
          <div style={{ fontSize: 13, color: c.text3 }}>{loading ? 'Loading…' : `${relevant.length} ${relevant.length === 1 ? 'person' : 'people'} campaigns can reach (tenants and tagged people)`}</div>
        </div>
        <button onClick={onClose} style={{ ...button, width: 32, height: 32, padding: 0, border: 'none', fontSize: 18, background: 'transparent' }} aria-label="Close">
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {tabs.map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} style={chip(tab === value)}>
              {label}
              <span style={{ opacity: 0.7, marginLeft: 6 }}>{lists[value].length}</span>
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: c.text3 }}>{tabs.find((t) => t[0] === tab)?.[2]}</span>
        <input
          value={search}
          onChange={(e) => setSearch(((e as unknown as { detail?: { value?: string }; target?: { value?: string } }).detail?.value ?? (e as unknown as { target?: { value?: string } }).target?.value) ?? '')}
          placeholder="🔍  Find someone"
          style={{ ...button, height: 36, width: '100%', boxSizing: 'border-box', cursor: 'text' }}
        />
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {rows.length === 0 && <div style={{ padding: 16, fontSize: 13, color: c.text3, textAlign: 'center' }}>{loading ? 'Loading…' : 'Nobody here 🎉'}</div>}
          {rows.map((p, index) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: index ? `1px solid ${c.border}` : 'none', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: c.text3 }}>
                  {[p.isTenant ? 'Tenant' : '', ...p.tags.filter((t) => t !== 'TENANT').map((t) => TAG[t] ?? t), p.phone ?? 'no number', tab === 'quiet' ? `${p.campaignsSent} campaigns, no reply` : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
              {tab === 'language' && (
                <div style={{ display: 'flex', background: c.bg2, borderRadius: 8, padding: 2, gap: 2 }}>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => p.language !== l.value && setPerson(p, { language: l.value })}
                      style={{ ...button, height: 28, border: 'none', background: p.language === l.value ? c.bg : 'transparent', boxShadow: p.language === l.value ? `0 0 0 1px ${c.border2}` : 'none', color: p.language === l.value ? c.text : c.text3 }}
                    >
                      {l.short}
                    </button>
                  ))}
                </div>
              )}
              {tab === 'quiet' && (
                <button onClick={() => setPerson(p, { noCampaigns: true })} style={button}>
                  Opt out
                </button>
              )}
              {tab === 'optedOut' && (
                <button onClick={() => setPerson(p, { noCampaigns: false })} style={button}>
                  Turn back on
                </button>
              )}
              <button onClick={() => open(p.id)} style={button}>
                {tab === 'noPhone' || tab === 'wrong' ? 'Fix number' : 'Open'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
