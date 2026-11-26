import { type CSSProperties, useState } from 'react';

import { readPickedFile } from 'src/front-components/shared/pick-file';
import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { L } from 'src/front-components/shared/stock-i18n';
import { c, Chip, control, Field, input, primary, qty, rm, select, shortDate, small } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import type { ImportRow } from 'src/shared/stock-import';

// Import products and starting stock from a monthly 订货单 workbook: pick
// the file, check the preview, choose how to start, import.

type PreviewRow = ImportRow & { closingUnits: number; status: 'NEW' | 'CHANGED' | 'SAME'; changes: string[]; hasRecords: boolean };
type Preview = {
  sheet: { name: string; sheetDate: string | null; takeDates: string[]; inDates: string[]; warnings: string[]; balanceDiffers: string[] };
  dates: { opening: string; closing: string };
  rows: PreviewRow[];
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
      setError(result.message ?? L('Could not read that file.', 'Fail itu tidak dapat dibaca.'));

      return;
    }
    setPreview({ sheet: result.sheet, dates: result.dates, rows: result.rows });
    setOpeningDate(result.dates.opening);
    setClosingDate(result.dates.closing);
  };

  const pick = async (event: unknown) => {
    const picked = await readPickedFile(event);

    if (!picked) return;
    if (!/\.xlsx$/i.test(picked.name)) {
      setError(L('Choose an Excel .xlsx file (in Excel: File › Save As › Excel Workbook).', 'Pilih fail Excel .xlsx (dalam Excel: File › Save As › Excel Workbook).'));

      return;
    }
    setFile(picked);
    await load(picked, ownerId);
  };

  const rows = preview?.rows ?? [];
  const counts = { NEW: rows.filter((r) => r.status === 'NEW').length, CHANGED: rows.filter((r) => r.status === 'CHANGED').length, SAME: rows.filter((r) => r.status === 'SAME').length };
  const withRecords = rows.filter((r) => r.hasRecords).length;
  const belowZero = rows.filter((r) => r.closingUnits < 0);
  const takeDates = preview?.sheet.takeDates ?? [];
  const inDates = preview?.sheet.inDates ?? [];
  const differs = preview?.sheet.balanceDiffers ?? [];
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
        <span style={{ fontSize: 16, fontWeight: 600 }}>{L('Import from Excel', 'Import dari Excel')}</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          {L(
            "Start a business's stock from your monthly 订货单 sheet: products, prices, item/ctn, expiry and the stock in hand. After this, only key in purchases, take-outs and wastage. Nothing is saved until you press Import.",
            'Mulakan stok perniagaan daripada lembaran bulanan 订货单 anda: produk, harga, unit sekarton, tarikh luput dan stok di tangan. Selepas ini, hanya masukkan belian, keluaran dan barang rosak. Tiada apa disimpan sehingga anda tekan butang Import.',
          )}
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {owners.length > 1 ? (
          <Field label={L('Workspace', 'Perniagaan')}>
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
          ) : null}
          <Field label={L('Excel file (.xlsx)', 'Fail Excel (.xlsx)')} hint={file ? `${file.name}` : L('The monthly stock workbook, e.g. MONTHLY STOCK.xlsx', 'Fail stok bulanan, cth. MONTHLY STOCK.xlsx')}>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} style={{ ...input, paddingTop: 6 }} />
          </Field>
        </div>

        {busy && !preview ? <span style={{ fontSize: 13, color: c.text3 }}>{L('Reading the file…', 'Sedang membaca fail…')}</span> : null}
        {error ? <span style={{ fontSize: 13, color: 'var(--t-color-red11)' }}>{error}</span> : null}

        {preview ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
              <span>
                {L('Sheet', 'Lembaran')} <b>{preview.sheet.name}</b>
                {preview.sheet.sheetDate ? ` · ${L('dated', 'bertarikh')} ${shortDate(preview.sheet.sheetDate)}` : ''} · <b>{rows.length}</b> {L('products', 'produk')}
              </span>
              {counts.NEW ? <Chip label={`${counts.NEW} ${L('new', 'baru')}`} color="green" /> : null}
              {counts.CHANGED ? <Chip label={`${counts.CHANGED} ${L('changed', 'berubah')}`} color="orange" /> : null}
              {counts.SAME ? <Chip label={`${counts.SAME} ${L('already here', 'sudah ada')}`} color="gray" /> : null}
              {inDates.length ? <span style={{ color: c.text3 }}>{L('Delivery dates:', 'Tarikh barang masuk:')} {inDates.map(shortDate).join(', ')}</span> : null}
              {takeDates.length ? <span style={{ color: c.text3 }}>{L('Take-out dates:', 'Tarikh keluaran:')} {takeDates.map(shortDate).join(', ')}</span> : null}
            </div>
            {[
              ...preview.sheet.warnings,
              ...(withRecords ? [L(`${withRecords} product${withRecords === 1 ? '' : 's'} already have stock records here: their stock is left as is (use Count to correct it).`, `${withRecords} produk sudah ada rekod stok di sini: stoknya tidak diubah (guna Kira stok untuk betulkan).`)] : []),
              ...(differs.length
                ? [L(`${differs.length} product${differs.length === 1 ? '' : 's'} have a balance that isn't opening + in − out (waste, lending or count differences the sheet doesn't list): ${differs.slice(0, 5).join(', ')}${differs.length > 5 ? '…' : ''}. One adjustment line each makes them end on the sheet's balance.`, `${differs.length} produk mempunyai baki yang tidak sama dengan stok awal + masuk − keluar (barang rosak, pinjaman atau beza kiraan yang tiada dalam lembaran): ${differs.slice(0, 5).join(', ')}${differs.length > 5 ? '…' : ''}. Satu baris pelarasan bagi setiap produk menjadikan bakinya sama dengan lembaran.`)]
                : []),
              ...(belowZero.length
                ? [L(`${belowZero.length} product${belowZero.length === 1 ? '' : 's'} end below zero in the sheet (more taken out than in hand): ${belowZero.slice(0, 5).map((r) => r.code).join(', ')}${belowZero.length > 5 ? '…' : ''}. Check them after importing.`, `${belowZero.length} produk berakhir bawah sifar dalam lembaran (keluar lebih daripada yang ada): ${belowZero.slice(0, 5).map((r) => r.code).join(', ')}${belowZero.length > 5 ? '…' : ''}. Semak selepas import.`)]
                : []),
            ].map((w) => (
              <div key={w} style={{ fontSize: 12, padding: '8px 10px', borderRadius: c.radius, background: 'var(--t-color-amber2)', color: 'var(--t-color-amber11)', border: '1px solid var(--t-color-amber6)' }}>
                {w}
              </div>
            ))}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg2 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{L('How to start', 'Cara mula')}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    ['month', L('Whole month (opening + this month’s IN / OUT)', 'Sebulan penuh (stok awal + masuk / keluar bulan ini)')],
                    ['closing', L('Closing balance only', 'Baki akhir sahaja')],
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
                    {L("Opening = 数量 Quantity × item/ctn on the opening date; the month's order and each dated take-out are recorded as IN and OUT, so the month shows like the sheet.", 'Stok awal = 数量 Kuantiti × unit sekarton pada tarikh mula; pesanan bulan itu dan setiap keluaran bertarikh direkodkan sebagai masuk dan keluar, supaya bulan itu sama seperti lembaran.')}
                  </span>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <Field label={L('Opening date', 'Tarikh mula')}>
                      <input type="date" value={openingDate} onChange={(e) => setOpeningDate(readValue(e))} style={{ ...input, width: 170 }} />
                    </Field>
                    <Toggle on={includeOrder} onClick={() => setIncludeOrder(!includeOrder)} label={inDates.length ? L(`Add the ${inDates.length} dated deliveries`, `Tambah ${inDates.length} barang masuk bertarikh`) : L("Add this month's order as a purchase", 'Tambah pesanan bulan ini sebagai belian')} off={L('Purchases left out', 'Belian tidak dimasukkan')} />
                    <Toggle on={includeTakes} onClick={() => setIncludeTakes(!includeTakes)} label={L(`Add the ${takeDates.length} dated take-outs`, `Tambah ${takeDates.length} keluaran bertarikh`)} off={L('Take-outs left out', 'Keluaran tidak dimasukkan')} />
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: c.text3 }}>{L("One opening line per product: the sheet's balance (its Balance column, or opening + in − out). Below zero counts as none.", 'Satu baris stok awal bagi setiap produk: baki dalam lembaran (lajur Balance, atau stok awal + masuk − keluar). Bawah sifar dikira tiada.')}</span>
                  <Field label={L('Balance on', 'Baki pada')}>
                    <input type="date" value={closingDate} onChange={(e) => setClosingDate(readValue(e))} style={{ ...input, width: 170 }} />
                  </Field>
                </>
              )}
              {counts.CHANGED ? <Toggle on={updateDetails} onClick={() => setUpdateDetails(!updateDetails)} label={L('Update name, spec and price of existing products', 'Kemas kini nama, spesifikasi dan harga produk sedia ada')} off={L('Existing products left unchanged', 'Produk sedia ada tidak diubah')} /> : null}
            </div>

            <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, maxHeight: '46cqh', minHeight: 200 }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...head, textAlign: 'left' }}>{L('Code', 'Kod')}</th>
                    <th style={{ ...head, textAlign: 'left' }}>{L('Status', 'Status')}</th>
                    <th style={{ ...head, textAlign: 'left' }}>{L('Product', 'Produk')}</th>
                    <th style={{ ...head, textAlign: 'right' }}>{L('Item/ctn', 'Unit/karton')}</th>
                    <th style={{ ...head, textAlign: 'right' }}>{L('Price/ctn', 'Harga/karton')}</th>
                    <th style={{ ...head, textAlign: 'right' }}>{L('Opening', 'Stok awal')}</th>
                    <th style={{ ...head, textAlign: 'right' }}>{L('In', 'Masuk')}</th>
                    <th style={{ ...head, textAlign: 'right' }}>{L('Out', 'Keluar')}</th>
                    <th style={{ ...head, textAlign: 'right' }}>{L('Closing', 'Stok akhir')}</th>
                    <th style={{ ...head, textAlign: 'left' }}>{L('Expiry', 'Luput')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code}>
                      <td style={{ ...cell, color: c.text3 }}>{r.code}</td>
                      <td style={cell} title={r.changes.join(', ')}>
                        {r.status === 'NEW' ? <Chip label={L('New', 'Baru')} color="green" /> : r.status === 'CHANGED' ? <Chip label={L('Update', 'Kemas kini')} color="orange" /> : <Chip label={L('Already here', 'Sudah ada')} color="gray" />}
                        {r.hasRecords ? <span style={{ fontSize: 11, color: c.text3 }} title={L('Has stock records: its stock is left as is', 'Ada rekod stok: stoknya tidak diubah')}> · {L('has stock', 'ada stok')}</span> : null}
                      </td>
                      <td style={{ ...cell, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${r.name} · ${r.specification}`}>
                        {r.name}
                      </td>
                      <td style={right}>
                        {qty(r.unitsPerCarton)} {r.unit}
                      </td>
                      <td style={right}>{rm(r.cartonPrice).replace('RM ', '')}</td>
                      <td style={right}>{value(r, r.openingUnits)}</td>
                      <td style={{ ...right, color: 'var(--t-color-green11)' }} title={r.ins.map((d) => `${shortDate(d.date)}: ${qty(d.units)}`).join('\n')}>
                        {r.orderUnits + r.ins.reduce((s, d) => s + d.units, 0) ? `+${value(r, r.orderUnits + r.ins.reduce((s, d) => s + d.units, 0))}` : ''}
                      </td>
                      <td style={{ ...right, color: 'var(--t-color-blue11)' }} title={r.takes.map((t) => `${shortDate(t.date)}: ${qty(t.units)}`).join('\n')}>
                        {r.takes.length ? `−${value(r, r.takes.reduce((s, t) => s + t.units, 0))}` : ''}
                      </td>
                      <td style={{ ...right, fontWeight: 600, color: r.closingUnits < 0 ? 'var(--t-color-red11)' : c.text }}>{qty(r.closingUnits)}</td>
                      <td style={{ ...cell, color: c.text2 }}>{r.expiryDate ? shortDate(r.expiryDate) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button onClick={onClose} style={control}>
            {L('Cancel', 'Batal')}
          </button>
          <button onClick={save} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
            {busy && preview ? L('Importing…', 'Sedang import…') : L(`Import ${rows.length || ''} products`, `Import ${rows.length || ''} produk`)}
          </button>
        </div>
      </div>
    </Sheet>
  );
};
