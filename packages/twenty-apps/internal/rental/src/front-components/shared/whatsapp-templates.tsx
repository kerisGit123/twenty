import { useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { copyToClipboard, enqueueSnackbar } from 'twenty-sdk/front-component';

// WhatsApp templates panel for the Notifications page: shows the app's
// templates in Twilio with their WhatsApp approval status, creates the missing
// ones, and gives each HX… id to paste into Settings → Apps → Rental.

type TemplateStatus = {
  key: string;
  label: string;
  setting: string;
  sid: string | null;
  status: string;
  reason?: string;
  inUse: boolean;
};

type Response = { success: boolean; message?: string; templates?: TemplateStatus[] };

const c = {
  font: 'var(--t-font-family)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  bg: 'var(--t-background-primary)',
  green: '#25D366',
};

const TONE: Record<string, string> = { approved: 'green', rejected: 'red', pending: 'amber', received: 'amber' };

const small = {
  fontFamily: c.font,
  fontSize: 12,
  height: 28,
  padding: '0 10px',
  borderRadius: 8,
  border: `1px solid ${c.border2}`,
  background: c.bg,
  cursor: 'pointer',
} as const;

export const WhatsappTemplates = () => {
  const [rows, setRows] = useState<TemplateStatus[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const call = useCallback((action: string) => new RestApiClient().post<Response>('/s/notifications', { action }), []);

  const load = useCallback(async () => {
    const result = await call('templates');

    if (result.success) setRows(result.templates ?? []);
    else setError(result.message ?? 'Could not load templates.');
  }, [call]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const result = await call('createTemplates');

      if (result.templates) setRows(result.templates);
      await enqueueSnackbar({ message: result.message ?? 'Done.', variant: result.success ? 'success' : 'error' });
    } catch (e) {
      await enqueueSnackbar({ message: e instanceof Error ? e.message : 'Something went wrong.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div style={{ fontSize: 12, color: 'var(--t-color-red11)' }}>{error}</div>;
  if (!rows) return <div style={{ fontSize: 12, color: c.text3 }}>Checking templates…</div>;

  const missing = rows.some((r) => !r.sid || r.status === 'not submitted');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>WhatsApp templates</div>
      <div style={{ fontSize: 12, color: c.text3, lineHeight: 1.5 }}>
        Needed to message tenants who haven’t written to you in the last 24 hours. Once one is approved, copy its id into the
        named setting in Settings → Apps → Rental.
      </div>
      {rows.map((r) => {
        const tone = TONE[r.status] ?? 'gray';

        return (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ flex: '1 1 180px', minWidth: 0 }}>{r.label}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '1px 7px',
                borderRadius: 10,
                background: `var(--t-color-${tone}3)`,
                color: `var(--t-color-${tone}11)`,
              }}
            >
              {r.inUse ? 'in use' : r.status}
            </span>
            {r.sid && !r.inUse ? (
              <button
                style={small}
                title={`Paste into ${r.setting}`}
                onClick={async () => {
                  await copyToClipboard(r.sid as string);
                  await enqueueSnackbar({ message: `Copied ${r.sid} — paste it into ${r.setting}.`, variant: 'success' });
                }}
              >
                Copy id
              </button>
            ) : null}
            {r.reason ? <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--t-color-red11)' }}>{r.reason}</div> : null}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8 }}>
        {missing ? (
          <button onClick={create} disabled={busy} style={{ ...small, height: 34, fontWeight: 600, borderColor: c.green }}>
            {busy ? 'Creating…' : 'Create & submit templates'}
          </button>
        ) : null}
        <button onClick={() => load()} disabled={busy} style={{ ...small, height: 34 }}>
          Refresh status
        </button>
      </div>
    </div>
  );
};
