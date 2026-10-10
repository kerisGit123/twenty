import { type CSSProperties, useMemo, useState } from 'react';

import { type DateRange, DateRangePicker, presetRange } from 'src/front-components/shared/date-range-picker';
import { readValue } from 'src/front-components/shared/read-value';
import { MovementsTab } from 'src/front-components/shared/stock-tabs';
import { c, control, dayMonth, input, qty } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, historySheet, type StockItem, type StockMovement } from 'src/shared/stock';
import { STOCK_GROUPS } from 'src/shared/stock-types';

// In / out history: by default a grid like the paper sheet (items down,
// dates across, IN in green and OUT in blue); "List" shows each movement
// with its to/from, reference and notes.

const cell: CSSProperties = { fontSize: 13, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2, position: 'sticky', top: 0, zIndex: 1 };
const CODE_W = 56;
const pinned = (left: number, background: string): CSSProperties => ({ position: 'sticky', left, background, zIndex: 1 });
const DAY_BG = 'var(--t-color-gray1)';
const GREEN = 'var(--t-color-green11)';
const BLUE = 'var(--t-color-blue11)';

export const HistoryTab = ({ items, movements, movementsByItem, today, onChanged }: { items: StockItem[]; movements: StockMovement[]; movementsByItem: Map<string, StockMovement[]>; today: string; onChanged: () => void }) => {
  const [view, setView] = useState<'sheet' | 'list'>('sheet');
  const [range, setRange] = useState<DateRange>(() => presetRange('thisMonth', today));
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const sheet = useMemo(() => historySheet(items, movementsByItem, range.from, range.to), [items, movementsByItem, range.from, range.to]);
  const q = query.trim().toLowerCase();
  const rows = sheet.rows.filter(
    (r) => (showAll ? r.item.status !== 'DISCONTINUED' || r.opening || r.closing : r.totalIn || r.totalOut) && (!q || `${r.item.code} ${r.item.name}`.toLowerCase().includes(q)),
  );
  const groups = STOCK_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.item.group === g.value) })).filter((g) => g.rows.length);
  const columns = 6 + sheet.dates.length;

  const toggle = (
    <div style={{ display: 'inline-flex', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
      {(['sheet', 'list'] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          style={{ ...control, border: 'none', borderRadius: 0, fontWeight: view === v ? 600 : 400, background: view === v ? 'var(--t-color-blue2)' : c.bg, color: view === v ? 'var(--t-color-blue11)' : c.text }}
        >
          {v === 'sheet' ? '▦ Sheet' : '☰ List'}
        </button>
      ))}
    </div>
  );

  if (view === 'list') {
    return (
      <>
        <div>{toggle}</div>
        <MovementsTab items={items} movements={movements} today={today} onChanged={onChanged} />
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {toggle}
        <DateRangePicker value={range} today={today} onChange={setRange} />
        <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder="Search code or name" style={{ ...input, width: 200 }} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: c.text3 }}>
          <span style={{ color: GREEN, fontWeight: 600 }}>+ IN</span> · <span style={{ color: BLUE, fontWeight: 600 }}>− OUT</span> · {sheet.dates.length} day{sheet.dates.length === 1 ? '' : 's'} with movement
        </span>
      </div>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, maxHeight: 'calc(100cqh - 230px)', minHeight: 240 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 700 + sheet.dates.length * 72 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left', width: CODE_W, minWidth: CODE_W, boxSizing: 'border-box', left: 0, zIndex: 3 }}>Code</th>
              <th style={{ ...head, textAlign: 'left', left: CODE_W, zIndex: 3, borderRight: `1px solid ${c.border}` }}>Item</th>
              <th style={head}>Opening</th>
              {sheet.dates.map((d) => (
                <th key={d} style={head} title={d}>
                  {dayMonth(d)}
                </th>
              ))}
              <th style={{ ...head, color: GREEN, background: 'var(--t-color-green2)' }}>Total in</th>
              <th style={{ ...head, color: BLUE, background: 'var(--t-color-blue2)' }}>Total out</th>
              <th style={head}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {groups.length ? null : (
              <tr>
                <td colSpan={columns} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32 }}>
                  No IN or OUT in this period.
                </td>
              </tr>
            )}
            {groups.map((g) => [
              <tr key={`g-${g.value}`}>
                <td colSpan={columns} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600, fontSize: 12 }}>
                  {g.label}
                  <span style={{ fontWeight: 400, color: c.text3 }}> · {g.rows.length} items</span>
                </td>
              </tr>,
              ...g.rows.map((r, index) => {
                const zebra = index % 2 ? 'var(--t-color-gray1)' : c.bg;

                return (
                  <tr key={r.item.id} style={{ background: zebra }}>
                    <td style={{ ...cell, color: c.text3, fontSize: 12, width: CODE_W, minWidth: CODE_W, boxSizing: 'border-box', ...pinned(0, zebra) }}>{r.item.code}</td>
                    <td style={{ ...cell, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', borderRight: `1px solid ${c.border}`, ...pinned(CODE_W, zebra) }} title={`${r.item.name} · ${r.item.specification}`}>
                      <span style={{ fontWeight: 500 }}>{r.item.name}</span>
                      <span style={{ color: c.text3, fontSize: 12 }}> · {r.item.unit}</span>
                    </td>
                    <td style={{ ...right, color: c.text2 }}>{r.opening ? qty(r.opening) : ''}</td>
                    {sheet.dates.map((d) => {
                      const day = r.days[d];

                      return (
                        <td key={d} style={{ ...right, background: day ? DAY_BG : undefined, lineHeight: 1.25 }}>
                          {day?.in ? <div style={{ color: GREEN, fontWeight: 600 }}>+{qty(day.in)}</div> : null}
                          {day?.out ? <div style={{ color: BLUE, fontWeight: 600 }}>−{qty(day.out)}</div> : null}
                        </td>
                      );
                    })}
                    <td style={{ ...right, color: GREEN, background: 'var(--t-color-green2)', fontWeight: 600 }}>{r.totalIn ? `+${qty(r.totalIn)}` : ''}</td>
                    <td style={{ ...right, color: BLUE, background: 'var(--t-color-blue2)', fontWeight: 600 }}>{r.totalOut ? `−${qty(r.totalOut)}` : ''}</td>
                    <td style={{ ...right, fontWeight: 600, color: r.closing < 0 ? 'var(--t-color-red11)' : c.text }} title={`${qty(r.closing)} ${r.item.unit}`}>
                      {r.closing ? cartonsAndUnits(r.closing, r.item) : '—'}
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: c.text3 }}>
        <span>Quantities in each item&apos;s unit. Opening = balance before the first day; Balance = after the last day. Switch to List for who, references and notes.</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowAll(!showAll)} style={{ all: 'unset', cursor: 'pointer', color: c.accent }}>
          {showAll ? 'Only items that moved' : 'Show all items'}
        </button>
      </div>
    </>
  );
};
