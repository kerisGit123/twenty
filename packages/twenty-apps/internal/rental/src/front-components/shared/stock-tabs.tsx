import { useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { type DateRange, DateRangePicker } from 'src/front-components/shared/date-range-picker';
import { readValue } from 'src/front-components/shared/read-value';
import { stockAction } from 'src/front-components/shared/stock-forms';
import {
  c,
  Chip,
  control,
  FLAG,
  input,
  ItemCell,
  num,
  qty,
  rm,
  shortDate,
  small,
  Summary,
  Table,
  td,
  th,
} from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, type StockItem, type StockMovement, type StockStatus } from 'src/shared/stock';
import { BORROW_STATUSES, movementType } from 'src/shared/stock-types';

// The Stock page's tabs. Each gets the items/movements already cut down to
// the chosen workspace.

const csvUrl = (query: Record<string, string>) => new RestApiClient().resolveUrl('/s/stock/csv', { query });

// ---------------------------------------------------------------- Movements (history)

export const MovementsTab = ({ items, movements, today, onChanged }: { items: StockItem[]; movements: StockMovement[]; today: string; onChanged: () => void }) => {
  const [range, setRange] = useState<DateRange>(() => ({ from: `${today.slice(0, 7)}-01`, to: today, preset: 'custom' }));
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const q = query.trim().toLowerCase();
  const rows = movements
    .filter((m) => m.date >= range.from && m.date <= range.to && (!type || (type === 'IN' || type === 'OUT' ? movementType(m.type)?.direction === type : m.type === type)))
    .filter((m) => !q || `${byId.get(m.itemId)?.name ?? ''} ${m.party} ${m.reference} ${m.notes}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));

  const remove = async (m: StockMovement) => {
    const result = await stockAction({ action: 'deleteMovement', movementId: m.id });

    if (result.success) onChanged();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <DateRangePicker value={range} today={today} onChange={setRange} />
        <select value={type} onChange={(e) => setType(readValue(e))} style={control}>
          <option value="">All movements</option>
          <option value="IN">All IN</option>
          <option value="OUT">All OUT</option>
          {['PURCHASE', 'TAKE', 'BORROW', 'RETURN', 'EXCHANGE_IN', 'WASTE', 'ADJUST_IN', 'ADJUST_OUT'].map((t) => (
            <option key={t} value={t}>
              {movementType(t)?.label}
            </option>
          ))}
        </select>
        <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder="Search item, to/from, reference" style={{ ...input, width: 240 }} />
      </div>
      <Table
        empty="No stock movements in this period."
        head={
          <tr>
            <th style={th}>Date</th>
            <th style={th}>Movement</th>
            <th style={th}>Item</th>
            <th style={{ ...th, textAlign: 'right' }}>Quantity</th>
            <th style={th}>To / from</th>
            <th style={th}>Reference · notes</th>
            <th style={{ ...th, textAlign: 'right' }} />
          </tr>
        }
      >
        {rows.map((m) => {
          const item = byId.get(m.itemId);
          const t = movementType(m.type);

          return (
            <tr key={m.id}>
              <td style={{ ...td, whiteSpace: 'nowrap', color: c.text2 }}>{shortDate(m.date)}</td>
              <td style={td}>
                <Chip label={`${t?.direction === 'IN' ? '↓ IN' : '↑ OUT'} · ${t?.label ?? m.type}`} color={t?.color ?? 'gray'} />
                {m.type === 'BORROW' ? <div style={{ fontSize: 11, color: c.text3, marginTop: 4 }}>{BORROW_STATUSES.find((b) => b.value === (m.borrowStatus ?? 'OUTSTANDING'))?.label}</div> : null}
              </td>
              <td style={td}>{item ? <ItemCell item={item} /> : '—'}</td>
              <td style={{ ...num, color: t?.direction === 'IN' ? 'var(--t-color-green11)' : c.text }}>
                {t?.direction === 'IN' ? '+' : '−'}
                {item ? cartonsAndUnits(m.quantity, item) : qty(m.quantity)}
                {m.expiryDate ? <div style={{ fontSize: 11, color: c.text3 }}>exp {shortDate(m.expiryDate)}</div> : null}
              </td>
              <td style={{ ...td, color: c.text2 }}>{m.party || '—'}</td>
              <td style={{ ...td, color: c.text3, fontSize: 12 }}>{[m.reference, m.notes].filter(Boolean).join(' · ') || '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button onClick={() => remove(m)} style={{ ...small, color: 'var(--t-color-red11)' }} title="Remove (can be restored)">
                  Remove
                </button>
              </td>
            </tr>
          );
        })}
      </Table>
      <span style={{ fontSize: 12, color: c.text3 }}>Removing a line takes it out of every balance; it stays restorable from the deleted stock movements.</span>
    </>
  );
};

// ---------------------------------------------------------------- Order plan

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
  const rows = active.filter((s) => showAll || s.flag === 'ORDER' || s.flag === 'LOW' || edits[s.item.id]);
  const cartons = (s: StockStatus) => (edits[s.item.id] !== undefined ? Number(edits[s.item.id]) || 0 : s.suggestedCartons);
  const ordered = active.filter((s) => cartons(s) > 0);
  const total = ordered.reduce((sum, s) => sum + cartons(s) * s.item.cartonPrice, 0);

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
        <button onClick={() => setShowAll(!showAll)} style={{ ...small, height: 34, fontWeight: showAll ? 600 : 400, borderColor: showAll ? c.accent : c.border2 }}>
          {showAll ? 'Showing all items' : 'Show all items'}
        </button>
        <a href={csvUrl({ kind: 'order', ...(ownerId ? { owner: ownerId } : {}) })} target="_blank" rel="noreferrer" style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          ⬇ CSV
        </a>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Summary label="Order total" value={rm(total)} note={`${ordered.length} item${ordered.length === 1 ? '' : 's'}, ${ordered.reduce((sum, s) => sum + cartons(s), 0)} cartons`} color="var(--t-color-blue11)" />
        <Summary label="Forecast use next month" value={rm(active.reduce((sum, s) => sum + s.forecast * (s.item.cartonPrice / (s.item.unitsPerCarton || 1)), 0))} note="At cost" />
      </div>
      <Table
        empty="Nothing needs ordering. Use “Show all items” to order anyway."
        minWidth={940}
        head={
          <tr>
            <th style={th}>Item</th>
            <th style={{ ...th, textAlign: 'right' }}>In hand</th>
            <th style={{ ...th, textAlign: 'right' }}>Forecast next month</th>
            <th style={{ ...th, textAlign: 'right' }}>Lasts</th>
            <th style={th}>Status</th>
            <th style={{ ...th, textAlign: 'right' }}>Order (ctn)</th>
            <th style={{ ...th, textAlign: 'right' }}>Carton price</th>
            <th style={{ ...th, textAlign: 'right' }}>Cost</th>
          </tr>
        }
      >
        {rows.map((s) => (
          <tr key={s.item.id}>
            <td style={td}>
              <ItemCell item={s.item} />
            </td>
            <td style={num}>{cartonsAndUnits(s.balance, s.item)}</td>
            <td style={num}>{s.forecast ? `${qty(s.forecast)} ${s.item.unit}` : '—'}</td>
            <td style={num}>{s.monthsLeft === null ? '—' : `${qty(s.monthsLeft)} mo`}</td>
            <td style={td}>
              <Chip {...(FLAG[s.flag] ?? FLAG.OK)} />
            </td>
            <td style={num}>
              <input
                value={edits[s.item.id] ?? String(s.suggestedCartons || '')}
                onChange={(e) => setEdits({ ...edits, [s.item.id]: readValue(e) })}
                inputMode="numeric"
                placeholder="0"
                style={{ ...input, width: 64, textAlign: 'right' }}
              />
              {cartons(s) ? <div style={{ fontSize: 11, color: c.text3 }}>= {qty(cartons(s) * s.item.unitsPerCarton)} {s.item.unit}</div> : null}
            </td>
            <td style={num}>{rm(s.item.cartonPrice)}</td>
            <td style={{ ...num, fontWeight: 600 }}>{cartons(s) ? rm(cartons(s) * s.item.cartonPrice) : '—'}</td>
          </tr>
        ))}
      </Table>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => onOrder(ordered.map((s) => ({ itemId: s.item.id, units: cartons(s) * s.item.unitsPerCarton })))}
          disabled={!ordered.length}
          style={{ ...control, background: c.accent, borderColor: c.accent, color: 'white', fontWeight: 600, opacity: ordered.length ? 1 : 0.5 }}
        >
          Goods arrived: record as purchase
        </button>
        <span style={{ fontSize: 12, color: c.text3 }}>Opens the purchase form with these lines; check the quantities and expiry dates against the delivery.</span>
      </div>
    </>
  );
};

// ---------------------------------------------------------------- Borrowed

export const BorrowTab = ({ items, movements, onSettle }: { items: StockItem[]; movements: StockMovement[]; onSettle: (borrow: StockMovement) => void }) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  const lent = movements.filter((m) => m.type === 'BORROW').sort((a, b) => ((a.borrowStatus ?? 'OUTSTANDING') === 'OUTSTANDING' ? -1 : 1) - ((b.borrowStatus ?? 'OUTSTANDING') === 'OUTSTANDING' ? -1 : 1) || b.date.localeCompare(a.date));
  const settlements = new Map<string, StockMovement[]>();

  for (const m of movements) if (m.borrowId) settlements.set(m.borrowId, [...(settlements.get(m.borrowId) ?? []), m]);

  return (
    <>
      <span style={{ fontSize: 13, color: c.text2 }}>Stock lent to other branches. Settle each one when it comes back, is exchanged for another item, or is paid for.</span>
      <Table
        empty="Nothing lent out. Record a lending with Record in/out → OUT · Lent to branch."
        head={
          <tr>
            <th style={th}>Lent on</th>
            <th style={th}>Branch</th>
            <th style={th}>Item</th>
            <th style={{ ...th, textAlign: 'right' }}>Quantity</th>
            <th style={th}>Status</th>
            <th style={th}>Settled with</th>
            <th style={{ ...th, textAlign: 'right' }} />
          </tr>
        }
      >
        {lent.map((m) => {
          const item = byId.get(m.itemId);
          const status = BORROW_STATUSES.find((b) => b.value === (m.borrowStatus ?? 'OUTSTANDING')) ?? BORROW_STATUSES[0];

          return (
            <tr key={m.id}>
              <td style={{ ...td, whiteSpace: 'nowrap', color: c.text2 }}>{shortDate(m.date)}</td>
              <td style={td}>{m.party || '—'}</td>
              <td style={td}>{item ? <ItemCell item={item} /> : '—'}</td>
              <td style={num}>{item ? cartonsAndUnits(m.quantity, item) : qty(m.quantity)}</td>
              <td style={td}>
                <Chip label={status.label} color={status.color} />
              </td>
              <td style={{ ...td, fontSize: 12, color: c.text3 }}>
                {(settlements.get(m.id) ?? []).map((s) => {
                  const other = byId.get(s.itemId);

                  return (
                    <div key={s.id}>
                      {shortDate(s.date)}: {other ? cartonsAndUnits(s.quantity, other) : qty(s.quantity)} {other && other.id !== m.itemId ? other.name : ''}
                    </div>
                  );
                })}
                {m.borrowStatus === 'PAID' ? 'Paid: see Transactions → Money in' : null}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                {status.value === 'OUTSTANDING' && item ? (
                  <button onClick={() => onSettle(m)} style={small}>
                    Settle
                  </button>
                ) : null}
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
};

