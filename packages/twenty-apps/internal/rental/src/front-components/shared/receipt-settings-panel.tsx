import { type CSSProperties, type SyntheticEvent, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { ReceiptView, type ReceiptViewData } from 'src/front-components/shared/receipt-view';
import {
  ACCENTS,
  DEFAULT_TEXT,
  type ReceiptAccent,
  type ReceiptSettingsRecord,
  type ReceiptTemplate,
  resolveStyle,
  resolveTitle,
} from 'src/logic-functions/utils/receipt-settings';

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
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  padding: '6px 10px',
  boxSizing: 'border-box',
  width: '100%',
};

const button = (primary = false): CSSProperties => ({
  ...control,
  width: 'auto',
  height: 32,
  padding: '0 14px',
  cursor: 'pointer',
  fontWeight: 500,
  ...(primary ? { background: c.accent, color: '#fff', border: `1px solid ${c.accent}` } : {}),
});

const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 };

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const TEMPLATES: Array<{ value: ReceiptTemplate; label: string; hint: string }> = [
  { value: 'CLASSIC', label: 'Classic form', hint: 'Boxed form, A4' },
  { value: 'MODERN', label: 'Modern', hint: 'Clean, big amount, A4' },
  { value: 'COMPACT', label: 'Compact', hint: 'Half page (A5)' },
];

const COLOURS: Array<{ value: ReceiptAccent; label: string }> = [
  { value: 'TEAL', label: 'Teal' },
  { value: 'NAVY', label: 'Navy' },
  { value: 'GREEN', label: 'Green' },
  { value: 'MAROON', label: 'Maroon' },
  { value: 'BLACK', label: 'Black' },
];

type SettingsResponse = {
  success: boolean;
  message?: string;
  settings?: ReceiptSettingsRecord | null;
  workspaceName?: string;
  receivedByFallback?: string;
};

