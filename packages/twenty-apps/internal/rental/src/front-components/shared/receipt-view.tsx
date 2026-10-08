import { type CSSProperties, type ReactNode } from 'react';

import {
  ACCENTS,
  DEFAULT_STYLE,
  type ReceiptStyle,
} from 'src/logic-functions/utils/receipt-settings';
import { TemplatePreview } from 'src/front-components/shared/template-preview';
import { type ReceiptFacts, receiptContext } from 'src/shared/doc-template/context';
import { type TemplateDoc } from 'src/shared/doc-template/types';

// Same content and layouts as the PDF (src/logic-functions/utils/receipt-pdf.ts),
// drawn in HTML so it can be shown and previewed inside the app.
export type ReceiptViewData = {
  title: string;
  watermark?: 'DRAFT' | 'VOID' | null;
  issuerName: string;
  receiptNumber: string;
  date: string;
  receivedFrom: string;
  amountText: string;
  amountInWords: string;
  forRentAt: string;
  periodFrom: string;
  periodTo: string;
  purpose: string;
  receivedBy: string;
  method: string | null;
  paidOn: string;
  notes: string;
  style?: ReceiptStyle;
  // Receipts made with a template (Reports -> Templates) are drawn with it.
  facts?: ReceiptFacts;
  template?: TemplateDoc;
  signatureUrl?: string | null;
  logoUrl?: string | null;
  paymentQrUrl?: string | null;
  paymentDetails?: string | null;
};

const INK = '#222429';
const MUTED = '#6b7079';
const RED = '#cc1f1f';

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'DUITNOW', label: 'DuitNow' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
  { value: 'FROM_DEPOSIT', label: 'Deposit' },
];
const methodLabel = (value: string | null) => METHODS.find((m) => m.value === value)?.label ?? '-';

const Paper = ({ children, scale, watermark, compact }: { children: ReactNode; scale: number; watermark?: string | null; compact?: boolean }) => (
  <div
    style={{
      position: 'relative',
      background: '#fff',
      color: INK,
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: 11 * scale,
      width: `${100 * Math.max(scale, 1)}%`,
      padding: compact ? '1.2em' : '1.6em',
      boxSizing: 'border-box',
      borderRadius: 6,
      boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
      overflow: 'hidden',
    }}
  >
    {children}
    {watermark ? (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <span style={{ transform: 'rotate(-28deg)', fontSize: '6em', fontWeight: 700, color: watermark === 'VOID' ? RED : '#888', opacity: 0.18, letterSpacing: '0.05em' }}>
          {watermark}
        </span>
      </div>
    ) : null}
  </div>
);

const Lines = ({ text, style }: { text: string; style: CSSProperties }) =>
  text ? <div style={{ ...style, whiteSpace: 'pre-line' }}>{text}</div> : null;

// ------------------------------------------------------------- classic

