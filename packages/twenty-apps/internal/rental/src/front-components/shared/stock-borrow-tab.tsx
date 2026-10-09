import { type CSSProperties, useState } from 'react';

import { c, Chip, control, primary, rm, small } from 'src/front-components/shared/stock-ui';
import { MONTHS } from 'src/shared/months';
import { cartonsAndUnits, type StockItem, type StockMovement, unitPrice } from 'src/shared/stock';
import { BORROW_STATUSES } from 'src/shared/stock-types';

// Stock lent to other branches: what each branch still owes, for how long,
// and how settled lendings were paid back (same item, another item, money).

type Show = 'OUTSTANDING' | 'SETTLED' | 'ALL';

const cell: CSSProperties = { fontSize: 13, padding: '8px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'left', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2, position: 'sticky', top: 0, zIndex: 1 };

const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const daysSince = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
const statusOf = (m: StockMovement) => m.borrowStatus ?? 'OUTSTANDING';

export const BorrowTab = ({
  items,
  movements,
  today,
  onSettle,
  onLend,
}: {
  items: StockItem[];
  movements: StockMovement[];
  today: string;
  onSettle: (borrow: StockMovement) => void;
  onLend: () => void;
}) => {
  const [show, setShow] = useState<Show>('OUTSTANDING');
  const byId = new Map(items.map((i) => [i.id, i]));
  const lent = movements.filter((m) => m.type === 'BORROW');
  const outstanding = lent.filter((m) => statusOf(m) === 'OUTSTANDING');
  const value = (m: StockMovement) => {
    const item = byId.get(m.itemId);

    return item ? m.quantity * unitPrice(item) : 0;
  };
  const settlements = new Map<string, StockMovement[]>();

  for (const m of movements) if (m.borrowId) settlements.set(m.borrowId, [...(settlements.get(m.borrowId) ?? []), m]);

  const rows = lent
    .filter((m) => show === 'ALL' || (show === 'OUTSTANDING' ? statusOf(m) === 'OUTSTANDING' : statusOf(m) !== 'OUTSTANDING'))
    .sort((a, b) => a.date.localeCompare(b.date));
  // One block per branch, the one owing the most first.
  const branches = [...new Set(rows.map((m) => m.party || 'Unknown branch'))]
    .map((name) => {
      const list = rows.filter((m) => (m.party || 'Unknown branch') === name);
      const owing = outstanding.filter((m) => (m.party || 'Unknown branch') === name);

      return { name, list, owing, owingValue: owing.reduce((sum, m) => sum + value(m), 0) };
    })
    .sort((a, b) => b.owingValue - a.owingValue || a.name.localeCompare(b.name));
  const oldest = outstanding.reduce<string | null>((min, m) => (!min || m.date < min ? m.date : min), null);

  const settledWith = (m: StockMovement) => {
    if (statusOf(m) === 'PAID') return 'Paid in money (see Transactions → Money in)';
    const parts = (settlements.get(m.id) ?? []).map((s) => {
      const other = byId.get(s.itemId);

      return `${day(s.date)}: ${other ? cartonsAndUnits(s.quantity, other) : s.quantity}${other && other.id !== m.itemId ? ` ${other.name}` : ''}`;
    });

    return parts.join(' · ');
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(
          [
            ['OUTSTANDING', `Outstanding (${outstanding.length})`],
            ['SETTLED', `Settled (${lent.length - outstanding.length})`],
            ['ALL', 'All'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} onClick={() => setShow(value)} style={{ ...control, fontWeight: show === value ? 600 : 400, borderColor: show === value ? c.accent : c.border2 }}>
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: c.text2 }}>
          Owed back <b style={{ color: outstanding.length ? 'var(--t-color-amber11)' : c.text }}>{rm(outstanding.reduce((sum, m) => sum + value(m), 0))}</b> at cost ·{' '}
          {new Set(outstanding.map((m) => m.party || 'Unknown branch')).size} branch{new Set(outstanding.map((m) => m.party)).size === 1 ? '' : 'es'}
          {oldest ? ` · oldest ${daysSince(oldest, today)} days` : ''}
        </span>
        <button onClick={onLend} style={primary}>
          + Lend to branch
        </button>
      </div>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, maxHeight: 'calc(100cqh - 230px)', minHeight: 200 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 900 }}>
          <thead>
            <tr>
              <th style={head}>Lent on</th>
              <th style={head}>Item</th>
              <th style={{ ...head, textAlign: 'right' }}>Quantity</th>
              <th style={{ ...head, textAlign: 'right' }}>Value</th>
              <th style={{ ...head, textAlign: 'right' }}>Days out</th>
              <th style={head}>Status</th>
              <th style={head}>Settled with · notes</th>
              <th style={{ ...head, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {branches.length ? null : (
              <tr>
                <td colSpan={8} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32, whiteSpace: 'normal' }}>
                  {show === 'OUTSTANDING' ? 'No branch owes you stock right now.' : 'Nothing here yet.'} Use “+ Lend to branch” when another branch borrows something.
                </td>
              </tr>
            )}
            {branches.map((b) => [
              <tr key={`b-${b.name}`}>
                <td colSpan={8} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600, fontSize: 12 }}>
                  {b.name}
                  <span style={{ fontWeight: 400, color: c.text3 }}>
                    {' '}
                    · {b.owing.length ? `${b.owing.length} outstanding · ${rm(b.owingValue)}` : 'nothing owed'}
                  </span>
                </td>
              </tr>,
              ...b.list.map((m, index) => {
                const item = byId.get(m.itemId);
                const status = BORROW_STATUSES.find((s) => s.value === statusOf(m)) ?? BORROW_STATUSES[0];
                const open = status.value === 'OUTSTANDING';
                const days = daysSince(m.date, today);

                return (
                  <tr key={m.id} style={{ background: index % 2 ? 'var(--t-color-gray1)' : c.bg, opacity: open ? 1 : 0.7 }}>
                    <td style={{ ...cell, color: c.text2 }}>{day(m.date)}</td>
                    <td style={{ ...cell, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }} title={item ? `${item.name} · ${item.specification}` : ''}>
                      <span style={{ fontWeight: 500 }}>{item?.name ?? 'Item removed'}</span>
                      {item?.code ? <span style={{ color: c.text3, fontSize: 12 }}> · {item.code}</span> : null}
                    </td>
                    <td style={{ ...right, fontWeight: 600 }}>{item ? cartonsAndUnits(m.quantity, item) : m.quantity}</td>
                    <td style={{ ...right, color: c.text2 }}>{rm(value(m))}</td>
                    <td style={{ ...right, fontWeight: open && days > 30 ? 600 : 400, color: !open ? c.text3 : days > 30 ? 'var(--t-color-red11)' : days > 14 ? 'var(--t-color-amber11)' : c.text }}>
                      {open ? `${days} d` : '—'}
                    </td>
                    <td style={cell}>
                      <Chip label={status.label} color={status.color} />
                    </td>
                    <td
                      style={{ ...cell, fontSize: 12, color: c.text3, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={[settledWith(m), m.notes].filter(Boolean).join(' · ')}
                    >
                      {settledWith(m) ? <span style={{ color: c.text2 }}>{settledWith(m)}</span> : null}
                      {settledWith(m) && m.notes ? ' · ' : ''}
                      {m.notes ? <i>{m.notes}</i> : null}
                      {!settledWith(m) && !m.notes ? '—' : null}
                    </td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      {open && item ? (
                        <button onClick={() => onSettle(m)} style={small}>
                          Settle
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      <span style={{ fontSize: 12, color: c.text3 }}>
        Value is at cost (carton price ÷ units). Settle a lending when the branch returns the same item, gives another item, or pays; a payment is recorded as income.
      </span>
    </>
  );
};
