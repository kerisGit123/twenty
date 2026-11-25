import { type CSSProperties, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { readValue } from 'src/front-components/shared/read-value';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { LastsBar } from 'src/front-components/shared/stock-hand-tab';
import { c, control, ExcelButton, input, monthLabel, primary, qty, rm, small, withOwner } from 'src/front-components/shared/stock-ui';
import { L, tr } from 'src/front-components/shared/stock-i18n';
import { cartonsAndUnits, type StockStatus, unitValue } from 'src/shared/stock';

// Forecast & order: what each item will need next month, which ones fall
// below the re-order level, and the order per supplier in whole cartons.

const cell: CSSProperties = { fontSize: 13, padding: '7px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2, position: 'sticky', top: 0, zIndex: 1 };
const ORDER_BG = 'var(--t-color-blue2)';

export const OrderTab = ({
  statuses,
  ruleText,
  ownerId,
  onEditRule,
  onOrder,
  onSaved,
}: {
  statuses: StockStatus[];
  ruleText: string;
  ownerId: string;
  onEditRule: (() => void) | null;
  onOrder: (lines: Array<{ itemId: string; units: number }>) => void;
  onSaved: () => void;
}) => {
  const [showAll, setShowAll] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const active = statuses.filter((s) => s.item.status !== 'DISCONTINUED');
  const cartons = (s: StockStatus) => (edits[s.item.id] !== undefined ? Number(edits[s.item.id].replace(/[^0-9.]/g, '')) || 0 : s.suggestedCartons);
  const rows = active.filter((s) => showAll || s.flag === 'ORDER' || s.flag === 'ON_ORDER' || s.flag === 'LOW' || cartons(s) > 0);
  const [saving, setSaving] = useState(false);

  // The plan becomes draft orders (one per supplier); they count as on order.
  const saveOrder = async () => {
    setSaving(true);
    const result = await stockAction({ action: 'saveOrder', lines: ordered.map((s) => ({ itemId: s.item.id, cartons: cartons(s) })) });

    setSaving(false);
    if (result.success) {
      setEdits({});
      onSaved();
    }
  };
  const ordered = active.filter((s) => cartons(s) > 0);
  const total = ordered.reduce((sum, s) => sum + cartons(s) * s.item.cartonPrice, 0);
  const totalCartons = ordered.reduce((sum, s) => sum + cartons(s), 0);
  const nextMonthCost = active.reduce((sum, s) => sum + s.forecast * unitValue(s.item), 0);
  const changed = Object.keys(edits).length > 0;
  const csv = new RestApiClient().resolveUrl('/s/stock/csv', { query: { kind: 'order', ...(ownerId ? { owner: ownerId } : {}) } });

  // One block per supplier: that's one purchase order each.
  const suppliers = [...new Set(rows.map((s) => s.item.supplier || 'No supplier'))].sort((a, b) => (a === 'No supplier' ? 1 : b === 'No supplier' ? -1 : a.localeCompare(b)));
  const blocks = suppliers.map((name) => ({ name, rows: rows.filter((s) => (s.item.supplier || 'No supplier') === name) }));

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: c.text2 }}>{ruleText}</span>
        {onEditRule ? (
          <button onClick={onEditRule} style={small}>
            {tr('Change rule')}
          </button>
        ) : null}
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowAll(!showAll)} style={{ ...control, fontWeight: showAll ? 600 : 400, borderColor: showAll ? c.accent : c.border2 }}>
          {showAll ? tr('✓ All items') : tr('Show all items')}
        </button>
        {changed ? (
          <button onClick={() => setEdits({})} style={control} title={tr('Back to the suggested cartons')}>
            {tr('Reset')}
          </button>
        ) : null}
        <ExcelButton
          query={withOwner({ kind: 'xlsx-order', orders: Object.keys(edits).map((id) => `${id}:${Number(edits[id].replace(/[^0-9.]/g, '')) || 0}`).join(',') }, ownerId)}
          title={tr('The order (your cartons) as a purchase-order Excel file')}
        />
        <a href={csv} target="_blank" rel="noreferrer" style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          ⬇ CSV
        </a>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13, color: c.text2 }}>
        <span>
          {L('Order', 'Pesan')} <b style={{ color: c.text }}>{ordered.length}</b> {L(`item${ordered.length === 1 ? '' : 's'}`, 'produk')} · <b style={{ color: c.text }}>{totalCartons}</b> ctn ·{' '}
          <b style={{ color: 'var(--t-color-blue11)', fontSize: 16 }}>{rm(total)}</b>
        </span>
        <span>
          {L("Next month's use at cost:", 'Guna bulan depan pada kos:')} <b style={{ color: c.text }}>{rm(nextMonthCost)}</b>
        </span>
      </div>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, maxHeight: 'calc(100cqh - 280px)', minHeight: 220 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left', width: 56 }}>{tr('Code')}</th>
              <th style={{ ...head, textAlign: 'left' }}>{tr('Item')}</th>
              <th style={head}>{tr('In hand')}</th>
              <th style={{ ...head, textAlign: 'left' }}>{tr('Months left')}</th>
              <th style={head}>{tr('Need next month')}</th>
              <th style={head}>{tr('On order')}</th>
              <th style={head}>{tr('Suggested')}</th>
              <th style={{ ...head, background: 'var(--t-color-blue3)', color: 'var(--t-color-blue11)' }}>{tr('Order (ctn)')}</th>
              <th style={head}>{tr('Ctn price')}</th>
              <th style={head}>{tr('Cost')}</th>
            </tr>
          </thead>
          <tbody>
            {blocks.length ? null : (
              <tr>
                <td colSpan={10} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32, whiteSpace: 'normal' }}>
                  {L('Nothing is below the re-order level. Use “Show all items” to order something anyway.', 'Tiada yang di bawah paras tempah semula. Guna “Tunjuk semua produk” untuk memesan juga.')}
                </td>
              </tr>
            )}
            {blocks.map((block) => {
              const blockOrdered = block.rows.filter((s) => cartons(s) > 0);

              return [
                <tr key={`s-${block.name}`}>
                  <td colSpan={10} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600, fontSize: 12 }}>
                    {block.name === 'No supplier' ? tr('No supplier') : block.name}
                    <span style={{ fontWeight: 400, color: c.text3 }}>
                      {' '}
                      · {blockOrdered.length} {L('to order', 'perlu dipesan')} · {blockOrdered.reduce((sum, s) => sum + cartons(s), 0)} ctn ·{' '}
                      {rm(blockOrdered.reduce((sum, s) => sum + cartons(s) * s.item.cartonPrice, 0))}
                    </span>
                  </td>
                </tr>,
                ...block.rows.map((s, index) => {
                  const ctn = cartons(s);
                  const edited = edits[s.item.id] !== undefined && ctn !== s.suggestedCartons;

                  return (
                    <tr key={s.item.id} style={{ background: index % 2 ? 'var(--t-color-gray1)' : c.bg }}>
                      <td style={{ ...cell, color: c.text3, fontSize: 12 }}>{s.item.code}</td>
                      <td style={{ ...cell, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${s.item.name} · ${s.item.specification}`}>
                        <span style={{ fontWeight: 500 }}>{s.item.name}</span>
                        <span style={{ color: c.text3, fontSize: 12 }}> · {s.item.unitsPerCarton} {s.item.unit}/ctn</span>
                      </td>
                      <td style={right}>{s.balance ? cartonsAndUnits(s.balance, s.item) : <span style={{ color: c.text3 }}>{tr('none')}</span>}</td>
                      <td style={cell}>
                        <LastsBar s={s} />
                      </td>
                      <td style={right} title={s.forecastBasis.length ? L(`Average of ${s.forecastBasis.map(monthLabel).join(', ')}`, `Purata ${s.forecastBasis.map(monthLabel).join(', ')}`) : tr('No take-outs recorded yet')}>
                        {s.forecast ? (
                          <>
                            {qty(s.forecast)} <span style={{ color: c.text3, fontSize: 12 }}>{s.item.unit}</span>
                          </>
                        ) : (
                          <span style={{ color: c.text3 }}>—</span>
                        )}
                      </td>
                      <td style={{ ...right, color: s.onOrder ? 'var(--t-color-blue11)' : c.text3, fontWeight: s.onOrder ? 600 : 400 }}>{s.onOrder ? cartonsAndUnits(s.onOrder, s.item) : '—'}</td>
                      <td
                        style={{ ...right, color: c.text3 }}
                        title={
                          s.suggestedCartons
                            ? L(
                                `${qty(s.forecast)} ${s.item.unit} a month × ${s.coverMonths} months = ${qty(s.forecast * s.coverMonths)}; minus ${qty(Math.max(s.balance, 0))} in hand and ${qty(s.onOrder)} on order = ${qty(s.shortUnits)} ${s.item.unit}; ÷ ${s.item.unitsPerCarton} per carton, rounded up = ${s.suggestedCartons} ctn`,
                                `${qty(s.forecast)} ${s.item.unit} sebulan × ${s.coverMonths} bulan = ${qty(s.forecast * s.coverMonths)}; tolak ${qty(Math.max(s.balance, 0))} di tangan dan ${qty(s.onOrder)} dalam pesanan = ${qty(s.shortUnits)} ${s.item.unit}; ÷ ${s.item.unitsPerCarton} per karton, dibundarkan ke atas = ${s.suggestedCartons} ctn`,
                              )
                            : tr('Nothing to suggest: enough in hand or already on order')
                        }
                      >
                        {s.suggestedCartons ? `${s.suggestedCartons} ctn` : '—'}
                      </td>
                      <td style={{ ...right, background: ORDER_BG }}>
                        <input
                          value={edits[s.item.id] ?? (s.suggestedCartons ? String(s.suggestedCartons) : '')}
                          onChange={(e) => setEdits({ ...edits, [s.item.id]: readValue(e) })}
                          inputMode="numeric"
                          placeholder=""
                          style={{ ...input, width: 64, height: 28, textAlign: 'right', fontWeight: 600, borderColor: edited ? 'var(--t-color-blue9)' : c.border2 }}
                        />
                      </td>
                      <td style={{ ...right, color: c.text2 }}>{rm(s.item.cartonPrice)}</td>
                      <td style={{ ...right, fontWeight: ctn ? 600 : 400 }}>{ctn ? rm(ctn * s.item.cartonPrice) : <span style={{ color: c.text3 }}>—</span>}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg2 }}>
        <span style={{ fontSize: 13 }}>
          {L('Order total', 'Jumlah pesanan')} <b style={{ fontSize: 15 }}>{rm(total)}</b> <span style={{ color: c.text3 }}>({totalCartons} ctn)</span>
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => onOrder(ordered.map((s) => ({ itemId: s.item.id, units: cartons(s) * s.item.unitsPerCarton })))}
          disabled={!ordered.length}
          style={{ ...small, height: 34, opacity: ordered.length ? 1 : 0.5 }}
          title={tr('Goods that came without an order: record them straight into stock')}
        >
          {tr('Record as purchase (no order)')}
        </button>
        <button onClick={saveOrder} disabled={!ordered.length || saving} style={{ ...primary, opacity: ordered.length && !saving ? 1 : 0.5 }} title={tr('Save as a draft order per supplier; it then counts as on order')}>
          {saving ? tr('Saving…') : tr('Save as order')}
        </button>
      </div>
      <span style={{ fontSize: 12, color: c.text3 }}>
        {L(
          'Need next month = average of the last 3 months with take-outs. Suggested = next month’s need × the “order enough for” months (set with “Change rule”), minus what is in hand and already on order, rounded up to whole cartons. Example: needs 16 bag a month, rule 2.5 months → 40 bag, none in hand → 40 ÷ 8 per carton = 5 ctn. Hover a suggestion to see its sum. Type your own number to change it, then “Save as order”; receive it on the Orders tab.',
          'Perlu bulan depan = purata 3 bulan terakhir yang ada keluaran. Cadangan = keperluan bulan depan × bulan “pesan cukup untuk” (tetapkan dengan “Tukar peraturan”), tolak yang ada di tangan dan sudah dipesan, dibundarkan ke atas kepada karton penuh. Contoh: perlu 16 beg sebulan, peraturan 2.5 bulan → 40 beg, tiada di tangan → 40 ÷ 8 per karton = 5 ctn. Lalukan tetikus pada cadangan untuk lihat pengiraannya. Taip nombor anda sendiri untuk mengubahnya, kemudian “Simpan sebagai pesanan”; terima barang di tab Pesanan.',
        )}
      </span>
    </>
  );
};
