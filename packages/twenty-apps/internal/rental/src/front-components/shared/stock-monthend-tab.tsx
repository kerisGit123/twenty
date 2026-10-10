import { type CSSProperties, useMemo, useState } from 'react';

import { Sheet } from 'src/front-components/shared/sheet';
import { YearGrid } from 'src/front-components/shared/stock-year-grid';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, Chip, control, ExcelButton, monthLabel, primary, rm, small, withOwner } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { type MonthEndRow, monthEndRows, type StockItem, type StockMovement } from 'src/shared/stock';

// Month end: each month's opening and closing stock (value), what came in
// and went out, and closing a month so nothing dated in it can change.

const cell: CSSProperties = { fontSize: 13, padding: '9px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2 };

const monthEndDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

export const MonthEndTab = ({
  items,
  movementsByItem,
  owner,
  today,
  onStockTake,
  onChanged,
}: {
  items: StockItem[];
  movementsByItem: Map<string, StockMovement[]>;
  owner: StockOwner | null; // null = all workspaces (view only)
  today: string;
  onStockTake: (date: string) => void;
  onChanged: () => void;
}) => {
  const [view, setView] = useState<'products' | 'months'>('products');
  const [closing, setClosing] = useState<MonthEndRow | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => monthEndRows(items, movementsByItem, today.slice(0, 7)).reverse(), [items, movementsByItem, today]);
  const lockedThrough = owner?.lockedThrough ?? null;
  const isClosed = (month: string) => !!lockedThrough && monthEndDay(month) <= lockedThrough;
  // The month to close next: the oldest finished month that is still open.
  const nextToClose = [...rows].reverse().find((r) => !isClosed(r.month) && monthEndDay(r.month) < today)?.month ?? null;
  const latestClosed = rows.find((r) => isClosed(r.month))?.month ?? null;

  const close = async (row: MonthEndRow) => {
    if (!owner) return;
    setBusy(true);
    const result = await stockAction({ action: 'closeMonth', ownerId: owner.id, month: row.month });

    setBusy(false);
    if (result.success) {
      setClosing(null);
      onChanged();
    }
  };

  const reopen = async () => {
    if (!owner) return;
    if ((await stockAction({ action: 'reopenMonth', ownerId: owner.id })).success) onChanged();
  };

  return (
    <>
      {closing ? (
        <Sheet width={480} onClose={() => setClosing(null)}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Close {monthLabel(closing.month)}?</span>
            <span style={{ fontSize: 13, color: c.text2 }}>
              Closing value <b>{rm(closing.closingValue)}</b> becomes the fixed opening of {monthLabel(new Date(Date.parse(`${closing.month}-01T00:00:00Z`) + 32 * 86_400_000).toISOString().slice(0, 7))}. After closing, nobody can add, change or remove stock IN/OUT dated on or before{' '}
              {monthEndDay(closing.month)} in {owner?.name}.
            </span>
            {!closing.counted ? (
              <div style={{ background: 'var(--t-color-amber2)', border: '1px solid var(--t-color-amber6)', borderRadius: c.radius, padding: 10, fontSize: 13, color: 'var(--t-color-amber11)' }}>
                No stock take was saved in this month. Counting first makes the closing match the shelf.
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => setClosing(null)} style={control}>
                Cancel
              </button>
              {!closing.counted ? (
                <button
                  onClick={() => {
                    setClosing(null);
                    onStockTake(monthEndDay(closing.month));
                  }}
                  style={control}
                >
                  Stock take first
                </button>
              ) : null}
              <button onClick={() => close(closing)} disabled={busy} style={{ ...primary, opacity: busy ? 0.5 : 1 }}>
                {busy ? 'Closing…' : `🔒 Close ${monthLabel(closing.month)}`}
              </button>
            </div>
          </div>
        </Sheet>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
          {(
            [
              ['products', 'By product · Jan–Dec'],
              ['months', 'Summary by month'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setView(value)}
              style={{ ...control, border: 'none', borderRadius: 0, fontWeight: view === value ? 600 : 400, background: view === value ? 'var(--t-color-blue2)' : c.bg, color: view === value ? 'var(--t-color-blue11)' : c.text }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, color: c.text2 }}>
          {owner
            ? lockedThrough
              ? <>🔒 {owner.name} is closed up to <b>{monthLabel(lockedThrough.slice(0, 7))}</b>. Stock dated on or before {lockedThrough} can&apos;t change.</>
              : <>No month is closed yet in {owner.name}.</>
            : 'Pick a workspace (top right) to close months; each workspace closes its own.'}
        </span>
        <span style={{ flex: 1 }} />
        {view === 'months' ? <ExcelButton query={withOwner({ kind: 'xlsx-monthend' }, owner?.id ?? '')} title="Month-end summary as an Excel file" /> : null}
      </div>

      {view === 'products' ? <YearGrid items={items} movementsByItem={movementsByItem} today={today} ownerId={owner?.id ?? ''} /> : null}
      {view === 'months' ? (
        <>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Month</th>
              <th style={head}>Opening</th>
              <th style={{ ...head, color: 'var(--t-color-green11)' }}>+ Purchased</th>
              <th style={{ ...head, color: 'var(--t-color-green11)' }}>+ Other in</th>
              <th style={{ ...head, color: 'var(--t-color-blue11)' }}>− Used</th>
              <th style={{ ...head, color: 'var(--t-color-red11)' }}>− Waste</th>
              <th style={{ ...head, color: 'var(--t-color-blue11)' }}>− Lent / count</th>
              <th style={head}>Closing</th>
              <th style={{ ...head, textAlign: 'left' }}>Stock take</th>
              <th style={{ ...head, textAlign: 'left' }}>Status</th>
              <th style={head} />
            </tr>
          </thead>
          <tbody>
            {rows.length ? null : (
              <tr>
                <td colSpan={11} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32 }}>
                  No stock recorded yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const closed = isClosed(r.month);
              const current = r.month === today.slice(0, 7);

              return (
                <tr key={r.month} style={{ background: closed ? 'var(--t-color-gray1)' : c.bg }}>
                  <td style={{ ...cell, fontWeight: 600 }}>{monthLabel(r.month)}</td>
                  <td style={{ ...right, color: c.text2 }}>{rm(r.openingValue)}</td>
                  <td style={{ ...right, color: 'var(--t-color-green11)' }}>{r.purchasedValue ? `+${rm(r.purchasedValue)}` : '—'}</td>
                  <td style={{ ...right, color: 'var(--t-color-green11)' }}>{r.otherInValue ? `+${rm(r.otherInValue)}` : '—'}</td>
                  <td style={{ ...right, color: 'var(--t-color-blue11)' }}>{r.usedValue ? `−${rm(r.usedValue)}` : '—'}</td>
                  <td style={{ ...right, color: 'var(--t-color-red11)' }}>{r.wasteValue ? `−${rm(r.wasteValue)}` : '—'}</td>
                  <td style={{ ...right, color: 'var(--t-color-blue11)' }}>{r.otherOutValue ? `−${rm(r.otherOutValue)}` : '—'}</td>
                  <td style={{ ...right, fontWeight: 700 }}>{rm(r.closingValue)}</td>
                  <td style={{ ...cell, color: r.counted ? 'var(--t-color-green11)' : c.text3, fontSize: 12 }}>{r.counted ? '✓ counted' : 'not counted'}</td>
                  <td style={cell}>
                    {closed ? <Chip label="🔒 Closed" color="gray" /> : current ? <Chip label="This month" color="blue" /> : <Chip label="Open" color="orange" />}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {owner && r.month === nextToClose ? (
                      <button onClick={() => setClosing(r)} style={primary}>
                        Close month
                      </button>
                    ) : null}
                    {owner && r.month === latestClosed ? (
                      <button onClick={reopen} style={small} title="Open the latest closed month again for corrections">
                        Reopen
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span style={{ fontSize: 12, color: c.text3 }}>
        Values at each item&apos;s carton price ÷ units. Opening = the previous month&apos;s closing. Close months in order, after the month is over.
      </span>
        </>
      ) : null}
    </>
  );
};
