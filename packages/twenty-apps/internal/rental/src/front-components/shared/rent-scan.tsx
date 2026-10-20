import { useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { filesFromEvent, type PickedFile } from 'src/front-components/shared/file-drop';
import { readValue } from 'src/front-components/shared/read-value';
import { scanFile } from 'src/front-components/shared/scan-photo';
import { MONTHS } from 'src/shared/months';
import { type OpenMonth, type RentMatch, scoreMonths, sameName, type TransferScan } from 'src/shared/rent-match';

// Scan a tenant's bank transfer receipt on the Rent Ledger: Claude reads it, plain
// code finds the tenant and month it pays, and one tap opens that month's payment
// form filled in. Only a "Successful" transfer can be recorded.

export type RentPrefill = { amount: number | null; paidOn: string | null; method: string; notes: string; scanRef: string; payerName: string | null; file: PickedFile };

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  border: 'var(--t-border-color-medium)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  blue: 'var(--t-color-blue9)',
};
const tone = (t: 'green' | 'amber' | 'red') => ({ background: `var(--t-color-${t}2)`, color: `var(--t-color-${t}11)`, borderRadius: 10, padding: '8px 12px', fontSize: 13 });
const btn = (primary = false) => ({
  fontFamily: c.font,
  fontSize: 14,
  fontWeight: 600,
  minHeight: 42,
  padding: '0 14px',
  borderRadius: 10,
  cursor: 'pointer',
  border: `1px solid ${primary ? c.blue : c.border}`,
  background: primary ? c.blue : c.bg,
  color: primary ? 'white' : c.text,
});
const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const WHY: Record<string, string> = { payer: 'payer name', amount: 'exact amount', part: 'part payment', more: 'more than owed', note: 'unit / name in the note', month: 'month in the note', date: 'paid near the due day' };

type Result = { transfer: TransferScan; hash: string; duplicate?: { name: string; date: string } };

