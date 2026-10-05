import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import type { PendingReminder } from 'src/logic-functions/utils/notifications';

// Today's rent reminders, ready to send from your own WhatsApp: tap WhatsApp,
// it opens with the message typed in, press Send. Tapping it (or Skip) marks
// it done so it isn't suggested again. Rules: Setup → Notifications.

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  radius: 'var(--t-border-radius-md)',
};

const KIND: Record<string, { label: string; color: string }> = {
  RENT_UPCOMING: { label: 'Coming up', color: 'sky' },
  RENT_DUE: { label: 'Due today', color: 'orange' },
  RENT_OVERDUE: { label: 'Overdue', color: 'red' },
};

const small: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  fontWeight: 500,
  height: 32,
  padding: '0 12px',
  borderRadius: c.radius,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
};

type PendingResponse = { success: boolean; enabled?: boolean; reminders?: PendingReminder[]; message?: string };

export const ReminderList = ({
  hideWhenEmpty = false,
  onSetup,
  title,
}: {
  hideWhenEmpty?: boolean;
  onSetup?: () => void;
  // When set, the list comes in its own card with this heading.
  title?: string;
}) => {
  const [data, setData] = useState<PendingResponse | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await new RestApiClient().post<PendingResponse>('/s/notifications', { action: 'pending' }));
    } catch {
      // Not an admin (or not available): show nothing.
      setData({ success: false });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mark = async (reminder: PendingReminder, action: 'markSent' | 'skip') => {
    // Take it off the list straight away; the server records it.
    setData((current) => (current ? { ...current, reminders: (current.reminders ?? []).filter((r) => r.dedupKey !== reminder.dedupKey) } : current));
    try {
      const { link: _link, ...rest } = reminder;
      const result = await new RestApiClient().post<{ success: boolean; message?: string }>('/s/notifications', { action, reminder: rest });

      if (!result.success) throw new Error(result.message ?? 'Could not save.');
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
      await load();
    }
  };

  if (!data || !data.success) return null;

  const reminders = data.reminders ?? [];

  if (!data.enabled) {
    if (hideWhenEmpty) return null;

    return (
      <div style={{ fontSize: 13, color: c.text3 }}>
        Rent reminders are off.{' '}
        {onSetup ? (
          <button onClick={onSetup} style={{ all: 'unset', cursor: 'pointer', color: 'var(--t-color-blue11)', fontWeight: 500 }}>
            Turn them on
          </button>
        ) : null}
      </div>
    );
  }
  if (reminders.length === 0) {
    if (hideWhenEmpty) return null;

    return <div style={{ fontSize: 13, color: c.text3 }}>✅ No reminders to send today.</div>;
  }

  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: c.font, padding: title ? '0 14px 4px' : 0 }}>
      {reminders.map((reminder, index) => {
        const kind = KIND[reminder.kind] ?? KIND.RENT_DUE;
        const open = preview === reminder.dedupKey;

        return (
          <div
            key={reminder.dedupKey}
            style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderTop: index ? `1px solid ${c.border}` : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '1px 7px',
                      borderRadius: 10,
                      background: `var(--t-color-${kind.color}3)`,
                      color: `var(--t-color-${kind.color}11)`,
                    }}
                  >
                    {kind.label}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: c.text }}>{reminder.title}</span>
                </div>
                <button onClick={() => setPreview(open ? null : reminder.dedupKey)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: c.text3, marginTop: 2 }}>
                  {open ? 'Hide message' : 'See message'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {reminder.link ? (
                  <a
                    href={reminder.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => mark(reminder, 'markSent')}
                    style={{ ...small, background: '#25D366', color: '#fff', border: '1px solid #25D366' }}
                  >
                    WhatsApp
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--t-color-amber11)', alignSelf: 'center' }}>No WhatsApp number</span>
                )}
                <button onClick={() => mark(reminder, 'skip')} style={{ ...small, background: c.bg, color: c.text2, border: `1px solid ${c.border2}` }}>
                  Skip
                </button>
              </div>
            </div>
            {open ? (
              <div style={{ background: '#e7ffdb', color: '#111b21', borderRadius: '10px 10px 10px 2px', padding: '8px 10px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                {reminder.body}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  if (!title) return list;

  return (
    <div style={{ border: '1px solid #25D36655', borderRadius: c.radius, background: c.bg, overflow: 'hidden', fontFamily: c.font }}>
      <div style={{ padding: '10px 14px', background: '#25D3661a', fontSize: 13, fontWeight: 600, display: 'flex', gap: 8, color: c.text }}>
        {title}
        <span style={{ color: c.text3, fontWeight: 400 }}>{reminders.length}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 400, color: c.text3 }}>Tap WhatsApp, then press Send</span>
      </div>
      {list}
    </div>
  );
};