const Classic = ({ data, style }: { data: ReceiptViewData; style: ReceiptStyle }) => {
  const accent = ACCENTS[style.accent];
  const cell: CSSProperties = { border: `1px solid ${accent.grid}`, padding: '0.5em 0.6em', verticalAlign: 'middle' };
  const label: CSSProperties = { ...cell, background: accent.soft, fontWeight: 700, whiteSpace: 'nowrap', width: '1%' };
  const hasPeriod = Boolean(data.periodFrom || data.periodTo);

  return (
    <>
      <div style={{ background: accent.main, color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: '1.7em', padding: '0.45em 0' }}>{data.title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', border: `1px solid ${accent.grid}`, borderTop: 'none', padding: '0.7em 0.8em' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1.25em' }}>{data.issuerName}</div>
          <Lines text={style.businessDetails} style={{ color: MUTED, fontSize: '0.8em', marginTop: '0.2em' }} />
        </div>
        <div style={{ color: MUTED, fontWeight: 700, marginRight: '0.4em', marginTop: '0.35em' }}>No.</div>
        <div style={{ color: RED, fontWeight: 700, fontSize: '1.55em' }}>{data.receiptNumber}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr><td style={label}>Received From</td><td style={{ ...cell, fontWeight: 700 }}>{data.receivedFrom || '-'}</td><td style={label}>Date</td><td style={cell}>{data.date}</td></tr>
          <tr><td style={label}>Amount</td><td style={{ ...cell, fontWeight: 700, fontSize: '1.2em' }}>{data.amountText}</td><td style={label}>Paid on</td><td style={cell}>{data.paidOn}</td></tr>
          <tr><td style={label}>The sum of</td><td style={cell} colSpan={3}>{data.amountInWords}</td></tr>
          <tr><td style={label}>For Rent at</td><td style={cell} colSpan={3}>{data.forRentAt || '-'}</td></tr>
          {hasPeriod ? (
            <tr><td style={label}>Period From</td><td style={cell}>{data.periodFrom}</td><td style={label}>To</td><td style={cell}>{data.periodTo}</td></tr>
          ) : (
            <tr><td style={label}>Being payment of</td><td style={cell} colSpan={3}>{data.purpose}</td></tr>
          )}
          <tr><td style={label}>Received by</td><td style={cell}>{data.receivedBy}</td><td style={label}>Signature</td><td style={cell} /></tr>
          <tr>
            <td style={label}>Paid by</td>
            <td style={cell} colSpan={3}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em 1.1em' }}>
                {METHODS.map((method) => {
                  const selected = data.method === method.value;

                  return (
                    <span key={method.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em', fontWeight: selected ? 700 : 400 }}>
                      <span style={{ width: '0.95em', height: '0.95em', border: `1px solid ${INK}`, background: selected ? accent.main : '#fff', color: '#fff', fontSize: '0.85em', lineHeight: '0.95em', textAlign: 'center', display: 'inline-block' }}>
                        {selected ? '✓' : ''}
                      </span>
                      {method.label}
                    </span>
                  );
                })}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      {data.notes ? <div style={{ marginTop: '0.9em' }}><span style={{ color: MUTED, fontWeight: 700 }}>Notes: </span>{data.notes}</div> : null}
      <Lines text={style.footerText} style={{ marginTop: '0.9em', color: MUTED, fontSize: '0.8em' }} />
    </>
  );
};

// ------------------------------------------------------------- modern

