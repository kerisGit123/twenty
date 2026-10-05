import { type CSSProperties, type SyntheticEvent, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { todayIso } from 'src/logic-functions/utils/dates';
import { OUTCOMES } from 'src/shared/contacts';

// Log what happened after a WhatsApp message — the app can't read replies on
// its own: one tap for the outcome, or a note with a follow-up date.

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  accent: 'var(--t-color-blue9)',
};

const chip = (active: boolean, color = 'blue'): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 12.5,
  fontWeight: 500,
  height: 30,
  padding: '0 10px',
  borderRadius: 15,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  background: active ? `var(--t-color-${color}3)` : c.bg,
  color: active ? `var(--t-color-${color}11)` : c.text,
  border: `1px solid ${active ? `var(--t-color-${color}7)` : c.border2}`,
});

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: 8,
  boxSizing: 'border-box',
  minWidth: 0,
};

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

export const logContact = (body: Record<string, unknown>) =>
  new RestApiClient().post<{ success: boolean; message?: string }>('/s/contacts', { action: 'log', ...body });

export const ContactLogger = ({
  personId,
  campaignId,
  current,
  compact = false,
  onLogged,
}: {
  personId: string;
  campaignId?: string;
  current?: string; // latest outcome, highlighted
  compact?: boolean;
  onLogged: (kind: string) => void;
}) => {
  const today = todayIso();
  const [open, setOpen] = useState(!compact);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [followUpOn, setFollowUpOn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const log = async (kind: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const result = await logContact({ personId, campaignId, kind, ...extra });

      await enqueueSnackbar({ message: result.message ?? (result.success ? 'Saved.' : 'Could not save.'), variant: result.success ? 'success' : 'error' });
      if (result.success) {
        onLogged(kind);
        setNote('');
        setFollowUpOn(null);
        setNoteOpen(false);
        if (compact) setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...chip(false), height: 28, color: c.text3 }}>
        ＋ Log reply
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {OUTCOMES.map((o) => (
          <button key={o.value} onClick={() => log(o.value)} disabled={busy} style={chip(current === o.value, o.color)} title={o.value === 'STOP' ? 'Also stops all future greetings and newsletters to them' : undefined}>
            {o.icon} {o.label}
          </button>
        ))}
        <button onClick={() => setNoteOpen(!noteOpen)} style={chip(noteOpen, 'purple')}>
          📝 Note / follow-up
        </button>
      </div>
      {noteOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: c.bg2 }}>
          <textarea
            value={note}
            onChange={(e) => setNote(readValue(e))}
            placeholder="What did they say? e.g. Wants to renew for 2 years, asked about the aircon"
            rows={2}
            style={{ ...control, padding: '8px 10px', resize: 'vertical', width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: c.text3 }}>Follow up</span>
            {(
              [
                [null, 'No'],
                [addDays(today, 1), 'Tomorrow'],
                [addDays(today, 3), 'In 3 days'],
                [addDays(today, 7), 'Next week'],
                [addDays(today, 30), 'In a month'],
              ] as Array<[string | null, string]>
            ).map(([value, label]) => (
              <button key={label} onClick={() => setFollowUpOn(value)} style={{ ...chip(followUpOn === value, 'purple'), height: 28 }}>
                {label}
              </button>
            ))}
            <input type="date" value={followUpOn ?? ''} onChange={(e) => setFollowUpOn(readValue(e) || null)} style={{ ...control, height: 28, padding: '0 8px' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setNoteOpen(false)} style={{ ...chip(false), height: 32 }}>
              Cancel
            </button>
            <button
              onClick={() => log(followUpOn ? 'FOLLOW_UP' : 'NOTE', { note, followUpOn })}
              disabled={busy || (!note.trim() && !followUpOn)}
              style={{ ...chip(true), height: 32, background: c.accent, color: '#fff', border: `1px solid ${c.accent}` }}
            >
              {busy ? 'Saving…' : followUpOn ? 'Save follow-up' : 'Save note'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