export const RentScan = ({ openMonths, onRecord, onClose }: { openMonths: OpenMonth[]; onRecord: (month: OpenMonth, prefill: RentPrefill) => void; onClose: () => void }) => {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [other, setOther] = useState('');

  const scan = async (files: PickedFile[]) => {
    const picked = files[0];

    if (!picked || busy) return;
    setBusy(true);
    setProblem('');
    setResult(null);
    const response = await scanFile<{ success: boolean; message?: string; transfer?: TransferScan; hash?: string; duplicate?: { name: string; date: string } }>(picked, { kind: 'transfer' });

    setBusy(false);
    if (!response.success || !response.transfer) {
      setProblem(response.message ?? 'Could not read it. Record the payment by hand.');

      return;
    }
    if (!response.transfer.isTransfer) {
      setProblem('This does not look like a bank transfer receipt. Snap the transfer confirmation screen, or record by hand.');

      return;
    }
    setFile(picked);
    setResult({ transfer: response.transfer, hash: response.hash ?? '', duplicate: response.duplicate });
  };

  const t = result?.transfer;
  const matches: RentMatch[] = t ? scoreMonths(t, openMonths) : [];
  const best = matches[0] && matches[0].score >= 50 ? matches[0] : null;
  const alternatives = matches.slice(best ? 1 : 0).filter((m) => m.score >= 50).slice(0, best ? 2 : 3);
  const canRecord = !!t && t.status === 'SUCCESSFUL' && !result?.duplicate;

  const record = (m: OpenMonth) => {
    if (!t || !file || !result) return;
    // The notes are printed on the receipt: keep them short and plain.
    const details = `${t.bank ? `${t.bank} transfer` : 'Bank transfer'}${t.payerName ? ` from ${t.payerName}` : ''}`;

    onRecord(m, {
      amount: t.amount,
      paidOn: t.date,
      method: /duitnow/i.test(`${t.bank ?? ''} ${t.note ?? ''}`) ? 'DUITNOW' : 'BANK_TRANSFER',
      notes: details,
      // ref: and scan: let the next scan of the same transfer be caught (not printed).
      scanRef: [t.referenceNo ? `ref:${t.referenceNo.trim()}` : '', result.hash ? `scan:${result.hash}` : ''].filter(Boolean).join(' '),
      payerName: t.payerName && !sameName(t.payerName, m.tenantName) ? t.payerName : null,
      file,
    });
  };

  const label = (m: RentMatch) => `${monthName(m.month)} rent · ${m.propertyName} · ${m.tenantName}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, fontFamily: c.font, color: c.text, height: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 650 }}>Scan a bank receipt</span>
        <button onClick={onClose} style={{ ...btn(), minHeight: 34 }}>
          Close
        </button>
      </div>
      <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: busy ? c.bg2 : 'var(--t-color-blue3)', color: 'var(--t-color-blue11)', border: `1px solid ${c.border}`, cursor: busy ? 'default' : 'pointer' }}>
        <span style={{ fontSize: 30, lineHeight: 1 }}>{busy ? '⏳' : '📷'}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{busy ? 'Reading the receipt…' : result ? 'Scan another' : 'Snap or pick the transfer receipt'}</span>
          <span style={{ fontSize: 12.5, color: c.text2 }}>{busy ? 'Takes a few seconds. Keep this page open.' : 'Screenshot from the tenant (Maybank, CIMB, DuitNow…) or a PDF'}</span>
        </span>
        {!busy && <input type="file" accept="image/*,application/pdf" onChange={(event) => scan(filesFromEvent(event))} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }} />}
      </label>
      {problem && <div style={tone('red')}>{problem}</div>}

      {t && (
        <>
          {result?.duplicate ? (
            <div style={tone('red')}>
              Already recorded: “{result.duplicate.name}”{result.duplicate.date ? ` (paid ${result.duplicate.date})` : ''}. The same transfer cannot be recorded twice.
            </div>
          ) : t.status === 'SUCCESSFUL' ? (
            <div style={tone('green')}>✓ The bank says the transfer was successful.</div>
          ) : t.status === 'PENDING' ? (
            <div style={tone('red')}>The bank says this transfer is still pending. Wait until it goes through (or check your bank) before recording it as paid.</div>
          ) : t.status === 'FAILED' ? (
            <div style={tone('red')}>The bank says this transfer failed. It was not paid.</div>
          ) : (
            <div style={tone('amber')}>Could not see whether this transfer went through. Check your bank before recording it.</div>
          )}
          {t.warning && <div style={tone('amber')}>Check: {t.warning}</div>}

          <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 12, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 13.5 }}>
            <span style={{ color: c.text3 }}>Amount</span>
            <b>{t.amount !== null ? rm(t.amount) : '—'}</b>
            <span style={{ color: c.text3 }}>Date</span>
            <span>{t.date ?? '—'}</span>
            <span style={{ color: c.text3 }}>From</span>
            <span>
              {t.payerName ?? '—'}
              {t.payerAccountLast4 ? ` (…${t.payerAccountLast4})` : ''}
              {t.bank ? ` · ${t.bank}` : ''}
            </span>
            <span style={{ color: c.text3 }}>Note</span>
            <span>{t.note ?? '—'}</span>
            <span style={{ color: c.text3 }}>Reference</span>
            <span>{t.referenceNo ?? '—'}</span>
          </div>

          {best ? (
            <div style={{ border: `2px solid ${c.blue}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, color: c.text3 }}>Looks like</span>
              <span style={{ fontSize: 15, fontWeight: 650 }}>{label(best)}</span>
              <span style={{ fontSize: 12.5, color: c.text2 }}>
                {best.owed ? `${rm(best.owed)} owed` : ''} · matched on {best.why.map((w) => WHY[w] ?? w).join(', ')}
              </span>
              <button onClick={() => record(best)} disabled={!canRecord} style={{ ...btn(true), opacity: canRecord ? 1 : 0.5 }}>
                Record this payment
              </button>
            </div>
          ) : (
            <div style={tone('amber')}>Could not tell whose rent this is. Pick the tenant and month below.</div>
          )}

          {alternatives.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: c.text3 }}>{best ? 'Or maybe' : 'Closest'}</span>
              {alternatives.map((m) => (
                <button key={`${m.rentalId}|${m.month}`} onClick={() => record(m)} disabled={!canRecord} style={{ ...btn(), textAlign: 'left', fontWeight: 500, opacity: canRecord ? 1 : 0.5 }}>
                  {label(m)}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: c.text3 }}>Someone else</span>
            <select value={other} onChange={(e) => setOther(readValue(e))} style={{ ...btn(), fontWeight: 400 }}>
              <option value="">Pick tenant and month…</option>
              {openMonths.map((m) => (
                <option key={`${m.rentalId}|${m.month}`} value={`${m.rentalId}|${m.month}`}>
                  {m.tenantName} · {m.propertyName} · {monthName(m.month)}
                </option>
              ))}
            </select>
            {other && (
              <button
                onClick={() => {
                  const m = openMonths.find((x) => `${x.rentalId}|${x.month}` === other);

                  if (m) record(m);
                }}
                disabled={!canRecord}
                style={{ ...btn(true), opacity: canRecord ? 1 : 0.5 }}
              >
                Record for this one
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// After the payment is saved: remember who paid, so the next one matches by name.
export const rememberPayer = async (rentalId: string, name: string) => {
  try {
    await new RestApiClient().post('/s/scan', { action: 'rememberPayer', rentalId, name });
  } catch {
    // Nice to have: matching still works on amount and note.
  }
};