const Modern = ({ data, style }: { data: ReceiptViewData; style: ReceiptStyle }) => {
  const accent = ACCENTS[style.accent];
  const rows: Array<[string, string]> = [
    data.periodFrom || data.periodTo ? ['Rent period', `${data.periodFrom} – ${data.periodTo}`] : ['Being payment of', data.purpose],
    ['Payment method', methodLabel(data.method)],
    ['Paid on', data.paidOn],
    ['Received by', data.receivedBy],
  ];

  return (
    <>
      <div style={{ height: '0.45em', background: accent.main, margin: '-1.6em -1.6em 1.4em' }} />
      <div style={{ display: 'flex', gap: '1em', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1.6em' }}>{data.issuerName}</div>
          <Lines text={style.businessDetails} style={{ color: MUTED, fontSize: '0.85em', marginTop: '0.3em' }} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: accent.main, fontWeight: 700, letterSpacing: '0.05em' }}>{data.title}</div>
          <div style={{ fontWeight: 700, fontSize: '1.35em', marginTop: '0.3em' }}>{data.receiptNumber}</div>
          <div style={{ color: MUTED, fontSize: '0.85em', marginTop: '0.2em' }}>Issued {data.date}</div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${accent.grid}`, margin: '1.2em 0' }} />
      <div style={{ color: MUTED, fontSize: '0.75em', fontWeight: 700, letterSpacing: '0.06em' }}>RECEIVED FROM</div>
      <div style={{ fontWeight: 700, fontSize: '1.3em', marginTop: '0.3em' }}>{data.receivedFrom || '-'}</div>
      {data.forRentAt ? <div style={{ color: MUTED, marginTop: '0.2em' }}>{data.forRentAt}</div> : null}
      <div style={{ background: accent.soft, padding: '1em 1.2em', margin: '1.3em 0' }}>
        <div style={{ color: accent.main, fontSize: '0.75em', fontWeight: 700, letterSpacing: '0.06em' }}>AMOUNT RECEIVED</div>
        <div style={{ fontWeight: 700, fontSize: '2.1em', margin: '0.15em 0' }}>{data.amountText}</div>
        <div style={{ color: MUTED, fontSize: '0.85em' }}>{data.amountInWords}</div>
      </div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1em', borderBottom: `1px solid ${accent.grid}`, padding: '0.55em 0' }}>
          <span style={{ color: MUTED }}>{label}</span>
          <span style={{ textAlign: 'right' }}>{value || '-'}</span>
        </div>
      ))}
      {data.notes ? (
        <div style={{ marginTop: '1em' }}>
          <div style={{ color: MUTED, fontSize: '0.75em', fontWeight: 700, letterSpacing: '0.06em' }}>NOTES</div>
          <div style={{ marginTop: '0.3em' }}>{data.notes}</div>
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2.4em' }}>
        <div style={{ width: '40%', borderTop: `1px solid ${MUTED}`, textAlign: 'right', color: MUTED, fontSize: '0.75em', paddingTop: '0.3em' }}>Signature</div>
      </div>
      <Lines text={style.footerText} style={{ marginTop: '1.4em', color: MUTED, fontSize: '0.8em' }} />
    </>
  );
};

// ------------------------------------------------------------- compact

const Compact = ({ data, style }: { data: ReceiptViewData; style: ReceiptStyle }) => {
  const accent = ACCENTS[style.accent];
  const pairs: Array<[string, string, boolean?]> = [
    ['Received from', data.receivedFrom],
    ['Amount', data.amountText, true],
    ['For rent at', data.forRentAt],
    data.periodFrom || data.periodTo ? ['Period', `${data.periodFrom} – ${data.periodTo}`] : ['Being payment of', data.purpose],
    ['Paid by', methodLabel(data.method)],
    ['Paid on', data.paidOn],
    ['Received by', data.receivedBy],
    ['Notes', data.notes],
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', background: accent.main, color: '#fff', fontWeight: 700, padding: '0.55em 0.8em' }}>
        <span style={{ fontSize: '1.15em' }}>{data.title}</span>
        <span>No. {data.receiptNumber}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.9em' }}>
        <span style={{ fontWeight: 700, fontSize: '1.1em' }}>{data.issuerName}</span>
        <span style={{ color: MUTED, fontSize: '0.85em' }}>{data.date}</span>
      </div>
      <Lines text={style.businessDetails} style={{ color: MUTED, fontSize: '0.75em', marginTop: '0.15em' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8em 1.4em', marginTop: '1em' }}>
        {pairs.map(([label, value, strong]) => (
          <div key={label}>
            <div style={{ color: MUTED, fontSize: '0.65em', fontWeight: 700, letterSpacing: '0.06em' }}>{label.toUpperCase()}</div>
            <div style={{ fontWeight: strong ? 700 : 400, fontSize: strong ? '1.25em' : '1em', marginTop: '0.15em' }}>{value || '-'}</div>
          </div>
        ))}
      </div>
      <div style={{ color: MUTED, fontSize: '0.8em', marginTop: '0.9em' }}>{data.amountInWords}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1em', marginTop: '1.4em' }}>
        <Lines text={style.footerText} style={{ flex: 1, color: MUTED, fontSize: '0.7em' }} />
        <div style={{ width: '35%', borderTop: `1px solid ${MUTED}`, textAlign: 'right', color: MUTED, fontSize: '0.7em', paddingTop: '0.3em' }}>Signature</div>
      </div>
    </>
  );
};

export const ReceiptView = ({ data, scale = 1 }: { data: ReceiptViewData; scale?: number }) => {
  const style = data.style ?? DEFAULT_STYLE;

  if (data.template && data.facts) {
    return (
      <div style={{ fontSize: 11 * scale, width: `${100 * Math.max(scale, 1)}%` }}>
        <TemplatePreview
          template={data.template}
          context={receiptContext({ ...data.facts, watermark: data.watermark ?? null }, data.template.language, data)}
        />
      </div>
    );
  }

  return (
    <Paper scale={scale} watermark={data.watermark} compact={style.template === 'COMPACT'}>
      {style.template === 'MODERN' ? (
        <Modern data={data} style={style} />
      ) : style.template === 'COMPACT' ? (
        <Compact data={data} style={style} />
      ) : (
        <Classic data={data} style={style} />
      )}
    </Paper>
  );
};
