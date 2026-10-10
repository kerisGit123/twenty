import { type CSSProperties, useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { c, control, ExcelButton, input, qty, rm, withOwner } from 'src/front-components/shared/stock-ui';
import { MONTHS } from 'src/shared/months';
import { type StockItem, type StockMovement, toCartons, unitPrice, yearGrid } from 'src/shared/stock';
import { STOCK_GROUPS } from 'src/shared/stock-types';

// Every product's opening and closing for each month of a year, like a
// stock card: Jan opening | Jan closing | Feb opening | ... in units, cartons
// or value.

type Measure = 'units' | 'ctn' | 'rm';

const cell: CSSProperties = { fontSize: 12, padding: '6px 8px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'center', fontSize: 11, fontWeight: 600, color: c.text3, background: c.bg2, position: 'sticky', top: 0, zIndex: 1 };
const CODE_W = 52;
const ROW2 = 29;
const pinned = (left: number, background: string): CSSProperties => ({ position: 'sticky', left, background, zIndex: 1 });

export const YearGrid = ({ items, movementsByItem, today, ownerId }: { items: StockItem[]; movementsByItem: Map<string, StockMovement[]>; today: string; ownerId: string }) => {
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [measure, setMeasure] = useState<Measure>('units');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => yearGrid(items, movementsByItem, year), [items, movementsByItem, year]);
  // Months still to come show nothing.
  const lastMonth = year < thisYear ? 12 : year > thisYear ? 0 : Number(today.slice(5, 7));
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (showAll || r.months.some((m, i) => i < lastMonth && (m.opening || m.closing || m.in || m.used || m.waste))) && (!q || `${r.item.code} ${r.item.name}`.toLowerCase().includes(q)),
  );
  const groups = STOCK_GROUPS.map((g) => ({ ...g, rows: visible.filter((r) => r.item.group === g.value) })).filter((g) => g.rows.length);
  const show = (units: number, item: StockItem) => {
    if (!units) return '';
    if (measure === 'ctn') return qty(toCartons(units, item));
    if (measure === 'rm') return rm(Math.max(units, 0) * unitPrice(item)).replace('RM ', '');

    return qty(units);
  };
  const totalOf = (month: number, key: 'opening' | 'closing') => visible.reduce((sum, r) => sum + Math.max(r.months[month][key], 0) * unitPrice(r.item), 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
          <button onClick={() => setYear(year - 1)} style={{ ...control, border: 'none', borderRadius: 0 }}>
            ‹
          </button>
          <span style={{ padding: '0 14px', fontWeight: 600, fontSize: 14 }}>{year}</span>
          <button onClick={() => setYear(year + 1)} style={{ ...control, border: 'none', borderRadius: 0 }}>
            ›
          </button>
        </div>
        <div style={{ display: 'inline-flex', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
          {(
            [
              ['units', 'Units'],
              ['ctn', 'Cartons'],
              ['rm', 'RM value'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMeasure(value)}
              style={{ ...control, border: 'none', borderRadius: 0, fontWeight: measure === value ? 600 : 400, background: measure === value ? 'var(--t-color-blue2)' : c.bg, color: measure === value ? 'var(--t-color-blue11)' : c.text }}
            >
              {label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder="Search code or name" style={{ ...input, width: 190 }} />
        <span style={{ flex: 1 }} />
        <ExcelButton query={withOwner({ kind: 'xlsx-year', year: String(year) }, ownerId)} title={`${year}: every product's opening and closing per month, as Excel`} />
      </div>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, maxHeight: 'calc(100cqh - 270px)', minHeight: 260 }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...head, textAlign: 'left', width: CODE_W, minWidth: CODE_W, boxSizing: 'border-box', left: 0, zIndex: 3 }}>
                Code
              </th>
              <th rowSpan={2} style={{ ...head, textAlign: 'left', left: CODE_W, zIndex: 3, minWidth: 220, borderRight: `1px solid ${c.border2}` }}>
                Item {measure === 'units' ? '(units)' : measure === 'ctn' ? '(cartons)' : '(RM)'}
              </th>
              {MONTHS.map((m, i) => (
                <th key={m} colSpan={2} style={{ ...head, color: i < lastMonth ? c.text : c.text3, background: i % 2 ? c.bg2 : 'var(--t-color-gray3)', borderRight: `1px solid ${c.border2}` }}>
                  {m}
                </th>
              ))}
            </tr>
            <tr>
              {MONTHS.flatMap((m, i) => [
                <th key={`${m}-o`} style={{ ...head, top: ROW2, fontWeight: 500, background: i % 2 ? c.bg2 : 'var(--t-color-gray3)' }}>
                  Open
                </th>,
                <th key={`${m}-c`} style={{ ...head, top: ROW2, color: c.text, background: i % 2 ? c.bg2 : 'var(--t-color-gray3)', borderRight: `1px solid ${c.border2}` }}>
                  Close
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {groups.length ? null : (
              <tr>
                <td colSpan={26} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32 }}>
                  No stock in {year}.
                </td>
              </tr>
            )}
            {groups.map((g) => [
              <tr key={`g-${g.value}`}>
                <td colSpan={26} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600 }}>
                  <span style={{ position: 'sticky', left: 8 }}>
                    {g.label} <span style={{ fontWeight: 400, color: c.text3 }}>· {g.rows.length} items</span>
                  </span>
                </td>
              </tr>,
              ...g.rows.map((r, index) => {
                const zebra = index % 2 ? 'var(--t-color-gray1)' : c.bg;

                return (
                  <tr key={r.item.id} style={{ background: zebra }}>
                    <td style={{ ...cell, color: c.text3, width: CODE_W, minWidth: CODE_W, boxSizing: 'border-box', ...pinned(0, zebra) }}>{r.item.code}</td>
                    <td style={{ ...cell, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', borderRight: `1px solid ${c.border2}`, ...pinned(CODE_W, zebra) }} title={`${r.item.name} · ${r.item.unit}`}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{r.item.name}</span>
                      {measure !== 'rm' ? <span style={{ color: c.text3 }}> · {measure === 'ctn' ? 'ctn' : r.item.unit}</span> : null}
                    </td>
                    {r.months.flatMap((m, i) => {
                      const past = i < lastMonth;
                      const tip = past
                        ? `${MONTHS[i]}: open ${qty(m.opening)} · in +${qty(m.in)} · used −${qty(m.used)}${m.waste ? ` · waste −${qty(m.waste)}` : ''}${m.otherOut ? ` · other −${qty(m.otherOut)}` : ''} · close ${qty(m.closing)} ${r.item.unit}`
                        : '';

                      return [
                        <td key={`${i}-o`} style={{ ...right, color: c.text3 }} title={tip}>
                          {past ? show(m.opening, r.item) : ''}
                        </td>,
                        <td
                          key={`${i}-c`}
                          style={{ ...right, fontWeight: 600, color: m.closing < 0 ? 'var(--t-color-red11)' : m.waste ? 'var(--t-color-red11)' : c.text, borderRight: `1px solid ${c.border}` }}
                          title={tip}
                        >
                          {past ? show(m.closing, r.item) : ''}
                        </td>,
                      ];
                    })}
                  </tr>
                );
              }),
            ])}
            {groups.length ? (
              <tr>
                <td colSpan={2} style={{ ...cell, fontWeight: 700, background: c.bg2, ...pinned(0, c.bg2), borderRight: `1px solid ${c.border2}` }}>
                  Total value (RM)
                </td>
                {MONTHS.flatMap((m, i) => [
                  <td key={`${m}-to`} style={{ ...right, background: c.bg2, color: c.text3 }}>
                    {i < lastMonth ? rm(totalOf(i, 'opening')).replace('RM ', '') : ''}
                  </td>,
                  <td key={`${m}-tc`} style={{ ...right, background: c.bg2, fontWeight: 700, borderRight: `1px solid ${c.border}` }}>
                    {i < lastMonth ? rm(totalOf(i, 'closing')).replace('RM ', '') : ''}
                  </td>,
                ])}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: c.text3 }}>
        <span>Open = stock on the 1st; Close = stock after the last day (= next month&apos;s Open). Hover a number for that month&apos;s in, used and waste. Red closing = waste that month.</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowAll(!showAll)} style={{ all: 'unset', cursor: 'pointer', color: c.accent }}>
          {showAll ? 'Only items with stock' : 'Show all items'}
        </button>
      </div>
    </>
  );
};
