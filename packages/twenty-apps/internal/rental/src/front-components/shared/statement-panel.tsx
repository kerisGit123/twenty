import { type CSSProperties, type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { TemplatePreview } from 'src/front-components/shared/template-preview';
import type { SavedTemplate } from 'src/logic-functions/utils/templates';
import { statementContext, type LetterheadExtras } from 'src/shared/doc-template/context';
import { presetTemplate } from 'src/shared/doc-template/presets';
import { type TemplateDoc, byLanguage } from 'src/shared/doc-template/types';
import { type TenantPhone, whatsappLink } from 'src/shared/whatsapp-link';
import { type StatementSource } from 'src/shared/year-statement';

// Side panel for a tenant's year statement: pick the year and the template
// (English or Malay), fill in how the tenant appears and any extra note, then
// open the PDF or send a WhatsApp summary.

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

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  padding: '6px 10px',
  boxSizing: 'border-box',
};

const button = (primary = false): CSSProperties => ({
  ...control,
  height: 32,
  padding: '0 12px',
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  ...(primary ? { background: 'var(--t-color-blue9)', color: '#fff', border: '1px solid var(--t-color-blue9)' } : {}),
});

const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 };

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

type StatementResponse = {
  success: boolean;
  source?: StatementSource;
  templates?: SavedTemplate[];
  accent?: string;
  message?: string;
} & LetterheadExtras;

