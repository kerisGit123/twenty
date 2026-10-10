import { type CSSProperties, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { c, control, ExcelButton, input, monthLabel, qty, rm, small, withOwner } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, expiryState, type StockItem, type StockStatus } from 'src/shared/stock';
import { STOCK_GROUPS } from 'src/shared/stock-types';
import { MONTHS } from 'src/shared/months';

// "Stock in hand": a compact sheet grouped like the paper restock list, with
// what needs attention on top. Click an item for its history and usage.

type Filter = 'all' | 'order' | 'low' | 'expiry' | 'discontinued';

const cell: CSSProperties = { fontSize: 13, padding: '7px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'left', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2, position: 'sticky', top: 0, zIndex: 1 };

const COLORS = { ORDER: 'var(--t-color-red9)', LOW: 'var(--t-color-amber9)', OK: 'var(--t-color-green9)' };

const shortDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

// How long the stock lasts, as a bar up to 3 months with the re-order level marked.
export const LastsBar = ({ s }: { s: StockStatus }) => {
  if (s.monthsLeft === null) return <span style={{ fontSize: 12, color: c.text3 }}>{s.balance > 0 ? 'not used' : '—'}</span>;
  const scale = Math.max(3, s.reorderBelow * 2);
  const width = Math.min(100, (s.monthsLeft / scale) * 100);
  const color = s.flag === 'ORDER' ? COLORS.ORDER : s.flag === 'LOW' ? COLORS.LOW : COLORS.OK;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} title={`Re-order below ${s.reorderBelow} months`}>
      <span style={{ position: 'relative', width: 72, height: 6, background: 'var(--t-color-gray4)', borderRadius: 3, display: 'inline-block' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${width}%`, background: color, borderRadius: 3 }} />
        <span style={{ position: 'absolute', left: `${(s.reorderBelow / scale) * 100}%`, top: -3, bottom: -3, width: 1, background: c.text3 }} />
      </span>
      <span style={{ fontWeight: 600, fontSize: 12, width: 44, textAlign: 'right', color: s.flag === 'ORDER' ? 'var(--t-color-red11)' : s.flag === 'LOW' ? 'var(--t-color-amber11)' : c.text }}>
        {s.monthsLeft > 24 ? '24+ mo' : `${qty(s.monthsLeft)} mo`}
      </span>
    </span>
  );
};

const Expiry = ({ s, today }: { s: StockStatus; today: string }) => {
  const state = s.balance > 0 ? expiryState(s.nearestExpiry, today) : null;

  if (!state || !s.nearestExpiry) return <span style={{ color: c.text3 }}>—</span>;
  if (state === 'EXPIRED') return <span style={{ color: 'var(--t-color-red11)', fontWeight: 600 }}>Expired {shortDay(s.nearestExpiry)}</span>;

  return <span style={{ color: state === 'SOON' ? 'var(--t-color-amber11)' : c.text2 }}>{shortDay(s.nearestExpiry)}</span>;
};

const Tile = ({ label, value, note, color, active, onClick }: { label: string; value: string; note: string; color?: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      all: 'unset',
      cursor: 'pointer',
      flex: 1,
      minWidth: 150,
      boxSizing: 'border-box',
      padding: '10px 14px',
      borderRadius: c.radius,
      border: `1px solid ${active ? c.accent : c.border}`,
      background: active ? 'var(--t-color-blue2)' : c.bg,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}
  >
    <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
    <span style={{ fontSize: 20, fontWeight: 600, color: color ?? c.text }}>{value}</span>
    <span style={{ fontSize: 12, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note}</span>
  </button>
);

export const StockHandTab = ({
  statuses,
  today,
  ownerId,
  onRecord,
  onOpen,
}: {
  statuses: StockStatus[];
  today: string;
  ownerId: string;
  onRecord: (type: string, itemId: string) => void;
  onOpen: (item: StockItem) => void;
}) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const active = statuses.filter((s) => s.item.status !== 'DISCONTINUED');
  const order = active.filter((s) => s.flag === 'ORDER');
  const low = active.filter((s) => s.flag === 'LOW');
  const expired = active.filter((s) => s.balance > 0 && expiryState(s.nearestExpiry, today) === 'EXPIRED');
  const soon = active.filter((s) => s.balance > 0 && expiryState(s.nearestExpiry, today) === 'SOON');
  const toggle = (next: Filter) => setFilter(filter === next ? 'all' : next);

  const rows = statuses.filter((s) => {
    if (filter === 'discontinued' ? s.item.status !== 'DISCONTINUED' : s.item.status === 'DISCONTINUED') return false;
    if (filter === 'order' && s.flag !== 'ORDER') return false;
    if (filter === 'low' && s.flag !== 'LOW') return false;
    if (filter === 'expiry' && !(s.balance > 0 && ['EXPIRED', 'SOON'].includes(expiryState(s.nearestExpiry, today) ?? ''))) return false;
    if (group && s.item.group !== group) return false;

    return !q || `${s.item.code} ${s.item.name} ${s.item.specification}`.toLowerCase().includes(q);
  });
  const groups = STOCK_GROUPS.map((g) => ({ ...g, rows: rows.filter((s) => s.item.group === g.value) })).filter((g) => g.rows.length);

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Tile
          label="Order now"
          value={String(order.length)}
          note={order.length ? `${order.reduce((sum, s) => sum + s.suggestedCartons, 0)} ctn · ${rm(order.reduce((sum, s) => sum + s.suggestedCost, 0))}` : 'Nothing below the re-order level'}
          color={order.length ? 'var(--t-color-red11)' : undefined}
          active={filter === 'order'}
          onClick={() => toggle('order')}
        />
        <Tile label="Running low" value={String(low.length)} note="Within half a month of the re-order level" color={low.length ? 'var(--t-color-amber11)' : undefined} active={filter === 'low'} onClick={() => toggle('low')} />
        <Tile
          label="Expired / expiring"
          value={`${expired.length} / ${soon.length}`}
          note={expired.length ? `${expired.length} expired, ${soon.length} within 60 days` : `${soon.length} within 60 days`}
          color={expired.length ? 'var(--t-color-red11)' : soon.length ? 'var(--t-color-amber11)' : undefined}
          active={filter === 'expiry'}
          onClick={() => toggle('expiry')}
        />
        <Tile label="Stock value" value={rm(active.reduce((sum, s) => sum + s.value, 0))} note={`${active.length} items in use`} active={filter === 'all'} onClick={() => setFilter('all')} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder="Search code or name" style={{ ...input, width: 220 }} />
        <select value={group} onChange={(e) => setGroup(readValue(e))} style={control}>
          <option value="">All groups</option>
          {STOCK_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <button onClick={() => toggle('discontinued')} style={{ ...control, fontWeight: filter === 'discontinued' ? 600 : 400, borderColor: filter === 'discontinued' ? c.accent : c.border2 }}>
          Discontinued
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: c.text3 }}>
          {rows.length} item{rows.length === 1 ? '' : 's'}
          {filter !== 'all' ? ' · ' : ''}
          {filter !== 'all' ? (
            <button onClick={() => setFilter('all')} style={{ all: 'unset', cursor: 'pointer', color: c.accent }}>
              show all
            </button>
          ) : null}
        </span>
        <ExcelButton query={withOwner({ kind: 'xlsx-hand' }, ownerId)} title="Stock in hand as an Excel file" />
      </div>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, maxHeight: 'calc(100cqh - 250px)', minHeight: 240 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ ...head, width: 56 }}>Code</th>
              <th style={head}>Item</th>
              <th style={{ ...head, textAlign: 'right' }}>In hand</th>
              <th style={head}>Lasts</th>
              <th style={{ ...head, textAlign: 'right' }}>Need / month</th>
              <th style={{ ...head, textAlign: 'right' }}>To order</th>
              <th style={head}>Expiry</th>
              <th style={{ ...head, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {groups.length ? null : (
              <tr>
                <td colSpan={8} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32 }}>
                  No items match.
                </td>
              </tr>
            )}
            {groups.map((g) => [
              <tr key={`g-${g.value}`}>
                <td colSpan={8} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600, fontSize: 12 }}>
                  {g.label}
                  <span style={{ fontWeight: 400, color: c.text3 }}>
                    {' '}
                    · {g.rows.length} items · {rm(g.rows.reduce((sum, s) => sum + s.value, 0))}
                  </span>
                </td>
              </tr>,
              ...g.rows.map((s, index) => (
                <tr key={s.item.id} style={{ background: index % 2 ? 'var(--t-color-gray1)' : c.bg, opacity: s.item.status === 'DISCONTINUED' ? 0.55 : 1 }}>
                  <td style={{ ...cell, color: c.text3, fontSize: 12 }}>{s.item.code}</td>
                  <td style={{ ...cell, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <button onClick={() => onOpen(s.item)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 500 }} title="Open history and usage">
                      {s.item.name}
                    </button>
                    <span style={{ color: c.text3, fontSize: 12 }}> · {s.item.specification}</span>
                  </td>
                  <td style={right}>
                    {s.balance === 0 ? (
                      <span style={{ color: c.text3 }}>none</span>
                    ) : (
                      <span style={{ fontWeight: 600, color: s.balance < 0 ? 'var(--t-color-red11)' : c.text }}>{cartonsAndUnits(s.balance, s.item)}</span>
                    )}
                    {/* Units in brackets only when the cartons hide them. */}
                    {s.item.unitsPerCarton > 1 && Math.abs(s.balance) >= s.item.unitsPerCarton ? (
                      <span style={{ color: c.text3, fontSize: 12 }}>
                        {' '}
                        ({qty(s.balance)} {s.item.unit})
                      </span>
                    ) : null}
                  </td>
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
                  <td style={right}>
                    {s.suggestedCartons ? (
                      <>
                        <span style={{ fontWeight: 600, color: 'var(--t-color-red11)' }}>{s.suggestedCartons} ctn</span>
                        <span style={{ color: c.text3, fontSize: 12 }}> · {rm(s.suggestedCost)}</span>
                      </>
                    ) : s.onOrder ? null : (
                      <span style={{ color: c.text3 }}>—</span>
                    )}
                    {s.onOrder ? <div style={{ fontSize: 12, color: 'var(--t-color-blue11)', fontWeight: 600 }}>{cartonsAndUnits(s.onOrder, s.item)} on order</div> : null}
                  </td>
                  <td style={cell}>
                    <Expiry s={s} today={today} />
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {s.item.status !== 'DISCONTINUED' ? (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <button onClick={() => onRecord('PURCHASE', s.item.id)} style={{ ...small, width: 28, justifyContent: 'center', padding: 0 }} title="Stock in (purchase)">
                          +
                        </button>
                        <button onClick={() => onRecord('TAKE', s.item.id)} style={{ ...small, width: 28, justifyContent: 'center', padding: 0 }} title="Take out">
                          −
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <span style={{ fontSize: 12, color: c.text3 }}>
        Click an item for its usage by month and IN/OUT history. The bar shows how long the stock lasts at next month&apos;s rate; the tick is the re-order level.
      </span>
    </>
  );
};
