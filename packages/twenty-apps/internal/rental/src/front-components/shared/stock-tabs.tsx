import { useMemo, useState } from 'react';

import { type DateRange, DateRangePicker } from 'src/front-components/shared/date-range-picker';
import { readValue } from 'src/front-components/shared/read-value';
import { stockAction } from 'src/front-components/shared/stock-forms';
import {
  c,
  Chip,
  control,
  input,
  ItemCell,
  num,
  qty,
  shortDate,
  small,
  Table,
  td,
  th,
} from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, type StockItem, type StockMovement, wasteReasonOf } from 'src/shared/stock';
import { BORROW_STATUSES, movementType, wasteReasonLabel } from 'src/shared/stock-types';

// The Stock page's tabs. Each gets the items/movements already cut down to
// the chosen workspace.


// ---------------------------------------------------------------- Movements (history)

export const MovementsTab = ({
  items,
  movements,
  today,
  onChanged,
  mayManage,
}: {
  items: StockItem[];
  movements: StockMovement[];
  today: string;
  onChanged: () => void;
  mayManage: (ownerId: string | null) => boolean;
}) => {
  const [range, setRange] = useState<DateRange>(() => ({ from: `${today.slice(0, 7)}-01`, to: today, preset: 'custom' }));
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const q = query.trim().toLowerCase();
  const rows = movements
    .filter((m) => m.date >= range.from && m.date <= range.to && (!type || (type === 'IN' || type === 'OUT' ? movementType(m.type)?.direction === type : m.type === type)))
    .filter((m) => !q || `${byId.get(m.itemId)?.name ?? ''} ${m.party} ${m.reference} ${m.notes}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));

  // First tap asks "Sure?", the second removes; nothing fires twice.
  const [armed, setArmed] = useState('');
  const [removing, setRemoving] = useState('');
  const remove = async (m: StockMovement) => {
    if (armed !== m.id) {
      setArmed(m.id);

      return;
    }
    setRemoving(m.id);
    const result = await stockAction({ action: 'deleteMovement', movementId: m.id });

    setRemoving('');
    setArmed('');
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
          {['PURCHASE', 'TAKE', 'BORROW', 'BORROW_IN', 'RETURN', 'EXCHANGE_IN', 'GIVE_BACK', 'LOAN_SETTLED', 'WASTE', 'ADJUST_IN', 'ADJUST_OUT'].map((t) => (
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
            <th style={th}>By</th>
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
                {m.type === 'BORROW' || m.type === 'BORROW_IN' ? <div style={{ fontSize: 11, color: c.text3, marginTop: 4 }}>{BORROW_STATUSES.find((b) => b.value === (m.borrowStatus ?? 'OUTSTANDING'))?.label}</div> : null}
              </td>
              <td style={td}>{item ? <ItemCell item={item} /> : '—'}</td>
              <td style={{ ...num, color: t?.direction === 'IN' ? 'var(--t-color-green11)' : c.text }}>
                {m.type === 'LOAN_SETTLED' ? (
                  <>
                    {m.amount ? `paid RM ${m.amount.toFixed(2)}` : 'settled'}
                    {m.settlesUnits && item ? <div style={{ fontSize: 11, color: c.text3 }}>covers {cartonsAndUnits(m.settlesUnits, item)}</div> : null}
                  </>
                ) : (
                  <>
                    {t?.direction === 'IN' ? '+' : '−'}
                    {item ? cartonsAndUnits(m.quantity, item) : qty(m.quantity)}
                  </>
                )}
                {m.expiryDate ? <div style={{ fontSize: 11, color: c.text3 }}>exp {shortDate(m.expiryDate)}</div> : null}
              </td>
              <td style={{ ...td, color: c.text2 }}>{wasteReasonLabel(wasteReasonOf(m)) || m.party || '—'}</td>
              <td style={{ ...td, color: c.text3, fontSize: 12 }}>{[m.reference, m.notes].filter(Boolean).join(' · ') || '—'}</td>
              <td style={{ ...td, color: c.text2, fontSize: 12, whiteSpace: 'nowrap' }}>{m.recordedBy || '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                {mayManage(m.ownerId) ? (
                  <button onClick={() => remove(m)} disabled={removing === m.id} style={{ ...small, color: 'var(--t-color-red11)', fontWeight: armed === m.id ? 600 : 400 }} title="Remove (can be restored)">
                    {removing === m.id ? 'Removing…' : armed === m.id ? 'Sure? Tap again' : 'Remove'}
                  </button>
                ) : null}
              </td>
            </tr>
          );
        })}
      </Table>
      <span style={{ fontSize: 12, color: c.text3 }}>Removing a line takes it out of every balance; it stays restorable from the deleted stock movements.</span>
    </>
  );
};
