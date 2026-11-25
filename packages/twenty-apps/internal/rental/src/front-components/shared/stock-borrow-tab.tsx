import { type CSSProperties, useState } from 'react';

import { useNarrow } from 'src/front-components/shared/use-narrow';
import { L, tr } from 'src/front-components/shared/stock-i18n';
import { c, Chip, control, ExcelButton, primary, rm, small, withOwner } from 'src/front-components/shared/stock-ui';
import { MONTHS } from 'src/shared/months';
import { cartonsAndUnits, loanRemaining, type StockItem, type StockMovement, unitValue } from 'src/shared/stock';
import { BORROW_STATUSES } from 'src/shared/stock-types';

// Loans between shops. Lent out: stock another shop borrowed from us, and what it
// still owes. Borrowed in: stock we borrowed from another shop, and what we still
// owe. Either is settled with the same item, another item or money, all at once
// or in parts.

type Show = 'OUTSTANDING' | 'SETTLED' | 'ALL';
type Direction = 'LENT' | 'BORROWED';

const cell: CSSProperties = { fontSize: 13, padding: '8px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'left', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2, position: 'sticky', top: 0, zIndex: 1 };

const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const daysSince = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
const statusOf = (m: StockMovement) => m.borrowStatus ?? 'OUTSTANDING';
const UNKNOWN = 'Unknown shop';

export const BorrowTab = ({
  items,
  movements,
  today,
  ownerId,
  onSettle,
  onLend,
  onBorrowIn,
}: {
  items: StockItem[];
  movements: StockMovement[];
  today: string;
  ownerId: string;
  onSettle: (borrow: StockMovement) => void;
  onLend: () => void;
  onBorrowIn: () => void;
}) => {
  const narrow = useNarrow();
  const openCount = (type: string) => movements.filter((m) => m.type === type && statusOf(m) === 'OUTSTANDING').length;
  // Start on the side that has something open.
  const [dir, setDir] = useState<Direction>(() => (openCount('BORROW') === 0 && openCount('BORROW_IN') > 0 ? 'BORROWED' : 'LENT'));
  const [show, setShow] = useState<Show>('OUTSTANDING');
  const borrowedIn = dir === 'BORROWED';
  const byId = new Map(items.map((i) => [i.id, i]));
  const loans = movements.filter((m) => m.type === (borrowedIn ? 'BORROW_IN' : 'BORROW'));
  const outstanding = loans.filter((m) => statusOf(m) === 'OUTSTANDING');
  const leftOf = (m: StockMovement) => loanRemaining(m, movements);
  const value = (m: StockMovement, units: number) => {
    const item = byId.get(m.itemId);

    return item ? units * unitValue(item) : 0;
  };
  const settlements = new Map<string, StockMovement[]>();

  for (const m of movements) if (m.borrowId) settlements.set(m.borrowId, [...(settlements.get(m.borrowId) ?? []), m]);

  const rows = loans
    .filter((m) => show === 'ALL' || (show === 'OUTSTANDING' ? statusOf(m) === 'OUTSTANDING' : statusOf(m) !== 'OUTSTANDING'))
    .sort((a, b) => a.date.localeCompare(b.date));
  // One block per shop, the one with the most open first.
  const shops = [...new Set(rows.map((m) => m.party || UNKNOWN))]
    .map((name) => {
      const list = rows.filter((m) => (m.party || UNKNOWN) === name);
      const open = outstanding.filter((m) => (m.party || UNKNOWN) === name);

      return { name, list, open, openValue: open.reduce((sum, m) => sum + value(m, leftOf(m)), 0) };
    })
    .sort((a, b) => b.openValue - a.openValue || a.name.localeCompare(b.name));
  const oldest = outstanding.reduce<string | null>((min, m) => (!min || m.date < min ? m.date : min), null);
  const openValue = outstanding.reduce((sum, m) => sum + value(m, leftOf(m)), 0);
  const shopCount = new Set(outstanding.map((m) => m.party || UNKNOWN)).size;

  // What settled the loan so far: items back or exchanged, and any cash with its note.
  const settledWith = (m: StockMovement) => {
    const lines = [...(settlements.get(m.id) ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const parts = lines.flatMap((s) => {
      // A line left on this item by an exchange: the other item's line already shows it.
      if (s.type === 'LOAN_SETTLED') return s.amount ? [`${day(s.date)}: ${L('paid', 'bayar')} ${rm(s.amount)}${s.notes ? ` (${s.notes})` : ''}`] : [];
      const other = byId.get(s.itemId);

      return [`${day(s.date)}: ${other ? cartonsAndUnits(s.quantity, other) : s.quantity}${other && other.id !== m.itemId ? ` ${other.name}` : ''}`];
    });

    if (!parts.length && statusOf(m) === 'PAID') return tr('Paid in money (see Transactions)');

    return parts.join(' · ');
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(
          [
            ['LENT', L(`Lent to shops (${openCount('BORROW')})`, `Dipinjamkan kepada kedai (${openCount('BORROW')})`)],
            ['BORROWED', L(`Borrowed from shops (${openCount('BORROW_IN')})`, `Dipinjam daripada kedai (${openCount('BORROW_IN')})`)],
          ] as const
        ).map(([value, label]) => (
          <button key={value} onClick={() => setDir(value)} style={{ ...control, fontWeight: dir === value ? 600 : 400, borderColor: dir === value ? c.accent : c.border2 }}>
            {label}
          </button>
        ))}
        <span style={{ width: 8 }} />
        {(
          [
            ['OUTSTANDING', L(`Open (${outstanding.length})`, `Terbuka (${outstanding.length})`)],
            ['SETTLED', L(`Settled (${loans.length - outstanding.length})`, `Selesai (${loans.length - outstanding.length})`)],
            ['ALL', tr('All')],
          ] as const
        ).map(([value, label]) => (
          <button key={value} onClick={() => setShow(value)} style={{ ...small, height: 34, fontWeight: show === value ? 600 : 400, borderColor: show === value ? c.accent : c.border2 }}>
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: c.text2 }}>
          {borrowedIn ? tr('You owe') : tr('Owed back')} <b style={{ color: outstanding.length ? 'var(--t-color-amber11)' : c.text }}>{rm(openValue)}</b> {L('at cost', 'pada kos')} · {L(`${shopCount} shop${shopCount === 1 ? '' : 's'}`, `${shopCount} kedai`)}
          {oldest ? L(` · oldest ${daysSince(oldest, today)} days`, ` · paling lama ${daysSince(oldest, today)} hari`) : ''}
        </span>
        <ExcelButton query={withOwner({ kind: 'xlsx-borrowed' }, ownerId)} title={tr('Loans (lent and borrowed) as an Excel file')} />
        <button onClick={borrowedIn ? onBorrowIn : onLend} style={primary}>
          {borrowedIn ? tr('+ Borrowed in') : tr('+ Lent out')}
        </button>
      </div>

      {narrow ? (
        // A phone: one card per loan, with a big Settle button.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shops.length ? null : (
            <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 20, textAlign: 'center', color: c.text3, fontSize: 13 }}>
              {show === 'OUTSTANDING' ? (borrowedIn ? tr('You owe no shop any stock right now.') : tr('No shop owes you stock right now.')) : tr('Nothing here yet.')}{' '}
              {borrowedIn ? tr('Tap “+ Borrowed in” when you receive stock lent by another shop.') : tr('Tap “+ Lent out” when another shop borrows something.')}
            </div>
          )}
          {shops.map((b) => (
            <div key={b.name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {b.name === UNKNOWN ? tr(UNKNOWN) : b.name}
                <span style={{ fontWeight: 400, color: c.text3 }}> · {b.open.length ? L(`${b.open.length} open · ${rm(b.openValue)}`, `${b.open.length} terbuka · ${rm(b.openValue)}`) : borrowedIn ? tr('you owe nothing') : tr('nothing owed')}</span>
              </div>
              {b.list.map((m) => {
                const item = byId.get(m.itemId);
                const status = BORROW_STATUSES.find((s) => s.value === statusOf(m)) ?? BORROW_STATUSES[0];
                const open = status.value === 'OUTSTANDING';
                const left = leftOf(m);
                const part = open && left < m.quantity;
                const days = daysSince(m.date, today);
                const settled = settledWith(m);

                return (
                  <div key={m.id} style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: c.bg, opacity: open ? 1 : 0.7 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{item?.name ?? tr('Item removed')}</div>
                        <div style={{ fontSize: 12, color: c.text3 }}>
                          {[item?.code, `${borrowedIn ? tr('borrowed') : tr('lent')} ${day(m.date)}`].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <Chip label={part ? tr('Part settled') : tr(status.label)} color={part ? 'orange' : status.color} />
                    </div>
                    <div style={{ fontSize: 14 }}>
                      {open ? (
                        <>
                          <b>{item ? cartonsAndUnits(left, item) : left}</b> {tr('still open')}
                          <span style={{ color: c.text3 }}>
                            {part ? L(` of ${item ? cartonsAndUnits(m.quantity, item) : m.quantity}`, ` daripada ${item ? cartonsAndUnits(m.quantity, item) : m.quantity}`) : ''} · {rm(value(m, left))} ·{' '}
                            <span style={{ color: days > 30 ? 'var(--t-color-red11)' : days > 14 ? 'var(--t-color-amber11)' : undefined }}>{L(`${days} days`, `${days} hari`)}</span>
                          </span>
                        </>
                      ) : (
                        <span style={{ color: c.text2 }}>{item ? cartonsAndUnits(m.quantity, item) : m.quantity}</span>
                      )}
                    </div>
                    {settled || m.notes ? (
                      <div style={{ fontSize: 12, color: c.text3 }}>
                        {settled}
                        {settled && m.notes ? ' · ' : ''}
                        {m.notes ? <i>{m.notes}</i> : null}
                      </div>
                    ) : null}
                    {open && item ? (
                      <button onClick={() => onSettle(m)} style={{ ...primary, height: 44, fontSize: 15 }}>
                        {tr('Settle')}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, maxHeight: 'calc(100cqh - 230px)', minHeight: 200 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
          <thead>
            <tr>
              <th style={head}>{borrowedIn ? tr('Borrowed on') : tr('Lent on')}</th>
              <th style={head}>{tr('Item')}</th>
              <th style={{ ...head, textAlign: 'right' }}>{tr('Quantity')}</th>
              <th style={{ ...head, textAlign: 'right' }}>{tr('Still open')}</th>
              <th style={{ ...head, textAlign: 'right' }}>{tr('Value open')}</th>
              <th style={{ ...head, textAlign: 'right' }}>{tr('Days out')}</th>
              <th style={head}>{tr('Status')}</th>
              <th style={head}>{tr('Settled with · notes')}</th>
              <th style={{ ...head, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {shops.length ? null : (
              <tr>
                <td colSpan={9} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32, whiteSpace: 'normal' }}>
                  {show === 'OUTSTANDING' ? (borrowedIn ? tr('You owe no shop any stock right now.') : tr('No shop owes you stock right now.')) : tr('Nothing here yet.')}{' '}
                  {borrowedIn ? tr('Use “+ Borrowed in” when you receive stock lent by another shop.') : tr('Use “+ Lent out” when another shop borrows something.')}
                </td>
              </tr>
            )}
            {shops.map((b) => [
              <tr key={`b-${b.name}`}>
                <td colSpan={9} style={{ ...cell, background: 'var(--t-color-gray2)', fontWeight: 600, fontSize: 12 }}>
                  {b.name === UNKNOWN ? tr(UNKNOWN) : b.name}
                  <span style={{ fontWeight: 400, color: c.text3 }}>
                    {' '}
                    · {b.open.length ? L(`${b.open.length} open · ${rm(b.openValue)}`, `${b.open.length} terbuka · ${rm(b.openValue)}`) : borrowedIn ? tr('you owe nothing') : tr('nothing owed')}
                  </span>
                </td>
              </tr>,
              ...b.list.map((m, index) => {
                const item = byId.get(m.itemId);
                const status = BORROW_STATUSES.find((s) => s.value === statusOf(m)) ?? BORROW_STATUSES[0];
                const open = status.value === 'OUTSTANDING';
                const left = leftOf(m);
                const part = open && left < m.quantity;
                const days = daysSince(m.date, today);
                const settled = settledWith(m);

                return (
                  <tr key={m.id} style={{ background: index % 2 ? 'var(--t-color-gray1)' : c.bg, opacity: open ? 1 : 0.7 }}>
                    <td style={{ ...cell, color: c.text2 }}>{day(m.date)}</td>
                    <td style={{ ...cell, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }} title={item ? `${item.name} · ${item.specification}` : ''}>
                      <span style={{ fontWeight: 500 }}>{item?.name ?? tr('Item removed')}</span>
                      {item?.code ? <span style={{ color: c.text3, fontSize: 12 }}> · {item.code}</span> : null}
                    </td>
                    <td style={{ ...right, color: part ? c.text3 : undefined, fontWeight: part ? 400 : 600 }}>{item ? cartonsAndUnits(m.quantity, item) : m.quantity}</td>
                    <td style={{ ...right, fontWeight: 600 }}>{open ? (item ? cartonsAndUnits(left, item) : left) : '—'}</td>
                    <td style={{ ...right, color: c.text2 }}>{open ? rm(value(m, left)) : '—'}</td>
                    <td style={{ ...right, fontWeight: open && days > 30 ? 600 : 400, color: !open ? c.text3 : days > 30 ? 'var(--t-color-red11)' : days > 14 ? 'var(--t-color-amber11)' : c.text }}>
                      {open ? L(`${days} d`, `${days} h`) : '—'}
                    </td>
                    <td style={cell}>
                      <Chip label={part ? tr('Part settled') : tr(status.label)} color={part ? 'orange' : status.color} />
                    </td>
                    <td style={{ ...cell, fontSize: 12, color: c.text3, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }} title={[settled, m.notes].filter(Boolean).join(' · ')}>
                      {settled ? <span style={{ color: c.text2 }}>{settled}</span> : null}
                      {settled && m.notes ? ' · ' : ''}
                      {m.notes ? <i>{m.notes}</i> : null}
                      {!settled && !m.notes ? '—' : null}
                    </td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      {open && item ? (
                        <button onClick={() => onSettle(m)} style={small}>
                          {tr('Settle')}
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
      )}
      <span style={{ fontSize: 12, color: c.text3 }}>
        {borrowedIn
          ? L(
              'Value is at cost (carton price ÷ units). Settle a borrowing when you give the same item back, give another item, or pay. Giving stock back takes it out of your stock automatically; a payment is saved on the loan and recorded as an expense. Stock you still owe is not counted as yours when working out what to re-order.',
              'Nilai ialah pada kos (harga karton ÷ unit). Selesaikan pinjaman apabila anda pulangkan produk yang sama, beri produk lain, atau bayar. Stok yang dipulangkan ditolak daripada stok anda secara automatik; bayaran disimpan pada pinjaman dan direkodkan sebagai perbelanjaan. Stok yang masih anda hutang tidak dikira milik anda semasa mengira apa yang perlu dipesan semula.',
            )
          : L(
              'Value is at cost (carton price ÷ units). Settle a lending when the shop returns the same item, gives another item, or pays. Returned stock is added back automatically; a payment is saved on the loan and recorded as income.',
              'Nilai ialah pada kos (harga karton ÷ unit). Selesaikan pinjaman apabila kedai memulangkan produk yang sama, beri produk lain, atau membayar. Stok yang dipulangkan ditambah semula secara automatik; bayaran disimpan pada pinjaman dan direkodkan sebagai pendapatan.',
            )}
      </span>
    </>
  );
};
