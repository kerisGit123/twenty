import { type CSSProperties, useMemo, useState } from 'react';

import { Sheet } from 'src/front-components/shared/sheet';
import { YearGrid } from 'src/front-components/shared/stock-year-grid';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, Chip, control, ExcelButton, monthLabel, primary, rm, small, withOwner } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { type MonthEndRow, monthEndRows, type StockItem, type StockMovement } from 'src/shared/stock';
import { WASTE_REASONS } from 'src/shared/stock-types';
import { getLang, L, tr } from 'src/front-components/shared/stock-i18n';

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
  canClose,
  today,
  onStockTake,
  onChanged,
}: {
  items: StockItem[];
  movementsByItem: Map<string, StockMovement[]>;
  owner: StockOwner | null; // null = all workspaces (view only)
  canClose: boolean; // admins and the workspace's hosts
  today: string;
  onStockTake: (date: string) => void;
  onChanged: () => void;
}) => {
  // Opens on the month list: that is where a month is closed. The product grid is one tap away.
  const [view, setView] = useState<'products' | 'months'>('months');
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
              This locks the month. You can still open the latest closed month again if you need to correct something. Closing value <b>{rm(closing.closingValue)}</b> becomes the fixed opening of {monthLabel(new Date(Date.parse(`${closing.month}-01T00:00:00Z`) + 32 * 86_400_000).toISOString().slice(0, 7))}. After closing, nobody can add, change or remove stock IN/OUT dated on or before{' '}
              {monthEndDay(closing.month)} in {owner?.name}.
            </span>
            {!closing.counted ? (
              <div style={{ background: 'var(--t-color-amber2)', border: '1px solid var(--t-color-amber6)', borderRadius: c.radius, padding: 10, fontSize: 13, color: 'var(--t-color-amber11)' }}>
                No count was saved in this month. Counting first makes the closing match the shelf.
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
                  Count first
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
              ['months', 'Months · close a month'],
              ['products', 'Each product · Jan–Dec'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setView(value)}
              style={{ ...control, border: 'none', borderRadius: 0, fontWeight: view === value ? 600 : 400, background: view === value ? 'var(--t-color-blue2)' : c.bg, color: view === value ? 'var(--t-color-blue11)' : c.text }}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, color: c.text2 }}>
          {owner
            ? lockedThrough
              ? <>🔒 {owner.name} is closed up to <b>{monthLabel(lockedThrough.slice(0, 7))}</b>. Stock dated on or before {lockedThrough} can&apos;t change.</>
              : <>No month is closed yet in {owner.name}.</>
            : 'Pick a business (top right) to close months; each business closes its own.'}
        </span>
        <span style={{ flex: 1 }} />
        {view === 'months' ? <ExcelButton query={withOwner({ kind: 'xlsx-monthend' }, owner?.id ?? '')} title="Month-end summary as an Excel file" /> : null}
      </div>

      {view === 'products' ? <YearGrid items={items} movementsByItem={movementsByItem} today={today} ownerId={owner?.id ?? ''} /> : null}
      {view === 'months' ? (
        <>
          {/* Closing a month in three plain steps, for the oldest finished month that is still open. */}
          {owner && canClose ? (
            (() => {
              const next = rows.find((r) => r.month === nextToClose);

              if (!next) {
                return (
                  <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 14, fontSize: 13, color: c.text2 }}>
                    <b style={{ color: c.text }}>{L('Nothing to close right now.', 'Tiada yang perlu ditutup sekarang.')}</b> {L('Every finished month is already closed. When this month is over, count the shelf and close it here.', 'Semua bulan yang sudah tamat telah ditutup. Apabila bulan ini tamat, kira rak dan tutup di sini.')}
                  </div>
                );
              }

              return (
                <div style={{ border: '1px solid var(--t-color-blue6)', background: 'var(--t-color-blue2)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{L(`Ready to close ${monthLabel(next.month)}`, `Sedia untuk tutup ${monthLabel(next.month)}`)}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{tr('1. Count the shelf')}</span>
                      <span style={{ fontSize: 13, color: next.counted ? 'var(--t-color-green11)' : 'var(--t-color-amber11)' }}>{next.counted ? tr('✓ Counted this month') : tr('Not counted yet. Counting makes the closing match the shelf.')}</span>
                      {!next.counted ? (
                        <button onClick={() => onStockTake(monthEndDay(next.month))} style={{ ...control, alignSelf: 'flex-start' }}>
                          {tr('Count now')}
                        </button>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{tr('2. Look at what was lost')}</span>
                      <span style={{ fontSize: 13, color: c.text2 }}>{next.wasteValue ? L(`${rm(next.wasteValue)} was wasted or went missing. See the table below.`, `${rm(next.wasteValue)} rosak atau hilang. Lihat jadual di bawah.`) : tr('Nothing wasted or missing was recorded.')}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{tr('3. Close the month')}</span>
                      <span style={{ fontSize: 13, color: c.text2 }}>{L(`Closing stock ${rm(next.closingValue)}. Nobody can change this month after.`, `Stok penutup ${rm(next.closingValue)}. Selepas ini tiada siapa boleh ubah bulan ini.`)}</span>
                      <button onClick={() => setClosing(next)} style={{ ...primary, alignSelf: 'flex-start' }}>
                        {L(`🔒 Close ${monthLabel(next.month)}`, `🔒 Tutup ${monthLabel(next.month)}`)}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : null}
          <span style={{ fontSize: 13, color: c.text2 }}>
            {getLang() === 'ms' ? (
              <>
                <b>Open</b> = masih boleh diubah. <b>🔒 Closed</b> = dikunci, supaya rekod lama tidak terubah secara tidak sengaja. Tutup bulan mengikut turutan, selepas setiap bulan tamat.
              </>
            ) : (
              <>
                <b>Open</b> = can still be changed. <b>🔒 Closed</b> = locked, so old records cannot be changed by mistake. Close months in order, after each month is over.
              </>
            )}
          </span>

      <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Month</th>
              <th style={head}>Opening</th>
              <th style={{ ...head, color: 'var(--t-color-green11)' }}>{tr('+ Bought')}</th>
              <th style={{ ...head, color: 'var(--t-color-green11)' }} title="Returns, borrowed in, count differences upward">{tr('+ Other in')}</th>
              <th style={{ ...head, color: 'var(--t-color-blue11)' }} title="Taken out to the shop">{tr('− Used')}</th>
              <th style={{ ...head, color: 'var(--t-color-red11)' }}>{tr('− Wasted / missing')}</th>
              <th style={{ ...head, color: 'var(--t-color-blue11)' }} title="Lent out, given back, count differences downward">{tr('− Lent / returned / count')}</th>
              <th style={head}>Closing</th>
              <th style={{ ...head, textAlign: 'left' }}>Count</th>
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
                    {canClose && r.month === nextToClose ? (
                      <button onClick={() => setClosing(r)} style={primary}>
                        Close month
                      </button>
                    ) : null}
                    {canClose && r.month === latestClosed ? (
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
      {(() => {
        const lost = WASTE_REASONS.filter((r) => rows.some((x) => (x.reasons[r.value] ?? 0) > 0));
        const withLoss = rows.filter((x) => lost.some((r) => (x.reasons[r.value] ?? 0) > 0));
        const totalOf = (x: MonthEndRow) => lost.reduce((sum, r) => sum + (x.reasons[r.value] ?? 0), 0);

        if (!lost.length) {
          return <span style={{ fontSize: 12, color: c.text3 }}>No waste or count shortfall recorded yet. When stock is wasted, pick why: this table then shows where the money went.</span>;
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Where the loss went (RM)</span>
            <div style={{ overflow: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={{ ...head, textAlign: 'left' }}>Month</th>
                    {lost.map((r) => (
                      <th key={r.value} style={{ ...head, color: 'var(--t-color-red11)' }}>
                        {r.label}
                      </th>
                    ))}
                    <th style={head}>Total lost</th>
                  </tr>
                </thead>
                <tbody>
                  {withLoss.map((x) => (
                    <tr key={x.month}>
                      <td style={{ ...cell, fontWeight: 600 }}>{monthLabel(x.month)}</td>
                      {lost.map((r) => (
                        <td key={r.value} style={{ ...right, color: x.reasons[r.value] ? 'var(--t-color-red11)' : c.text3 }}>
                          {x.reasons[r.value] ? rm(x.reasons[r.value]) : '—'}
                        </td>
                      ))}
                      <td style={{ ...right, fontWeight: 700 }}>{rm(totalOf(x))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...cell, fontWeight: 700, background: c.bg2 }}>All months</td>
                    {lost.map((r) => (
                      <td key={r.value} style={{ ...right, fontWeight: 700, background: c.bg2 }}>
                        {rm(withLoss.reduce((sum, x) => sum + (x.reasons[r.value] ?? 0), 0))}
                      </td>
                    ))}
                    <td style={{ ...right, fontWeight: 700, background: c.bg2 }}>{rm(withLoss.reduce((sum, x) => sum + totalOf(x), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <span style={{ fontSize: 12, color: c.text3 }}>Expired stock points to over-ordering; spilled or damaged to handling; count short is stock that went missing between stock takes.</span>
          </div>
        );
      })()}
      <span style={{ fontSize: 12, color: c.text3 }}>
        Values at each item&apos;s carton price ÷ units. Opening = the previous month&apos;s closing. Close months in order, after the month is over.
      </span>
        </>
      ) : null}
    </>
  );
};