export const StatementPanel = ({
  rentalId,
  propertyName,
  tenantName,
  tenantPhone,
  initialYear,
  onClose,
}: {
  rentalId: string;
  propertyName: string;
  tenantName: string;
  tenantPhone: TenantPhone;
  initialYear: number;
  onClose: () => void;
}) => {
  const [year, setYear] = useState(initialYear);
  const [source, setSource] = useState<StatementSource | null>(null);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [accent, setAccent] = useState('BLACK');
  const [extras, setExtras] = useState<LetterheadExtras>({});
  const [tenantDetails, setTenantDetails] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState({ tenantDetails: '', note: '' });
  const [busy, setBusy] = useState(false);
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;

    setSource(null);
    new RestApiClient()
      .post<StatementResponse>('/s/statements/year', { rentalId, year })
      .then(async (result) => {
        if (cancelled) return;
        if (!result.success || !result.source) {
          await enqueueSnackbar({ message: result.message ?? 'Could not load the statement.', variant: 'error' });

          return;
        }
        setSource(result.source);
        setTemplates(result.templates ?? []);
        setAccent(result.accent ?? 'BLACK');
        setExtras({ signatureUrl: result.signatureUrl, logoUrl: result.logoUrl, paymentQrUrl: result.paymentQrUrl, paymentDetails: result.paymentDetails });
        setTemplateId((current) => current || (result.templates ?? []).find((t) => t.isDefault)?.id || '');
        setTenantDetails(result.source.rental.tenantDetails);
        setNote(result.source.rental.statementNote);
        setSaved({ tenantDetails: result.source.rental.tenantDetails, note: result.source.rental.statementNote });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [rentalId, year]);

  // The chosen template (else the English sample), filled with the letter as
  // it stands with the unsaved edits.
  const template: TemplateDoc = templates.find((t) => t.id === templateId)?.content ?? presetTemplate('STATEMENT', 'EN');
  const context = useMemo(
    () =>
      source
        ? statementContext({ ...source, rental: { ...source.rental, tenantDetails, statementNote: note } }, template.language, accent, extras)
        : null,
    [source, tenantDetails, note, template.language, accent, extras],
  );
  const dirty = tenantDetails !== saved.tenantDetails || note !== saved.note;

  const save = async () => {
    setBusy(true);
    try {
      const result = await new RestApiClient().post<{ success: boolean; message?: string }>('/s/statements/year', {
        action: 'save',
        rentalId,
        year,
        tenantDetails,
        statementNote: note,
      });

      if (!result.success) throw new Error(result.message ?? 'Could not save.');
      setSaved({ tenantDetails, note });
      await enqueueSnackbar({ message: 'Saved on the contract.', variant: 'success' });
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const printUrl = new RestApiClient().resolveUrl('/s/statements/print', {
    query: { rental: rentalId, year, ...(templateId ? { template: templateId } : {}) },
  });

  // A short summary in the template's language.
  const t = (en: string, ms: string, zh: string) => byLanguage(template.language, en, ms, zh);
  const owed = context?.flags.includes('arrears');
  const firstName = tenantName.split(' ')[0];
  const payTo = context?.values['pay.to'];
  const whatsappText = context
    ? [
        t(`Hi ${firstName || 'there'},`, `Salam ${firstName || 'tuan'},`, `${tenantName || ''}您好，`),
        t(`Rent received for ${propertyName} in ${year}:`, `Rekod pembayaran sewa ${propertyName} bagi tahun ${year}:`, `${propertyName} ${year}年的租金记录：`),
        ...context.months.map((row) => `- ${row.month.charAt(0)}${row.month.slice(1).toLowerCase()}: ${row.amount}`),
        `${t('Total', 'Jumlah', '总计')}: ${context.total}`,
        owed
          ? t(`Still owed: ${context.values['arrears.months']} ${year}.`, `Tunggakan: ${context.values['arrears.months']} ${year}.`, `尚欠：${year}年${context.values['arrears.months']}。`)
          : t(`No rent outstanding for ${year}.`, `Tiada tunggakan sewa bagi tahun ${year}.`, `${year}年并无拖欠租金。`),
        ...(owed && payTo ? [`${t('Pay to', 'Bayar ke', '付款至')}: ${payTo}`] : []),
        t('The full letter will follow separately. Thank you.', 'Surat penuh akan dihantar berasingan. Terima kasih.', '正式信函将另行发送。谢谢。'),
      ].join('\n')
    : '';
  const whatsapp = context ? whatsappLink(tenantPhone, whatsappText) : null;

  return (
    <div
      style={{
        height: '100%',
        background: c.bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        fontFamily: c.font,
        color: c.text,
      }}
    >
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Year statement</div>
          <div style={{ fontSize: 12, color: c.text2, marginTop: 2 }}>
            {propertyName} · {tenantName}
          </div>
        </div>
        <select value={String(year)} onChange={(e) => setYear(Number(readValue(e)))} style={{ ...control, height: 28, padding: '0 8px' }}>
          {Array.from({ length: 6 }, (_, index) => thisYear - index).map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        <button onClick={onClose} style={{ ...button(), width: 28, height: 28, padding: 0 }} aria-label="Close">
          ×
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={field}>
          Template
          <select value={templateId} onChange={(e) => setTemplateId(readValue(e))} style={control}>
            {templates.length === 0 && <option value="">English sample (make your own in Reports → Templates)</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.isDefault ? '★ ' : ''}
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          Tenant on the letter — name or company, registration no., address (one per line)
          <textarea
            value={tenantDetails}
            onChange={(e) => setTenantDetails(readValue(e))}
            placeholder={'THE RISING STARTRADING\n202303309610\n(JM0996289-T)\nNO. 2286 Kampar,\nPerak.'}
            rows={4}
            style={{ ...control, resize: 'vertical' }}
          />
        </label>
        <label style={field}>
          Extra note for the notes section (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(readValue(e))}
            placeholder={t(`October ${year} rent was taken from the deposit.`, `Bagi bulan Oktober ${year}, sewa telah dipotong daripada deposit.`, `${year}年十月的租金已从按金中扣除。`)}
            rows={2}
            style={{ ...control, resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={busy || !dirty} style={{ ...button(dirty), opacity: dirty ? 1 : 0.6 }}>
            {busy ? 'Saving…' : dirty ? 'Save details' : 'Saved'}
          </button>
          <a href={printUrl} target="_blank" rel="noreferrer" style={{ ...button(!dirty), color: dirty ? c.text : '#fff' }}>
            Open PDF
          </a>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" style={{ ...button(), background: '#25D366', border: '1px solid #25D366', color: '#fff' }}>
              WhatsApp summary
            </a>
          )}
        </div>
        {dirty && <div style={{ fontSize: 12, color: c.text3 }}>Save first — the PDF uses what's saved on the contract.</div>}

        {!context ? (
          <div style={{ fontSize: 13, color: c.text3 }}>Loading {year}…</div>
        ) : (
          <TemplatePreview template={template} context={context} />
        )}
      </div>
    </div>
  );
};
