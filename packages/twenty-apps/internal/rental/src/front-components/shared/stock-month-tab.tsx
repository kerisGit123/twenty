import { type CSSProperties, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { readValue } from 'src/front-components/shared/read-value';
import { c, control, dayMonth, monthLabel, qty, rm } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, type MonthRow, monthSheet, type StockItem, type StockMovement, unitPrice } from 'src/shared/stock';
import { STOCK_GROUPS } from 'src/shared/stock-types';

// The monthly restock sheet, laid out like the paper one: per group, one line
// per item — opening, in, take-outs by date, consumption and its cost, closing.

const cell: CSSProperties = { fontSize: 13, padding: '7px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2, position: 'sticky', top: 0, zIndex: 1 };
const TAKE_BG = 'var(--t-color-blue2)';
// Code and item stay on the left while the dates scroll sideways.
const CODE_W = 56;
const pinned = (left: number, background: string): CSSProperties => ({ position: 'sticky', left, background, zIndex: 1 });
const OUT_BG = 'var(--t-color-blue3)';
const IN_BG = 'var(--t-color-green2)';
const IN_HEAD_BG = 'var(--t-color-green3)';

const shiftMonth = (month: string, by: number) => {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));

  return date.toISOString().slice(0, 7);
};

// Blank instead of 0, so the busy cells stand out as on paper.
const n = (value: number) => (value ? qty(value) : '');

const moved = (r: MonthRow) => r.opening || r.purchased || r.otherIn || r.consumption || r.lent || r.waste || r.closing;

