import { type CSSProperties, type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { AppPath, enqueueSnackbar, navigate } from 'twenty-sdk/front-component';

import { ReceiptView, type ReceiptViewData } from 'src/front-components/shared/receipt-view';
import { presetTemplate } from 'src/shared/doc-template/presets';
import { sampleReceipt } from 'src/shared/doc-template/samples';
import { type TemplateDoc } from 'src/shared/doc-template/types';
import {
  ACCENTS,
  DEFAULT_TEXT,
  type ReceiptAccent,
  type ReceiptSettingsRecord,
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
  defaults?: ReceiptSettingsRecord | null; // the default settings, when editing a workspace's own
  ownerName?: string | null;
  owners?: Array<{ id: string; name: string; hasOwn: boolean }>;
  canEditDefault?: boolean;
  canEdit?: boolean;
  workspaceName?: string;
  receivedByFallback?: string;
};

const LOOKS = ['template', 'accentColor', 'rentTitle', 'depositTitle', 'footerText'] as const;

// Receipt settings: the default (used by every workspace without its own)
// or one workspace's own — its name, address, bank details, logo and receipt
// prefix; looks left empty follow the default.
export const ReceiptSettingsPanel = ({ onClose }: { onClose: () => void }) => {
  const [ownerId, setOwnerId] = useState('');
  const [values, setValues] = useState<ReceiptSettingsRecord>({ template: 'CLASSIC', accentColor: 'TEAL' });
  const [info, setInfo] = useState<SettingsResponse>({ success: false });
  const [fallbacks, setFallbacks] = useState({ workspaceName: '', receivedBy: '' });
  const [sample, setSample] = useState<'rent' | 'deposit'>('rent');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // The receipt template this workspace uses (for the preview).
  const [template, setTemplate] = useState<TemplateDoc | null>(null);

  const load = useCallback(async (owner: string) => {
    setLoading(true);
    try {
      const result = await new RestApiClient().post<SettingsResponse>('/s/receipts/settings', { action: 'get', ownerId: owner || null });

      setInfo(result);
      // A workspace's own record keeps empty looks empty (they follow the default).
      setValues(owner ? { ...(result.settings ?? {}) } : { template: 'CLASSIC', accentColor: 'TEAL', ...(result.settings ?? {}) });
      setFallbacks({ workspaceName: result.workspaceName ?? '', receivedBy: result.receivedByFallback ?? '' });
      const list = await new RestApiClient().post<{ success: boolean; templates?: Array<{ isDefault: boolean; ownerId: string | null; content: TemplateDoc }> }>('/s/templates', {
        action: 'list',
        kind: 'RECEIPT',
        ownerId: owner || null,
      });
      const usable = list.templates ?? [];

      setTemplate(
        ((owner ? usable.find((t) => t.isDefault && t.ownerId === owner) : undefined) ?? usable.find((t) => t.isDefault && !t.ownerId))?.content ?? presetTemplate('RECEIPT', 'EN'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(ownerId);
  }, [load, ownerId]);

  const defaults = info.defaults ?? null;
  const canEdit = Boolean(info.canEdit);
  // What a look field prints: this workspace's own, else the default's.
  const look = (key: (typeof LOOKS)[number]) => (values[key] || (ownerId ? defaults?.[key] : undefined) || undefined) as string | undefined;
  const followsDefault = (key: (typeof LOOKS)[number]) => Boolean(ownerId && !values[key]);

  const openImages = async () => {
    const result = await new RestApiClient().post<{ success: boolean; id?: string; message?: string }>('/s/templates', { action: 'settingsRecord', ownerId: ownerId || null });

    if (result.id) await navigate(AppPath.RecordShowPage, { objectNameSingular: 'receiptSetting', objectRecordId: result.id });
    else await enqueueSnackbar({ message: result.message ?? 'Could not open the settings.', variant: 'error' });
  };

  const set = (key: keyof ReceiptSettingsRecord) => (event: SyntheticEvent<HTMLElement>) =>
    setValues((previous) => ({ ...previous, [key]: readValue(event) }));

  const save = async () => {
    setSaving(true);
    try {
      const result = await new RestApiClient().post<SettingsResponse>('/s/receipts/settings', { action: 'save', ownerId: ownerId || null, values });

      await enqueueSnackbar({ message: result.message ?? 'Saved.', variant: result.success ? 'success' : 'error' });
      if (result.success) onClose();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const isDeposit = sample === 'deposit';
  const shown: ReceiptSettingsRecord = { ...values, ...Object.fromEntries(LOOKS.map((key) => [key, look(key) ?? null])) };
  const prefix = (values.receiptPrefix || (ownerId ? '' : '') || 'RCP').toUpperCase();
  const preview: ReceiptViewData = {
    title: resolveTitle(shown, isDeposit),
    style: resolveStyle(shown),
    issuerName: values.businessName?.trim() || (ownerId ? info.ownerName : '') || fallbacks.workspaceName || 'Your business',
    receiptNumber: `${prefix}-2026-0001`,
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
          <div style={{ fontSize: 12, color: c.text2, marginTop: 2 }}>Applies to new receipts, statements and previews. Issued receipts keep their look.</div>
        </div>
        <button onClick={onClose} style={button()}>Cancel</button>
        <button onClick={save} disabled={saving || loading || !canEdit} style={button(true)}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: c.bg2 }}>
        <span style={{ fontSize: 12, color: c.text2 }}>Settings for</span>
        <select value={ownerId} onChange={(e) => setOwnerId(readValue(e))} style={{ ...control, width: 'auto', minWidth: 200 }}>
          {(info.canEditDefault || !ownerId) && <option value="">Default — every workspace without its own</option>}
          {(info.owners ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.hasOwn ? ' · own settings' : ' · uses the default'}
            </option>
          ))}
        </select>
        <button onClick={openImages} disabled={!canEdit} style={{ ...button(), height: 30 }} title="Upload the logo, DuitNow QR and signature">
          Logo, QR &amp; signature →
        </button>
        <span style={{ fontSize: 11.5, color: c.text3, flex: '1 1 260px' }}>
          {ownerId
            ? 'This workspace prints its own name, address, bank details, logo and receipt numbers. Looks left empty follow the default.'
            : 'Used by every workspace that has no settings of its own.'}
          {!canEdit && ' You can view these but not change them.'}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexWrap: 'wrap', overflow: 'auto' }}>
        <div style={{ flex: '1 1 300px', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, borderRight: `1px solid ${c.border}` }}>
          <div style={{ ...field, background: c.bg2, borderRadius: 8, padding: '8px 10px' }}>
            Layout
            <span style={{ fontSize: 12, color: c.text3 }}>
              Receipts and statements are designed in <b>Setup → Templates</b> (a ★ default per workspace, in English, Malay or Chinese). The name,
              colour and wording below fill them in.
            </span>
          </div>

          <div style={field}>
            Colour{followsDefault('accentColor') ? ' (following the default)' : ''}
            <div style={{ display: 'flex', gap: 8 }}>
              {COLOURS.map((colour) => {
                const active = (look('accentColor') ?? 'TEAL') === colour.value;

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
            <input value={values.businessName ?? ''} onChange={set('businessName')} placeholder={(ownerId ? info.ownerName : '') || fallbacks.workspaceName || 'Your business name'} style={control} />
          </label>
          <label style={field}>
            Business details (address, phone, SSM no.)
            <textarea value={values.businessDetails ?? ''} onChange={set('businessDetails')} placeholder={'No. 1, Jalan Example, 50000 Kuala Lumpur\nTel 012-345 6789'} rows={3} style={{ ...control, resize: 'vertical' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={field}>
              Rent receipt title
              <input value={values.rentTitle ?? ''} onChange={set('rentTitle')} placeholder={(ownerId && defaults?.rentTitle) || DEFAULT_TEXT.rentTitle} style={control} />
            </label>
            <label style={field}>
              Deposit receipt title
              <input value={values.depositTitle ?? ''} onChange={set('depositTitle')} placeholder={(ownerId && defaults?.depositTitle) || DEFAULT_TEXT.depositTitle} style={control} />
            </label>
          </div>
          <label style={field}>
            Received by
            <input value={values.receivedBy ?? ''} onChange={set('receivedBy')} placeholder={fallbacks.receivedBy || 'Your name'} style={control} />
          </label>
          <label style={field}>
            Footer text
            <textarea value={values.footerText ?? ''} onChange={set('footerText')} placeholder={(ownerId && defaults?.footerText) || DEFAULT_TEXT.footerText} rows={2} style={{ ...control, resize: 'vertical' }} />
          </label>
          <label style={field}>
            How tenants pay you
            <input value={values.paymentDetails ?? ''} onChange={set('paymentDetails')} placeholder="Maybank 1234 5678 9012 (Your Name) or DuitNow 012-345 6789" style={control} />
            <span style={{ fontSize: 11.5, color: c.text3, fontWeight: 400 }}>Goes into rent reminders as {'{pay_to}'}.</span>
          </label>
          <label style={field}>
            Receipt number prefix
            <input value={values.receiptPrefix ?? ''} onChange={set('receiptPrefix')} placeholder="RCP" maxLength={8} style={{ ...control, textTransform: 'uppercase', maxWidth: 140 }} />
            <span style={{ fontSize: 11.5, color: c.text3, fontWeight: 400 }}>
              Receipts are numbered {prefix}-2026-0001, {prefix}-2026-0002… Give each business its own prefix to keep separate receipt books.
            </span>
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
          <ReceiptView
            data={
              template
                ? {
                    ...preview,
                    template,
                    facts: {
                      ...sampleReceipt(
                        {
                          name: preview.issuerName,
                          details: values.businessDetails ?? '',
                          accent: look('accentColor') ?? 'TEAL',
                          receivedBy: preview.receivedBy,
                          footer: look('footerText') ?? '',
                          rentTitle: look('rentTitle') ?? '',
                          depositTitle: look('depositTitle') ?? '',
                        },
                        isDeposit,
                        false,
                      ),
                      receiptNumber: preview.receiptNumber,
                    },
                    logoUrl: values.logoUrl ?? null,
                    paymentQrUrl: values.paymentQrUrl ?? null,
                    signatureUrl: values.signatureUrl ?? null,
                  }
                : preview
            }
          />
        </div>
      </div>
    </div>
  );
};
