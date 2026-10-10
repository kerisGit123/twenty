import { type CSSProperties, useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, Chip, control, ExcelButton, input, primary, rm, shortDate, small, withOwner } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, type StockItem, type StockMovement, toCartons } from 'src/shared/stock';
import { type LineProgress, orderProgress, type StockOrder } from 'src/shared/stock-orders';
import { ORDER_STATUSES } from 'src/shared/stock-types';

// Orders sent to suppliers: what was ordered, what arrived, what is still to
// come. Receive goods against an order (a short delivery keeps the rest
// outstanding), mark a line as not coming, or close / cancel the order.

const cell: CSSProperties = { fontSize: 13, padding: '7px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const right: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const head: CSSProperties = { ...cell, textAlign: 'left', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2 };

const toNumber = (value: string) => Number(value.replace(/[^0-9.]/g, '')) || 0;
const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// ---------------------------------------------------------------- Receive goods against an order

const ReceiveSheet = ({ order, lines, items, today, onClose, onDone }: { order: StockOrder; lines: LineProgress[]; items: Map<string, StockItem>; today: string; onClose: () => void; onDone: () => void }) => {
  const open = lines.filter((l) => l.outstanding > 0);
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState(order.supplierRef);
  // Cartons received now, per line (starts at what is outstanding).
  const [got, setGot] = useState<Record<string, string>>(() => Object.fromEntries(open.map((l) => [l.itemId, String(toCartons(l.outstanding, items.get(l.itemId) ?? { unitsPerCarton: 1 }))])));
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [notComing, setNotComing] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const unitsOf = (l: LineProgress) => toNumber(got[l.itemId] ?? '') * (items.get(l.itemId)?.unitsPerCarton || 1);
  const ready = isFullDate(date) && open.some((l) => unitsOf(l) > 0 || notComing[l.itemId]);

  const save = async () => {
    setBusy(true);
    const result = await stockAction({
      action: 'receiveOrder',
      orderId: order.id,
      date,
      reference,
      lines: open.map((l) => ({ itemId: l.itemId, units: unitsOf(l), expiryDate: expiry[l.itemId] || undefined, close: Boolean(notComing[l.itemId]) })),
    });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Sheet width={640} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          Receive goods · {order.number} · {order.supplier}
        </span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          Check the delivery and type what actually arrived (in cartons). Anything short stays on order; tick “not coming” if the supplier won&apos;t send it.
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text3 }}>
            Arrived on
            <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text3 }}>
            Supplier&apos;s PO / invoice / DO no.
            <input value={reference} onChange={(e) => setReference(readValue(e))} placeholder="e.g. WD-INV-1234" style={input} />
          </label>
        </div>
        <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>Item</th>
                <th style={{ ...head, textAlign: 'right' }}>Still to come</th>
                <th style={{ ...head, textAlign: 'right' }}>Arrived (ctn)</th>
                <th style={head}>Expiry</th>
                <th style={head} />
              </tr>
            </thead>
            <tbody>
              {open.map((l) => {
                const item = items.get(l.itemId);
                const short = !notComing[l.itemId] && unitsOf(l) < l.outstanding;

                return (
                  <tr key={l.itemId} style={{ opacity: notComing[l.itemId] ? 0.5 : 1 }}>
                    <td style={{ ...cell, whiteSpace: 'normal' }}>
                      <div style={{ fontWeight: 500 }}>{item?.name ?? 'Item removed'}</div>
                      <div style={{ fontSize: 11, color: c.text3 }}>{item?.code}</div>
                    </td>
                    <td style={right}>{item ? cartonsAndUnits(l.outstanding, item) : l.outstanding}</td>
                    <td style={right}>
                      <input
                        value={got[l.itemId] ?? ''}
                        onChange={(e) => setGot({ ...got, [l.itemId]: readValue(e) })}
                        disabled={notComing[l.itemId]}
                        inputMode="decimal"
                        style={{ ...input, width: 70, textAlign: 'right', fontWeight: 600, borderColor: short ? 'var(--t-color-amber9)' : undefined }}
                      />
                      {short && unitsOf(l) > 0 ? <div style={{ fontSize: 11, color: 'var(--t-color-amber11)' }}>short: rest stays on order</div> : null}
                    </td>
                    <td style={cell}>
                      <input type="date" value={expiry[l.itemId] ?? ''} onChange={(e) => setExpiry({ ...expiry, [l.itemId]: readValue(e) })} style={{ ...input, width: 140 }} />
                    </td>
                    <td style={cell}>
                      <button
                        onClick={() => setNotComing({ ...notComing, [l.itemId]: !notComing[l.itemId] })}
                        style={{ ...small, color: notComing[l.itemId] ? 'var(--t-color-red11)' : c.text2, borderColor: notComing[l.itemId] ? 'var(--t-color-red9)' : c.border2 }}
                        title="The supplier won't send the rest: stop counting it as on order"
                      >
                        {notComing[l.itemId] ? '✓ Not coming' : 'Not coming'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={control}>
            Cancel
          </button>
          <button onClick={save} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
            {busy ? 'Saving…' : 'Receive into stock'}
          </button>
        </div>
      </div>
    </Sheet>
  );
};

// ---------------------------------------------------------------- Orders list

type Show = 'OPEN' | 'DONE' | 'ALL';

export const OrdersTab = ({ orders, items, movements, today, ownerId, onChanged }: { orders: StockOrder[]; items: StockItem[]; movements: StockMovement[]; today: string; ownerId: string; onChanged: () => void }) => {
  const [show, setShow] = useState<Show>('OPEN');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [receiving, setReceiving] = useState<StockOrder | null>(null);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isOpen = (o: StockOrder) => ['DRAFT', 'SENT', 'PARTLY_RECEIVED'].includes(o.status);
  const list = orders.filter((o) => show === 'ALL' || (show === 'OPEN' ? isOpen(o) : !isOpen(o)));
  const ctn = (units: number, itemId: string) => toCartons(units, byId.get(itemId) ?? { unitsPerCarton: 1 });

  const act = async (order: StockOrder, status: string) => {
    if ((await stockAction({ action: 'setOrderStatus', orderId: order.id, status })).success) onChanged();
  };

  const progressOf = (o: StockOrder) => orderProgress(o, movements);
  const openValue = orders.filter(isOpen).reduce((sum, o) => sum + progressOf(o).lines.reduce((s, l) => s + (l.outstanding / (byId.get(l.itemId)?.unitsPerCarton || 1)) * l.cartonPrice, 0), 0);

  return (
    <>
      {receiving ? (
        <ReceiveSheet
          order={receiving}
          lines={progressOf(receiving).lines}
          items={byId}
          today={today}
          onClose={() => setReceiving(null)}
          onDone={() => {
            setReceiving(null);
            onChanged();
          }}
        />
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(
          [
            ['OPEN', `Open (${orders.filter(isOpen).length})`],
            ['DONE', 'Received / cancelled'],
            ['ALL', 'All'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} onClick={() => setShow(value)} style={{ ...control, fontWeight: show === value ? 600 : 400, borderColor: show === value ? c.accent : c.border2 }}>
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: c.text2 }}>
          Still to arrive: <b style={{ color: 'var(--t-color-blue11)' }}>{rm(openValue)}</b>
        </span>
      </div>

      {list.length ? null : (
        <div style={{ padding: 32, textAlign: 'center', color: c.text3, fontSize: 13, border: `1px dashed ${c.border2}`, borderRadius: c.radius }}>
          {show === 'OPEN' ? 'No open orders. Make one on Forecast & order with “Save as order”.' : 'Nothing here yet.'}
        </div>
      )}

      {list.map((o) => {
        const p = progressOf(o);
        const status = ORDER_STATUSES.find((s) => s.value === o.status) ?? ORDER_STATUSES[0];
        const total = o.lines.reduce((sum, l) => sum + ctn(l.orderedUnits, l.itemId) * l.cartonPrice, 0);
        const orderedCtn = o.lines.reduce((sum, l) => sum + ctn(l.orderedUnits, l.itemId), 0);
        const receivedCtn = p.lines.reduce((sum, l) => sum + ctn(l.received, l.itemId), 0);
        const outstandingCtn = p.lines.reduce((sum, l) => sum + ctn(l.outstanding, l.itemId), 0);
        const showLines = expanded[o.id] ?? isOpen(o);

        return (
          <div key={o.id} style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', background: c.bg2 }}>
              <button onClick={() => setExpanded({ ...expanded, [o.id]: !showLines })} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                {showLines ? '▾' : '▸'} {o.number}
              </button>
              <span style={{ fontSize: 13 }}>{o.supplier}</span>
              <span style={{ fontSize: 12, color: c.text3 }}>ordered {shortDate(o.date)}</span>
              {o.supplierRef ? <span style={{ fontSize: 12, color: c.text3 }}>· supplier PO {o.supplierRef}</span> : null}
              <Chip label={status.label} color={status.color} />
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: c.text2 }}>
                {Math.round(orderedCtn * 100) / 100} ctn ordered · {Math.round(receivedCtn * 100) / 100} arrived
                {outstandingCtn ? <b style={{ color: 'var(--t-color-amber11)' }}> · {Math.round(outstandingCtn * 100) / 100} to come</b> : null} · {rm(total)}
              </span>
            </div>
            {showLines ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={head}>Item</th>
                    <th style={{ ...head, textAlign: 'right' }}>Ordered</th>
                    <th style={{ ...head, textAlign: 'right' }}>Arrived</th>
                    <th style={{ ...head, textAlign: 'right' }}>Still to come</th>
                    <th style={{ ...head, textAlign: 'right' }}>Ctn price</th>
                    <th style={{ ...head, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {p.lines.map((l) => {
                    const item = byId.get(l.itemId);
                    const fmt = (units: number) => (item ? cartonsAndUnits(units, item) : String(units));

                    return (
                      <tr key={l.itemId}>
                        <td style={{ ...cell, whiteSpace: 'normal' }}>
                          <span style={{ fontWeight: 500 }}>{item?.name ?? 'Item removed'}</span>
                          <span style={{ color: c.text3, fontSize: 12 }}> · {item?.code}</span>
                        </td>
                        <td style={right}>{fmt(l.orderedUnits)}</td>
                        <td style={{ ...right, color: l.received ? 'var(--t-color-green11)' : c.text3, fontWeight: l.received ? 600 : 400 }}>{l.received ? fmt(l.received) : '—'}</td>
                        <td style={{ ...right, color: l.outstanding ? 'var(--t-color-amber11)' : c.text3, fontWeight: l.outstanding ? 600 : 400 }}>
                          {l.outstanding ? fmt(l.outstanding) : l.closed && l.received < l.orderedUnits ? 'not coming' : '—'}
                        </td>
                        <td style={{ ...right, color: c.text2 }}>{rm(l.cartonPrice)}</td>
                        <td style={right}>{rm(ctn(l.orderedUnits, l.itemId) * l.cartonPrice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 12px', borderTop: `1px solid ${c.border}` }}>
              {isOpen(o) ? (
                <button onClick={() => setReceiving(o)} style={primary}>
                  Receive goods
                </button>
              ) : null}
              {o.status === 'DRAFT' ? (
                <button onClick={() => act(o, 'SENT')} style={control}>
                  Mark as sent
                </button>
              ) : null}
              <ExcelButton query={withOwner({ kind: 'xlsx-po', order: o.id }, ownerId)} title="This order as an Excel file to send to the supplier" />
              <span style={{ flex: 1 }} />
              {isOpen(o) && p.received > 0 ? (
                <button onClick={() => act(o, 'CLOSE_REST')} style={small} title="The rest won't come: stop counting it as on order">
                  Close the rest
                </button>
              ) : null}
              {isOpen(o) && !p.received ? (
                <button onClick={() => act(o, 'CANCELLED')} style={{ ...small, color: 'var(--t-color-red11)' }}>
                  Cancel order
                </button>
              ) : null}
              {o.status === 'CANCELLED' || o.status === 'SENT' ? (
                <button onClick={() => act(o, 'DRAFT')} style={small}>
                  {o.status === 'CANCELLED' ? 'Reopen' : 'Back to draft'}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <span style={{ fontSize: 12, color: c.text3 }}>
        Open orders count as “on order”: the forecast won&apos;t suggest those items again. The real PO is the supplier&apos;s; put its number on the order when it comes.
      </span>
    </>
  );
};