export const MonthTab = ({ items, movementsByItem, ownerId, today }: { items: StockItem[]; movementsByItem: Map<string, StockMovement[]>; ownerId: string; today: string }) => {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showAll, setShowAll] = useState(false);
  // Detailed: each delivery date gets its own IN column, like the take-outs.
  const [inByDate, setInByDate] = useState(false);
  const sheet = useMemo(() => monthSheet(items, movementsByItem, month), [items, movementsByItem, month]);
  // Discontinued items only while they still move; empty items only on request.
  const rows = sheet.rows.filter((r) => (r.item.status !== 'DISCONTINUED' || moved(r)) && (showAll || moved(r)));
  const hidden = sheet.rows.length - rows.length;
  const groups = STOCK_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.item.group === g.value) })).filter((g) => g.rows.length);
  const value = (r: MonthRow) => Math.max(r.closing, 0) * unitPrice(r.item);
  const totalCost = rows.reduce((sum, r) => sum + r.consumptionCost, 0);
  const totalValue = rows.reduce((sum, r) => sum + value(r), 0);
  const hasOtherOut = rows.some((r) => r.lent || r.waste);
  const csv = new RestApiClient().resolveUrl('/s/stock/csv', { query: { kind: 'month', month, ...(ownerId ? { owner: ownerId } : {}) } });
  const inColumns = inByDate ? sheet.inDates : [];
  const columns = 8 + sheet.dates.length + (hasOtherOut ? 1 : 0) + (inByDate ? Math.max(inColumns.length, 1) - 1 : 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
          <button onClick={() => setMonth(shiftMonth(month, -1))} style={{ ...control, border: 'none', borderRadius: 0 }} title="Previous month">
            ‹
          </button>
          <span style={{ padding: '0 12px', fontWeight: 600, fontSize: 14, minWidth: 120, textAlign: 'center' }}>{monthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} style={{ ...control, border: 'none', borderRadius: 0 }} title="Next month">
            ›
          </button>
        </div>
        <input type="month" value={month} onChange={(e) => readValue(e) && setMonth(readValue(e))} style={{ ...control, cursor: 'text' }} title="Jump to a month" />
        {month !== today.slice(0, 7) ? (
          <button onClick={() => setMonth(today.slice(0, 7))} style={control}>
            This month
          </button>
        ) : null}
        <button
          onClick={() => setInByDate(!inByDate)}
          style={{ ...control, fontWeight: inByDate ? 600 : 400, borderColor: inByDate ? 'var(--t-color-green9)' : c.border2, color: inByDate ? 'var(--t-color-green11)' : c.text }}
          title="Show each delivery date as its own column"
        >
          {inByDate ? '✓ IN dates shown' : 'Show IN dates'}
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: c.text2 }}>
          Used <b>{rm(totalCost)}</b> · closing stock <b>{rm(totalValue)}</b> · {sheet.dates.length} take-out day{sheet.dates.length === 1 ? '' : 's'}
        </span>
        <a href={csv} target="_blank" rel="noreferrer" style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          ⬇ CSV
        </a>
      </div>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, maxHeight: 'calc(100cqh - 220px)', minHeight: 240 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 820 + (sheet.dates.length + inColumns.length) * 64 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left', width: CODE_W, minWidth: CODE_W, boxSizing: 'border-box', left: 0, zIndex: 3 }}>Code</th>
              <th style={{ ...head, textAlign: 'left', left: CODE_W, zIndex: 3, borderRight: `1px solid ${c.border}` }}>Item</th>
              <th style={head}>Opening</th>
              {inByDate ? (
                inColumns.length ? (
                  inColumns.map((d) => (
                    <th key={`in-${d}`} style={{ ...head, background: IN_HEAD_BG, color: 'var(--t-color-green11)' }} title={`In on ${d}`}>
                      In {dayMonth(d)}
                    </th>
                  ))
                ) : (
                  <th style={{ ...head, background: IN_HEAD_BG, color: 'var(--t-color-green11)' }}>In</th>
                )
              ) : (
                <th style={head}>In</th>
              )}
              {sheet.dates.map((d) => (
                <th key={d} style={{ ...head, background: OUT_BG, color: 'var(--t-color-blue11)' }} title={`Taken out on ${d}`}>
                  Out {dayMonth(d)}
                </th>
              ))}
              <th style={{ ...head, background: OUT_BG, color: 'var(--t-color-blue11)' }}>Used</th>
              {hasOtherOut ? <th style={head}>Lent / waste</th> : null}
              <th style={head}>Cost</th>
              <th style={head}>Closing</th>
              <th style={head}>Lasts</th>
            </tr>
          </thead>
          <tbody>
            {groups.length ? null : (
              <tr>
                <td colSpan={columns} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32 }}>
                  Nothing in stock or moving in {monthLabel(month)}.
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const used = g.rows.reduce((sum, r) => sum + r.consumptionCost, 0);
              const closing = g.rows.reduce((sum, r) => sum + value(r), 0);

              return [
                <tr key={`g-${g.value}`}>
                  <td colSpan={columns} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600, fontSize: 12 }}>
                    {g.label}
                    <span style={{ fontWeight: 400, color: c.text3 }}>
                      {' '}
                      · {g.rows.length} items · used {rm(used)} · closing {rm(closing)}
                    </span>
                  </td>
                </tr>,
                ...g.rows.map((r, index) => {
                  const zebra = index % 2 ? 'var(--t-color-gray1)' : c.bg;

                  return (
                    <tr key={r.item.id} style={{ background: zebra }}>
                      <td style={{ ...cell, color: c.text3, fontSize: 12, width: CODE_W, minWidth: CODE_W, boxSizing: 'border-box', ...pinned(0, zebra) }}>{r.item.code}</td>
                      <td
                        style={{ ...cell, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', borderRight: `1px solid ${c.border}`, ...pinned(CODE_W, zebra) }}
                        title={`${r.item.name} · ${r.item.specification}`}
                      >
                        <span style={{ fontWeight: 500 }}>{r.item.name}</span>
                        <span style={{ color: c.text3, fontSize: 12 }}> · {r.item.unit}</span>
                      </td>
                      <td style={{ ...right, color: c.text2 }}>{n(r.opening)}</td>
                      {inByDate ? (
                        inColumns.length ? (
                          inColumns.map((d) => (
                            <td key={`in-${d}`} style={{ ...right, background: IN_BG, color: 'var(--t-color-green11)', fontWeight: 600 }}>
                              {r.ins[d] ? `+${qty(r.ins[d])}` : ''}
                            </td>
                          ))
                        ) : (
                          <td style={{ ...right, background: IN_BG }} />
                        )
                      ) : (
                        <td style={{ ...right, color: 'var(--t-color-green11)', fontWeight: r.purchased + r.otherIn ? 600 : 400 }}>
                          {r.purchased + r.otherIn ? `+${qty(r.purchased + r.otherIn)}` : ''}
                        </td>
                      )}
                      {sheet.dates.map((d) => (
                        <td key={d} style={{ ...right, background: TAKE_BG }}>
                          {n(r.takes[d] ?? 0)}
                        </td>
                      ))}
                      <td style={{ ...right, background: TAKE_BG, fontWeight: 700 }}>{n(r.consumption)}</td>
                      {hasOtherOut ? <td style={{ ...right, color: c.text2 }}>{r.lent || r.waste ? `${n(r.lent) || 0} / ${n(r.waste) || 0}` : ''}</td> : null}
                      <td style={{ ...right, color: c.text2 }}>{r.consumptionCost ? rm(r.consumptionCost) : ''}</td>
                      <td style={right} title={`${qty(r.closing)} ${r.item.unit}`}>
                        <span style={{ fontWeight: 600, color: r.closing < 0 ? 'var(--t-color-red11)' : c.text }}>{r.closing ? cartonsAndUnits(r.closing, r.item) : '—'}</span>
                      </td>
                      <td style={{ ...right, color: r.monthsLeft !== null && r.monthsLeft < 1 ? 'var(--t-color-red11)' : c.text2 }}>{r.monthsLeft === null ? '' : `${qty(r.monthsLeft)} mo`}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: c.text3 }}>
        <span>
          Quantities in each item&apos;s unit (bag, bottle, pcs); closing also in cartons. Opening = last month&apos;s closing. Lasts = closing ÷ this month&apos;s use.
        </span>
        <span style={{ flex: 1 }} />
        {hidden || showAll ? (
          <button onClick={() => setShowAll(!showAll)} style={{ all: 'unset', cursor: 'pointer', color: c.accent }}>
            {showAll ? 'Hide items with no stock and no movement' : `Show ${hidden} item${hidden === 1 ? '' : 's'} with no stock and no movement`}
          </button>
        ) : null}
      </div>
    </>
  );
};