export const ReceiptSettingsPanel = ({ onClose }: { onClose: () => void }) => {
  const [values, setValues] = useState<ReceiptSettingsRecord>({ template: 'CLASSIC', accentColor: 'TEAL' });
  const [fallbacks, setFallbacks] = useState({ workspaceName: '', receivedBy: '' });
  const [sample, setSample] = useState<'rent' | 'deposit'>('rent');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await new RestApiClient().post<SettingsResponse>('/s/receipts/settings', { action: 'get' });

        if (result.settings) setValues({ template: 'CLASSIC', accentColor: 'TEAL', ...result.settings });
        setFallbacks({ workspaceName: result.workspaceName ?? '', receivedBy: result.receivedByFallback ?? '' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (key: keyof ReceiptSettingsRecord) => (event: SyntheticEvent<HTMLElement>) =>
    setValues((previous) => ({ ...previous, [key]: readValue(event) }));

  const save = async () => {
    setSaving(true);
    try {
      const result = await new RestApiClient().post<SettingsResponse>('/s/receipts/settings', { action: 'save', values });

      await enqueueSnackbar({ message: result.message ?? 'Saved.', variant: result.success ? 'success' : 'error' });
      if (result.success) onClose();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const isDeposit = sample === 'deposit';
  const preview: ReceiptViewData = {
    title: resolveTitle(values, isDeposit),
    style: resolveStyle(values),
    issuerName: values.businessName?.trim() || fallbacks.workspaceName || 'Your business',
    receiptNumber: 'RCP-2026-0001',
    date: '4 Oct 2026',
    receivedFrom: 'Ali bin Ahmad',
    amountText: isDeposit ? 'RM 3,000.00' : 'RM 1,500.00',
    amountInWords: isDeposit ? 'Ringgit Malaysia Three Thousand Only' : 'Ringgit Malaysia One Thousand Five Hundred Only',
    forRentAt: 'Block A-3-2, Residensi Mawar, 47301 Petaling Jaya, Selangor',
    periodFrom: isDeposit ? '' : '1 Oct 2026',
    periodTo: isDeposit ? '' : '31 Oct 2026',
    purpose: 'Security deposit',
    receivedBy: values.receivedBy?.trim() || fallbacks.receivedBy || 'Your name',
    method: 'DUITNOW',
    paidOn: '4 Oct 2026',
    notes: '',
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Receipt settings</div>
          <div style={{ fontSize: 12, color: c.text2, marginTop: 2 }}>Applies to new receipts and previews. Issued receipts keep their look.</div>
        </div>
        <button onClick={onClose} style={button()}>Cancel</button>
        <button onClick={save} disabled={saving || loading} style={button(true)}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexWrap: 'wrap', overflow: 'auto' }}>
        <div style={{ flex: '1 1 300px', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, borderRight: `1px solid ${c.border}` }}>
          <div style={field}>
            Template
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {TEMPLATES.map((template) => {
                const active = (values.template ?? 'CLASSIC') === template.value;

                return (
                  <button
                    key={template.value}
                    onClick={() => setValues((previous) => ({ ...previous, template: template.value }))}
                    style={{ ...control, cursor: 'pointer', textAlign: 'left', padding: '8px 10px', border: `${active ? 2 : 1}px solid ${active ? c.accent : c.border2}` }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{template.label}</div>
                    <div style={{ fontSize: 11, color: c.text3, marginTop: 2 }}>{template.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={field}>
            Colour
            <div style={{ display: 'flex', gap: 8 }}>
              {COLOURS.map((colour) => {
                const active = (values.accentColor ?? 'TEAL') === colour.value;

                return (
                  <button
                    key={colour.value}
                    title={colour.label}
                    aria-label={colour.label}
                    onClick={() => setValues((previous) => ({ ...previous, accentColor: colour.value }))}
                    style={{ width: 28, height: 28, borderRadius: 14, cursor: 'pointer', background: ACCENTS[colour.value].main, border: active ? `3px solid ${c.accent}` : `1px solid ${c.border2}`, outline: active ? `2px solid ${c.bg}` : 'none', outlineOffset: -5 }}
                  />
                );
              })}
            </div>
          </div>

          <label style={field}>
            Business name
            <input value={values.businessName ?? ''} onChange={set('businessName')} placeholder={fallbacks.workspaceName || 'Your business name'} style={control} />
          </label>
          <label style={field}>
            Business details (address, phone, SSM no.)
            <textarea value={values.businessDetails ?? ''} onChange={set('businessDetails')} placeholder={'No. 1, Jalan Example, 50000 Kuala Lumpur\nTel 012-345 6789'} rows={3} style={{ ...control, resize: 'vertical' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={field}>
              Rent receipt title
              <input value={values.rentTitle ?? ''} onChange={set('rentTitle')} placeholder={DEFAULT_TEXT.rentTitle} style={control} />
            </label>
            <label style={field}>
              Deposit receipt title
              <input value={values.depositTitle ?? ''} onChange={set('depositTitle')} placeholder={DEFAULT_TEXT.depositTitle} style={control} />
            </label>
          </div>
          <label style={field}>
            Received by
            <input value={values.receivedBy ?? ''} onChange={set('receivedBy')} placeholder={fallbacks.receivedBy || 'Your name'} style={control} />
          </label>
          <label style={field}>
            Footer text
            <textarea value={values.footerText ?? ''} onChange={set('footerText')} placeholder={DEFAULT_TEXT.footerText} rows={2} style={{ ...control, resize: 'vertical' }} />
          </label>
          <label style={field}>
            How tenants pay you
            <input value={values.paymentDetails ?? ''} onChange={set('paymentDetails')} placeholder="Maybank 1234 5678 9012 (Your Name) or DuitNow 012-345 6789" style={control} />
            <span style={{ fontSize: 11.5, color: c.text3, fontWeight: 400 }}>Goes into rent reminders as {'{pay_to}'}.</span>
          </label>
        </div>

        <div style={{ flex: '1 1 360px', padding: 16, background: c.bg2, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: c.text2, fontWeight: 500 }}>Live preview (sample data)</div>
            {(['rent', 'deposit'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setSample(option)}
                style={{ ...button(), height: 26, padding: '0 10px', fontSize: 12, background: sample === option ? c.bg : 'transparent', fontWeight: sample === option ? 600 : 400 }}
              >
                {option === 'rent' ? 'Rent' : 'Deposit'}
              </button>
            ))}
          </div>
          <ReceiptView data={preview} />
        </div>
      </div>
    </div>
  );
};
