import { type CSSProperties, useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { L } from 'src/front-components/shared/stock-i18n';
import { c, control, monthLabel, parseNumber, primary, qty, rm } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { perThousand, type StockItem, type StockMovement, unitValue, usageSheet } from 'src/shared/stock';
import { STOCK_GROUPS } from 'src/shared/stock-types';

// Usage vs sales: per item, opening + stock in + transfer in − transfer out −
// closing = actual usage, and that usage per RM 1,000 of the shop's sales.
// A ratio far from its usual (the last three months with sales) is marked:
// something was wasted, missed or over-portioned.

const cell: CSSProperties = { fontSize: 13, padding: '7px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...right, fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2, position: 'sticky', top: 0 };
// More than this far from the usual ratio is worth a look.
const OFF_BY = 0.2;

const shiftMonth = (month: string, by: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1)).toISOString().slice(0, 7);
const n = (value: number) => (value ? qty(value) : '');

export const UsageTab = ({ items, movementsByItem, owner, today, onChanged }: { items: StockItem[]; movementsByItem: Map<string, StockMovement[]>; owner: StockOwner | null; today: string; onChanged: () => void }) => {
  // Last month by default: this month is not finished yet.
  const [month, setMonth] = useState(shiftMonth(today.slice(0, 7), -1));
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sales = owner?.sales ?? {};
  const monthSales = sales[month];
  const sheet = useMemo(() => usageSheet(items, movementsByItem, month), [items, movementsByItem, month]);
  // The usual ratio: the average of the three months before, where sales were typed.
  const usual = useMemo(() => {
    const before = [1, 2, 3].map((k) => shiftMonth(month, -k)).filter((m) => sales[m]);
    const sheets = before.map((m) => ({ m, rows: usageSheet(items, movementsByItem, m).rows }));

    return new Map(
      items.map((item) => {
        const ratios = sheets.map((s) => perThousand(s.rows.find((r) => r.item.id === item.id)?.actual ?? 0, sales[s.m])).filter((r): r is number => r !== null && r > 0);

        return [item.id, ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null];
      }),
    );
  }, [items, movementsByItem, month, sales]);
  const rows = sheet.rows.filter((r) => r.opening || r.purchased || r.transferIn || r.transferOut || r.closing || r.actual);
  const groups = STOCK_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.item.group === g.value) })).filter((g) => g.rows.length);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const missingCost = rows.reduce((s, r) => s + r.missing * unitValue(r.item), 0);
  const canType = !!owner?.canManage;

  const saveSales = async () => {
    if (!owner || draft === null) return;
    setBusy(true);
    const result = await stockAction({ action: 'saveSales', ownerId: owner.id, month, amount: draft.trim() === '' ? 0 : parseNumber(draft) });

    setBusy(false);
    if (result.success) {
      setDraft(null);
      onChanged();
    }
  };

  if (!owner) return <span style={{ fontSize: 13, color: c.text3 }}>{L('Pick a business in the left sidebar to see its usage.', 'Pilih perniagaan di bar sisi kiri untuk lihat penggunaannya.')}</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
          <button onClick={() => setMonth(shiftMonth(month, -1))} style={{ ...control, border: 'none', borderRadius: 0 }} title={L('Previous month', 'Bulan sebelumnya')}>
            ‹
          </button>
          <span style={{ padding: '0 12px', fontWeight: 600, fontSize: 14, minWidth: 120, textAlign: 'center' }}>{monthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} style={{ ...control, border: 'none', borderRadius: 0 }} title={L('Next month', 'Bulan seterusnya')}>
            ›
          </button>
        </div>
        <span style={{ fontSize: 13, color: c.text2, marginLeft: 8 }}>{L('Shop sales in', 'Jualan kedai pada')} {monthLabel(month)}:</span>
        {draft !== null ? (
          <>
            <input autoFocus value={draft} onChange={(e) => setDraft(readValue(e))} inputMode="decimal" placeholder={L('e.g. 60000', 'cth. 60000')} style={{ ...control, width: 130, cursor: 'text' }} />
            <button onClick={saveSales} disabled={busy} style={primary}>
              {busy ? L('Saving…', 'Menyimpan…') : L('Save', 'Simpan')}
            </button>
            <button onClick={() => setDraft(null)} style={control}>
              {L('Cancel', 'Batal')}
            </button>
          </>
        ) : (
          <>
            <b style={{ fontSize: 14 }}>{monthSales ? rm(monthSales) : L('not typed yet', 'belum ditaip')}</b>
            {canType ? (
              <button onClick={() => setDraft(monthSales ? String(monthSales) : '')} style={control}>
                {monthSales ? L('Change', 'Tukar') : L('Type sales', 'Taip jualan')}
              </button>
            ) : null}
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 12 }}>
          <div style={{ fontSize: 12, color: c.text3 }}>{L('Stock used (cost)', 'Stok digunakan (kos)')}</div>
          <div style={{ fontSize: 20, fontWeight: 650 }}>{rm(totalCost)}</div>
        </div>
        <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 12 }}>
          <div style={{ fontSize: 12, color: c.text3 }}>{L('Per RM 1,000 of sales', 'Bagi setiap RM 1,000 jualan')}</div>
          <div style={{ fontSize: 20, fontWeight: 650 }}>{monthSales ? rm((totalCost / monthSales) * 1000) : '—'}</div>
          <div style={{ fontSize: 12, color: c.text3 }}>{monthSales ? L(`stock cost is ${((totalCost / monthSales) * 100).toFixed(1)}% of sales`, `kos stok ialah ${((totalCost / monthSales) * 100).toFixed(1)}% daripada jualan`) : L('type the sales to see this', 'taip jualan untuk lihat ini')}</div>
        </div>
        <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 12 }}>
          <div style={{ fontSize: 12, color: c.text3 }}>{L('Missing at the count', 'Hilang semasa kiraan')}</div>
          <div style={{ fontSize: 20, fontWeight: 650, color: missingCost > 0.5 ? 'var(--t-color-red11)' : c.text }}>{sheet.counted ? rm(Math.max(0, missingCost)) : '—'}</div>
          <div style={{ fontSize: 12, color: c.text3 }}>{sheet.counted ? L('used but never recorded', 'digunakan tetapi tidak direkodkan') : L('no shelf count this month', 'tiada kiraan rak bulan ini')}</div>
        </div>
      </div>

      {!sheet.counted ? (
        <span style={{ fontSize: 12.5, color: 'var(--t-color-amber11)' }}>
          {L(
            `No shelf count was saved in ${monthLabel(month)}, so the closing comes from the records and actual usage equals what was taken out and wasted. Count the shelf at the end of the month (Count button) to find stock that went missing.`,
            `Tiada kiraan rak disimpan pada ${monthLabel(month)}, jadi stok akhir diambil daripada rekod dan penggunaan sebenar sama dengan yang dikeluarkan dan dibuang. Kira rak pada hujung bulan (butang Kira stok) untuk cari stok yang hilang.`,
          )}
        </span>
      ) : null}

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, maxHeight: 'calc(100cqh - 330px)', minHeight: 240 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>{L('Item', 'Produk')}</th>
              <th style={head}>{L('Opening', 'Stok awal')}</th>
              <th style={head}>{L('+ Stock in', '+ Stok masuk')}</th>
              <th style={head}>{L('+ Transfer in', '+ Pindah masuk')}</th>
              <th style={head}>{L('− Transfer out', '− Pindah keluar')}</th>
              <th style={head}>{L('− Closing', '− Stok akhir')}</th>
              <th style={{ ...head, color: c.text }}>{L('= Actual usage', '= Guna sebenar')}</th>
              <th style={head}>{L('Recorded', 'Direkodkan')}</th>
              <th style={head}>{L('Missing', 'Hilang')}</th>
              <th style={{ ...head, color: c.text }}>{L('Per RM 1,000', 'Setiap RM 1,000')}</th>
              <th style={head}>{L('Usual', 'Biasa')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={`g-${g.value}`}>
                <td colSpan={11} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600, fontSize: 12 }}>
                  {g.label}
                </td>
              </tr>,
              ...g.rows.map((r) => {
                const ratio = perThousand(r.actual, monthSales);
                const usualRatio = usual.get(r.item.id) ?? null;
                const off = ratio !== null && usualRatio ? Math.abs(ratio / usualRatio - 1) > OFF_BY : false;

                return (
                  <tr key={r.item.id}>
                    <td style={{ ...cell, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ color: c.text3, fontSize: 12 }}>{r.item.code} </span>
                      {r.item.name}
                      <span style={{ color: c.text3, fontSize: 12 }}> · {r.item.unit}</span>
                    </td>
                    <td style={right}>{n(r.opening)}</td>
                    <td style={right}>{n(r.purchased)}</td>
                    <td style={right}>{n(r.transferIn)}</td>
                    <td style={right}>{n(r.transferOut)}</td>
                    <td style={right}>{n(r.closing)}</td>
                    <td style={{ ...right, fontWeight: 650 }}>{n(r.actual)}</td>
                    <td style={{ ...right, color: c.text3 }}>{n(r.recorded)}</td>
                    <td style={{ ...right, color: r.missing > 0.005 ? 'var(--t-color-red11)' : r.missing < -0.005 ? 'var(--t-color-amber11)' : c.text3 }}>{n(r.missing)}</td>
                    <td style={{ ...right, fontWeight: 650, color: off ? 'var(--t-color-red11)' : c.text }} title={off ? L('More than 20% away from the usual', 'Berbeza lebih 20% daripada biasa') : undefined}>
                      {ratio === null ? '—' : qty(ratio)}
                      {off ? ' ⚠' : ''}
                    </td>
                    <td style={{ ...right, color: c.text3 }}>{usualRatio ? qty(Math.round(usualRatio * 1000) / 1000) : '—'}</td>
                  </tr>
                );
              }),
            ])}
            {!groups.length ? (
              <tr>
                <td colSpan={11} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 24 }}>
                  {L('Nothing moved in', 'Tiada pergerakan stok pada')} {monthLabel(month)}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <span style={{ fontSize: 12, color: c.text3 }}>
        {L(
          'Actual usage = opening + stock in + transfer in (borrowed, returned, swapped in) − transfer out (lent, given back) − closing. Recorded = taken out + wasted. Missing = actual − recorded. Per RM 1,000 = actual usage ÷ sales × 1,000, in the item\'s unit; "Usual" is the average of the three months before that have sales. ⚠ = more than 20% away from usual.',
          'Guna sebenar = stok awal + stok masuk + pindah masuk (dipinjam, dipulangkan, ditukar masuk) − pindah keluar (dipinjamkan, dipulangkan semula) − stok akhir. Direkodkan = dikeluarkan + dibuang. Hilang = guna sebenar − direkodkan. Setiap RM 1,000 = guna sebenar ÷ jualan × 1,000, dalam unit produk; "Biasa" ialah purata tiga bulan sebelumnya yang ada jualan. ⚠ = berbeza lebih 20% daripada biasa.',
        )}
      </span>
    </div>
  );
};
