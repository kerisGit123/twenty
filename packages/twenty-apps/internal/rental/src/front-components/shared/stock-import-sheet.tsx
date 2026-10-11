import { type CSSProperties, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, Chip, control, Field, input, primary, qty, rm, select, shortDate, small } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import type { ImportRow } from 'src/shared/stock-import';

// Import products and starting stock from a monthly 订货单 workbook: pick
// the file, check the preview, choose how to start, import.

type PreviewRow = ImportRow & { closingUnits: number; status: 'NEW' | 'CHANGED' | 'SAME'; changes: string[]; hasRecords: boolean };
type Preview = {
  sheet: { name: string; sheetDate: string | null; takeDates: string[]; warnings: string[] };
  dates: { opening: string; closing: string };
  rows: PreviewRow[];
};
type PickedFile = { name?: string; size?: number; blob?: Blob } & Partial<Blob>;

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

  return btoa(binary);
};

const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const cell: CSSProperties = { fontSize: 12, padding: '6px 8px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, fontSize: 11, fontWeight: 600, color: c.text3, background: c.bg2, position: 'sticky', top: 0 };

const Toggle = ({ on, onClick, label, off }: { on: boolean; onClick: () => void; label: string; off: string }) => (
  <button
    onClick={onClick}
    style={{ ...small, height: 30, fontWeight: 600, color: on ? 'var(--t-color-green11)' : c.text3, borderColor: on ? 'var(--t-color-green9)' : c.border2, justifyContent: 'flex-start' }}
  >
    {on ? `✓ ${label}` : off}
  </button>
);

export const ImportSheet = ({ owners, defaultOwnerId, onClose, onDone }: { owners: StockOwner[]; defaultOwnerId: string; onClose: () => void; onDone: () => void }) => {
  const [ownerId, setOwnerId] = useState(owners.some((o) => o.id === defaultOwnerId) ? defaultOwnerId : (owners[0]?.id ?? ''));
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'month' | 'closing'>('month');
  const [openingDate, setOpeningDate] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [includeOrder, setIncludeOrder] = useState(true);
  const [includeTakes, setIncludeTakes] = useState(true);
  const [updateDetails, setUpdateDetails] = useState(true);

  const load = async (picked: { name: string; base64: string }, owner: string) => {
    setBusy(true);
    setError('');
    setPreview(null);
    const result = (await stockAction({ action: 'importExcel', ownerId: owner, fileBase64: picked.base64 })) as unknown as { success: boolean; message?: string } & Partial<Preview>;

    setBusy(false);
    if (!result.success || !result.rows || !result.sheet || !result.dates) {
      setError(result.message ?? 'Could not read that file.');

      return;
    }
    setPreview({ sheet: result.sheet, dates: result.dates, rows: result.rows });
    setOpeningDate(result.dates.opening);
    setClosingDate(result.dates.closing);
  };

  const pick = async (event: unknown) => {
    const target = (event as { target?: { files?: ArrayLike<PickedFile> } }).target;
    const chosen = target?.files?.[0];
    const blob = chosen?.blob ?? (chosen instanceof Blob ? chosen : null);

    if (!chosen || !blob) return;
    if (!/\.xlsx$/i.test(chosen.name ?? '')) {
      setError('Choose an Excel .xlsx file (in Excel: File › Save As › Excel Workbook).');

      return;
    }
    const picked = { name: chosen.name ?? 'file.xlsx', base64: await toBase64(blob) };

    setFile(picked);
    await load(picked, ownerId);
  };

  const rows = preview?.rows ?? [];
  const counts = { NEW: rows.filter((r) => r.status === 'NEW').length, CHANGED: rows.filter((r) => r.status === 'CHANGED').length, SAME: rows.filter((r) => r.status === 'SAME').length };
  const withRecords = rows.filter((r) => r.hasRecords).length;
  const belowZero = rows.filter((r) => r.closingUnits < 0);
  const takeDates = preview?.sheet.takeDates ?? [];
  const ready = !!preview && rows.length > 0 && (mode === 'month' ? isFullDate(openingDate) : isFullDate(closingDate));
  const value = (r: PreviewRow, units: number) => (units ? `${qty(units)} ${r.unit}` : '');

  const save = async () => {
    if (!file || !ready) return;
    setBusy(true);
    const result = await stockAction({ action: 'importExcel', apply: true, ownerId, fileBase64: file.base64, mode, openingDate, closingDate, includeOrder, includeTakes, updateDetails });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Sheet width={980} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Import from Excel</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          Start a workspace&apos;s stock from your monthly 订货单 sheet: products, prices, item/ctn, expiry and the stock in hand. After this, only key in purchases, take-outs and
          wastage. Nothing is saved until you press Import.
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <Field label="Workspace">
            <select
              value={ownerId}
              onChange={(e) => {
                const next = readValue(e);

                setOwnerId(next);
                if (file) load(file, next);
              }}
              style={select}
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Excel file (.xlsx)" hint={file ? `${file.name}` : 'The monthly stock workbook, e.g. MONTHLY STOCK.xlsx'}>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} style={{ ...input, paddingTop: 6 }} />
          </Field>
        </div>

        {busy && !preview ? <span style={{ fontSize: 13, color: c.text3 }}>Reading the file…</span> : null}
        {error ? <span style={{ fontSize: 13, color: 'var(--t-color-red11)' }}>{error}</span> : null}

        {preview ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
              <span>
                Sheet <b>{preview.sheet.name}</b>
                {preview.sheet.sheetDate ? ` · dated ${shortDate(preview.sheet.sheetDate)}` : ''} · <b>{rows.length}</b> products
              </span>
              {counts.NEW ? <Chip label={`${counts.NEW} new`} color="green" /> : null}
              {counts.CHANGED ? <Chip label={`${counts.CHANGED} changed`} color="orange" /> : null}
              {counts.SAME ? <Chip label={`${counts.SAME} already here`} color="gray" /> : null}
              {takeDates.length ? <span style={{ color: c.text3 }}>Take-out dates: {takeDates.map(shortDate).join(', ')}</span> : null}
            </div>
            {[
              ...preview.sheet.warnings,
              ...(withRecords ? [`${withRecords} product${withRecords === 1 ? '' : 's'} already have stock records here: their stock is left as is (use Stock take to correct it).`] : []),
              ...(belowZero.length
                ? [`${belowZero.length} product${belowZero.length === 1 ? '' : 's'} end below zero in the sheet (more taken out than in hand): ${belowZero.slice(0, 5).map((r) => r.code).join(', ')}${belowZero.length > 5 ? '…' : ''}. Check them after importing.`]
                : []),
            ].map((w) => (
              <div key={w} style={{ fontSize: 12, padding: '8px 10px', borderRadius: c.radius, background: 'var(--t-color-amber2)', color: 'var(--t-color-amber11)', border: '1px solid var(--t-color-amber6)' }}>
                {w}
              </div>
            ))}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg2 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>How to start</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    ['month', 'Whole month (opening + this month’s IN / OUT)'],
                    ['closing', 'Closing balance only'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    style={{ ...control, fontWeight: mode === value ? 600 : 400, background: mode === value ? 'var(--t-color-blue2)' : c.bg, color: mode === value ? 'var(--t-color-blue11)' : c.text }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'month' ? (
                <>
                  <span style={{ fontSize: 12, color: c.text3 }}>
                    Opening = 数量 Quantity × item/ctn on the opening date; the month&apos;s order and each dated take-out are recorded as IN and OUT, so the month shows like the sheet.
                  </span>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <Field label="Opening date">
                      <input type="date" value={openingDate} onChange={(e) => setOpeningDate(readValue(e))} style={{ ...input, width: 170 }} />
                    </Field>
                    <Toggle on={includeOrder} onClick={() => setIncludeOrder(!includeOrder)} label="Add this month's order as a purchase" off="This month's order left out" />
                    <Toggle on={includeTakes} onClick={() => setIncludeTakes(!includeTakes)} label={`Add the ${takeDates.length} dated take-outs`} off="Take-outs left out" />
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: c.text3 }}>One opening line per product: the sheet&apos;s balance (opening + order − take-outs). Below zero counts as none.</span>
                  <Field label="Balance on">
                    <input type="date" value={closingDate} onChange={(e) => setClosingDate(readValue(e))} style={{ ...input, width: 170 }} />
                  </Field>
                </>
              )}
              {counts.CHANGED ? <Toggle on={updateDetails} onClick={() => setUpdateDetails(!updateDetails)} label="Update name, spec and price of existing products" off="Existing products left unchanged" /> : null}
            </div>

            <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, maxHeight: '46cqh', minHeight: 200 }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...head, textAlign: 'left' }}>Code</th>
                    <th style={{ ...head, textAlign: 'left' }}>Product</th>
                    <th style={{ ...head, textAlign: 'right' }}>Item/ctn</th>
                    <th style={{ ...head, textAlign: 'right' }}>Price/ctn</th>
                    <th style={{ ...head, textAlign: 'right' }}>Opening</th>
                    <th style={{ ...head, textAlign: 'right' }}>Order</th>
                    <th style={{ ...head, textAlign: 'right' }}>Out</th>
                    <th style={{ ...head, textAlign: 'right' }}>Closing</th>
                    <th style={{ ...head, textAlign: 'left' }}>Expiry</th>
                    <th style={{ ...head, textAlign: 'left' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code}>
                      <td style={{ ...cell, color: c.text3 }}>{r.code}</td>
                      <td style={{ ...cell, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${r.name} · ${r.specification}`}>
                        {r.name}
                      </td>
                      <td style={right}>
                        {qty(r.unitsPerCarton)} {r.unit}
                      </td>
                      <td style={right}>{rm(r.cartonPrice).replace('RM ', '')}</td>
                      <td style={right}>{value(r, r.openingUnits)}</td>
                      <td style={{ ...right, color: 'var(--t-color-green11)' }}>{r.orderUnits ? `+${value(r, r.orderUnits)}` : ''}</td>
                      <td style={{ ...right, color: 'var(--t-color-blue11)' }} title={r.takes.map((t) => `${shortDate(t.date)}: ${qty(t.units)}`).join('\n')}>
                        {r.takes.length ? `−${value(r, r.takes.reduce((s, t) => s + t.units, 0))}` : ''}
                      </td>
                      <td style={{ ...right, fontWeight: 600, color: r.closingUnits < 0 ? 'var(--t-color-red11)' : c.text }}>{qty(r.closingUnits)}</td>
                      <td style={{ ...cell, color: c.text2 }}>{r.expiryDate ? shortDate(r.expiryDate) : ''}</td>
                      <td style={cell} title={r.changes.join(', ')}>
                        {r.status === 'NEW' ? <Chip label="New" color="green" /> : r.status === 'CHANGED' ? <Chip label={`Update: ${r.changes.join(', ')}`} color="orange" /> : <Chip label="Already here" color="gray" />}
                        {r.hasRecords ? <span style={{ fontSize: 11, color: c.text3 }}> · has records</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button onClick={onClose} style={control}>
            Cancel
          </button>
          <button onClick={save} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
            {busy && preview ? 'Importing…' : `Import ${rows.length || ''} products`}
          </button>
        </div>
      </div>
    </Sheet>
  );
};
