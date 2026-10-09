import { type CSSProperties, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { readValue } from 'src/front-components/shared/read-value';
import { LastsBar } from 'src/front-components/shared/stock-hand-tab';
import { c, control, input, monthLabel, primary, qty, rm, small } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, type StockStatus, unitPrice } from 'src/shared/stock';

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
}: {
  statuses: StockStatus[];
  ruleText: string;
  ownerId: string;
  onEditRule: (() => void) | null;
  onOrder: (lines: Array<{ itemId: string; units: number }>) => void;
}) => {
  const [showAll, setShowAll] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const active = statuses.filter((s) => s.item.status !== 'DISCONTINUED');
  const cartons = (s: StockStatus) => (edits[s.item.id] !== undefined ? Number(edits[s.item.id].replace(/[^0-9.]/g, '')) || 0 : s.suggestedCartons);
  const rows = active.filter((s) => showAll || s.flag === 'ORDER' || s.flag === 'LOW' || cartons(s) > 0);
  const ordered = active.filter((s) => cartons(s) > 0);
  const total = ordered.reduce((sum, s) => sum + cartons(s) * s.item.cartonPrice, 0);
  const totalCartons = ordered.reduce((sum, s) => sum + cartons(s), 0);
  const nextMonthCost = active.reduce((sum, s) => sum + s.forecast * unitPrice(s.item), 0);
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
            Change rule
          </button>
        ) : null}
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowAll(!showAll)} style={{ ...control, fontWeight: showAll ? 600 : 400, borderColor: showAll ? c.accent : c.border2 }}>
          {showAll ? '✓ All items' : 'Show all items'}
        </button>
        {changed ? (
          <button onClick={() => setEdits({})} style={control} title="Back to the suggested cartons">
            Reset
          </button>
        ) : null}
        <a href={csv} target="_blank" rel="noreferrer" style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          ⬇ CSV
        </a>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13, color: c.text2 }}>
        <span>
          Order <b style={{ color: c.text }}>{ordered.length}</b> item{ordered.length === 1 ? '' : 's'} · <b style={{ color: c.text }}>{totalCartons}</b> ctn ·{' '}
          <b style={{ color: 'var(--t-color-blue11)', fontSize: 16 }}>{rm(total)}</b>
        </span>
        <span>
          Next month&apos;s use at cost: <b style={{ color: c.text }}>{rm(nextMonthCost)}</b>
        </span>
      </div>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, maxHeight: 'calc(100cqh - 280px)', minHeight: 220 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left', width: 56 }}>Code</th>
              <th style={{ ...head, textAlign: 'left' }}>Item</th>
              <th style={head}>In hand</th>
              <th style={{ ...head, textAlign: 'left' }}>Lasts</th>
              <th style={head}>Need next month</th>
              <th style={head}>Suggested</th>
              <th style={{ ...head, background: 'var(--t-color-blue3)', color: 'var(--t-color-blue11)' }}>Order (ctn)</th>
              <th style={head}>Ctn price</th>
              <th style={head}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {blocks.length ? null : (
              <tr>
                <td colSpan={9} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32, whiteSpace: 'normal' }}>
                  Nothing is below the re-order level. Use “Show all items” to order something anyway.
                </td>
              </tr>
            )}
            {blocks.map((block) => {
              const blockOrdered = block.rows.filter((s) => cartons(s) > 0);

              return [
                <tr key={`s-${block.name}`}>
                  <td colSpan={9} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600, fontSize: 12 }}>
                    {block.name}
                    <span style={{ fontWeight: 400, color: c.text3 }}>
                      {' '}
                      · {blockOrdered.length} to order · {blockOrdered.reduce((sum, s) => sum + cartons(s), 0)} ctn ·{' '}
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
                      <td style={right}>{s.balance ? cartonsAndUnits(s.balance, s.item) : <span style={{ color: c.text3 }}>none</span>}</td>
                      <td style={cell}>
                        <LastsBar s={s} />
                      </td>
                      <td style={right} title={s.forecastBasis.length ? `Average of ${s.forecastBasis.map(monthLabel).join(', ')}` : 'No take-outs recorded yet'}>
                        {s.forecast ? (
                          <>
                            {qty(s.forecast)} <span style={{ color: c.text3, fontSize: 12 }}>{s.item.unit}</span>
                          </>
                        ) : (
                          <span style={{ color: c.text3 }}>—</span>
                        )}
                      </td>
                      <td style={{ ...right, color: c.text3 }}>{s.suggestedCartons ? `${s.suggestedCartons} ctn` : '—'}</td>
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
          Order total <b style={{ fontSize: 15 }}>{rm(total)}</b> <span style={{ color: c.text3 }}>({totalCartons} ctn)</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: c.text3 }}>When the goods arrive, check them against the delivery and record them:</span>
        <button
          onClick={() => onOrder(ordered.map((s) => ({ itemId: s.item.id, units: cartons(s) * s.item.unitsPerCarton })))}
          disabled={!ordered.length}
          style={{ ...primary, opacity: ordered.length ? 1 : 0.5 }}
        >
          Goods arrived: record as purchase
        </button>
      </div>
      <span style={{ fontSize: 12, color: c.text3 }}>
        Need next month = average of the last 3 months with take-outs. Suggested = enough for the “order enough for” months, in whole cartons. Type your own number to change an order.
      </span>
    </>
  );
};
