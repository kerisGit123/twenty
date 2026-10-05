import { type CSSProperties, type ReactNode, type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { NOTIFICATIONS_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { ReminderList } from 'src/front-components/shared/reminder-list';
import type { NotificationSettings } from 'src/logic-functions/utils/notifications';

// Notifications: your WhatsApp assistant. A morning summary for you, rent
// reminders for tenants, a preview of today's messages, a test button and the
// log of everything sent. Works on a phone.

type LogEntry = {
  id: string;
  name: string | null;
  kind: string | null;
  recipient: string | null;
  body: string | null;
  status: string | null;
  error: string | null;
  createdAt: string | null;
};

type GetResponse = {
  success: boolean;
  message?: string;
  settings?: NotificationSettings;
  twilioReady?: boolean;
  templates?: { summary: boolean; reminder: boolean; overdue: boolean };
  log?: LogEntry[];
};

type PreviewResponse = {
  success: boolean;
  message?: string;
  summary?: string;
  reminders?: Array<{ title: string; kind: string; to: string | null; body: string }>;
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
  radius: 'var(--t-border-radius-md)',
  blue: 'var(--t-color-blue9)',
  green: 'var(--t-color-green11)',
  red: 'var(--t-color-red11)',
  amber: 'var(--t-color-amber11)',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 14,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 36,
  padding: '0 10px',
  boxSizing: 'border-box',
  width: '100%',
};

const button = (tone: 'plain' | 'primary' | 'whatsapp' = 'plain'): CSSProperties => ({
  ...control,
  width: 'auto',
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  ...(tone === 'primary' ? { background: c.blue, color: '#fff', border: `1px solid ${c.blue}` } : {}),
  ...(tone === 'whatsapp' ? { background: '#25D366', color: '#fff', border: '1px solid #25D366' } : {}),
});

const card: CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 12, background: c.bg, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 };

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const hourLabel = (hour: number) => `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'am' : 'pm'}`;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const Switch = ({ on, onChange, disabled }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) => (
  <button
    onClick={() => !disabled && onChange(!on)}
    aria-pressed={on}
    style={{
      width: 44,
      height: 26,
      borderRadius: 13,
      border: 'none',
      padding: 0,
      cursor: disabled ? 'default' : 'pointer',
      background: on ? '#25D366' : c.border2,
      position: 'relative',
      flexShrink: 0,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
  </button>
);

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
      {hint ? <div style={{ fontSize: 12, color: c.text3, marginTop: 2 }}>{hint}</div> : null}
    </div>
    <div style={{ flex: '0 1 220px', display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
  </div>
);

const Bubble = ({ text, to }: { text: string; to?: string | null }) => (
  <div style={{ background: '#e7ffdb', color: '#111b21', borderRadius: '10px 10px 10px 2px', padding: '8px 10px', fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', maxWidth: 520, boxShadow: '0 1px 1px rgba(0,0,0,0.08)' }}>
    {to ? <div style={{ fontSize: 11, color: '#667781', marginBottom: 4 }}>To {to}</div> : null}
    {text}
  </div>
);

const STATUS: Record<string, { label: string; color: string }> = {
  SENT: { label: 'Sent', color: 'green' },
  FAILED: { label: 'Failed', color: 'red' },
  SKIPPED: { label: 'Not sent', color: 'gray' },
};

const KIND: Record<string, string> = {
  SUMMARY: 'Morning summary',
  RENT_UPCOMING: 'Rent coming up',
  RENT_DUE: 'Rent due today',
  RENT_OVERDUE: 'Rent overdue',
  TEST: 'Test',
};

const Notifications = () => {
  const [data, setData] = useState<GetResponse | null>(null);
  const [values, setValues] = useState<NotificationSettings | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [showAuto, setShowAuto] = useState(false);

  const call = useCallback(async <T,>(body: Record<string, unknown>) => new RestApiClient().post<T>('/s/notifications', body), []);

  const load = useCallback(async () => {
    const result = await call<GetResponse>({ action: 'get' });

    setData(result);
    if (result.settings) {
      setValues(result.settings);
      setSaved(JSON.stringify(result.settings));
    }
  }, [call]);

  useEffect(() => {
    load().catch((error) => setData({ success: false, message: error instanceof Error ? error.message : String(error) }));
  }, [load]);

  const run = async (key: string, body: Record<string, unknown>, after?: () => Promise<void>) => {
    setBusy(key);
    try {
      const result = await call<{ success: boolean; message?: string }>(body);

      await enqueueSnackbar({ message: result.message ?? (result.success ? 'Done.' : 'Something went wrong.'), variant: result.success ? 'success' : 'error' });
      if (result.success && after) await after();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Something went wrong.', variant: 'error' });
    } finally {
      setBusy('');
    }
  };

  const showPreview = async () => {
    setBusy('preview');
    try {
      setPreview(await call<PreviewResponse>({ action: 'preview', values }));
    } finally {
      setBusy('');
    }
  };

  if (!data) return <div style={{ padding: 20, fontFamily: c.font, color: c.text3 }}>Loading…</div>;
  if (!data.success || !values) return <div style={{ padding: 20, fontFamily: c.font, color: c.red }}>{data.message}</div>;

  const dirty = JSON.stringify(values) !== saved;
  const set = (patch: Partial<NotificationSettings>) => setValues({ ...values, ...patch });
  const select = (value: number, options: number[], onChange: (value: number) => void, label: (value: number) => string) => (
    <select value={String(value)} onChange={(e) => onChange(Number(readValue(e)))} style={{ ...control, width: 'auto', minWidth: 130 }}>
      {options.map((option) => (
        <option key={option} value={String(option)}>
          {label(option)}
        </option>
      ))}
    </select>
  );

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 'clamp(4px, 2vw, 16px)', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 650 }}>Notifications</div>
          <div style={{ fontSize: 13, color: c.text3, marginTop: 2 }}>Rent reminders for your tenants, ready to send from your own WhatsApp.</div>
        </div>
        <button onClick={() => run('save', { action: 'save', values }, load)} disabled={!dirty || busy !== ''} style={{ ...button('primary'), opacity: dirty ? 1 : 0.55 }}>
          {busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      {/* Tenant reminders: sent by you, one tap each */}
      <div style={card}>
        <Row label="🔔 Rent reminders for tenants" hint="Each day the reminders that are due appear here and on Today, written for you. Tap WhatsApp — it opens your WhatsApp with the message typed in — then press Send.">
          <Switch on={values.remindersEnabled} onChange={(remindersEnabled) => set({ remindersEnabled })} />
        </Row>
        {values.remindersEnabled && (
          <>
            <Row label="Before the due day">
              {select(values.remindDaysBefore, [0, 1, 2, 3, 5, 7], (remindDaysBefore) => set({ remindDaysBefore }), (d) => (d === 0 ? 'Don’t remind' : `${d} day${d === 1 ? '' : 's'} before`))}
            </Row>
            <Row label="On the due day">
              <Switch on={values.remindOnDueDay} onChange={(remindOnDueDay) => set({ remindOnDueDay })} />
            </Row>
            <Row label="When overdue" hint="Once, if still unpaid.">
              {select(values.remindDaysAfter, [0, 1, 3, 5, 7, 14], (remindDaysAfter) => set({ remindDaysAfter }), (d) => (d === 0 ? 'Don’t remind' : `${d} day${d === 1 ? '' : 's'} after`))}
            </Row>
            <Row label="Language">
              <select value={values.tenantLanguage} onChange={(e) => set({ tenantLanguage: readValue(e) === 'MS' ? 'MS' : 'EN' })} style={{ ...control, width: 'auto', minWidth: 130 }}>
                <option value="EN">English</option>
                <option value="MS">Bahasa Melayu</option>
              </select>
            </Row>
          </>
        )}
        {dirty ? (
          <div style={{ fontSize: 12, color: c.amber }}>Save your changes to see today’s reminders with these rules.</div>
        ) : (
          <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>To send today</div>
            <ReminderList key={saved} onSetup={() => set({ remindersEnabled: true })} />
          </div>
        )}
      </div>

      {/* Morning summary: needs automatic sending */}
      <div style={card}>
        <Row
          label="☀️ Morning summary to me"
          hint={
            data.twilioReady
              ? 'What’s overdue, due this week, contracts ending, documents expiring, birthdays and bills to file — sent to you each morning.'
              : 'Today shows the same thing whenever you open it. Sending it to your WhatsApp automatically will come with Meta’s WhatsApp service (later).'
          }
        >
          <Switch on={values.summaryEnabled} onChange={(summaryEnabled) => set({ summaryEnabled })} disabled={!data.twilioReady} />
        </Row>
        {data.twilioReady && (
          <>
            <Row label="My WhatsApp number" hint="+60123456789 or 012-345 6789">
              <input value={values.summaryPhone} onChange={(e) => set({ summaryPhone: readValue(e) })} placeholder="+60123456789" style={{ ...control, maxWidth: 220 }} />
            </Row>
            <Row label="Send at" hint="Malaysia time">
              {select(values.summaryHour, HOURS, (summaryHour) => set({ summaryHour }), hourLabel)}
            </Row>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={showPreview} disabled={busy !== ''} style={button()}>
            {busy === 'preview' ? 'Loading…' : 'Preview today’s summary'}
          </button>
          {data.twilioReady && (
            <button
              onClick={() => run('test', { action: 'test', to: values.summaryPhone }, load)}
              disabled={busy !== '' || !values.summaryPhone.trim()}
              style={{ ...button('whatsapp'), opacity: values.summaryPhone.trim() ? 1 : 0.5 }}
            >
              {busy === 'test' ? 'Sending…' : 'Send test'}
            </button>
          )}
        </div>
      </div>

      {/* Automatic sending (later) */}
      <div style={{ ...card, gap: 8 }}>
        <button onClick={() => setShowAuto(!showAuto)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
            ⚙️ Automatic sending {data.twilioReady ? <span style={{ color: c.green, fontWeight: 400, fontSize: 13 }}>· connected</span> : <span style={{ color: c.text3, fontWeight: 400, fontSize: 13 }}>· not set up (optional)</span>}
          </span>
          <span style={{ color: c.text3, fontSize: 12, transform: showAuto ? 'rotate(90deg)' : 'none' }}>▸</span>
        </button>
        {showAuto && (
          <div style={{ fontSize: 13, color: c.text2, lineHeight: 1.55 }}>
            {data.twilioReady ? (
              <>
                WhatsApp is connected, so the morning summary and reminders are sent for you at their hour (reminders at{' '}
                {select(values.reminderHour, HOURS, (reminderHour) => set({ reminderHour }), hourLabel)}).
              </>
            ) : (
              <>
                Right now you send reminders yourself, one tap each — free and from your own number. To have them sent for
                you, the app needs a WhatsApp business connection (Meta’s WhatsApp service is planned). Nothing to do here for
                now.
              </>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ ...card, background: '#efeae2' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#111b21' }}>Today’s summary</span>
            <button onClick={() => setPreview(null)} style={{ ...button(), height: 28 }}>
              Close
            </button>
          </div>
          <Bubble text={preview.summary ?? ''} />
          {data.twilioReady && (
            <button onClick={() => run('runNow', { action: 'runNow' }, load)} disabled={busy !== '' || dirty} style={{ ...button('whatsapp'), alignSelf: 'flex-start' }} title={dirty ? 'Save first' : ''}>
              {busy === 'runNow' ? 'Sending…' : 'Send these now'}
            </button>
          )}
        </div>
      )}

      {/* Log */}
      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Recent messages</div>
        {(data.log ?? []).length === 0 && <div style={{ fontSize: 13, color: c.text3 }}>Nothing sent yet.</div>}
        {(data.log ?? []).map((entry) => {
          const status = STATUS[entry.status ?? ''] ?? STATUS.SKIPPED;
          const open = openLog === entry.id;

          return (
            <button
              key={entry.id}
              onClick={() => setOpenLog(open ? null : entry.id)}
              style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderTop: `1px solid ${c.border}` }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '1px 7px',
                    borderRadius: 10,
                    background: status.color === 'gray' ? c.bg2 : `var(--t-color-${status.color}3)`,
                    color: status.color === 'gray' ? c.text2 : `var(--t-color-${status.color}11)`,
                  }}
                >
                  {status.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: '1 1 160px', minWidth: 0 }}>{KIND[entry.kind ?? ''] ?? entry.kind} · {entry.name}</span>
                <span style={{ fontSize: 12, color: c.text3 }}>{entry.createdAt ? new Date(entry.createdAt).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span>
              </div>
              {entry.error ? <div style={{ fontSize: 12, color: c.red }}>{entry.error}</div> : null}
              {open ? <Bubble to={entry.recipient} text={entry.body ?? ''} /> : null}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: c.text3, lineHeight: 1.5 }}>
        {data.twilioReady
          ? 'Automatic messages go out while the CRM is running; if this computer was off, they’re sent when it’s back on — never twice.'
          : 'Reminders are worked out each day from your contracts and the payments you’ve recorded. Once you send or skip one, it won’t be suggested again.'}
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: NOTIFICATIONS_FRONT_COMPONENT_ID,
  name: 'notifications',
  description: 'WhatsApp assistant: morning summary, tenant reminders, preview, test and log',
  component: Notifications,
});
