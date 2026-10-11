import { type CSSProperties, useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, Chip, control, ExcelButton, input, PriceNote, primary, rm, shortDate, small, withOwner } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, type StockItem, type StockMovement, type StockStatus, toCartons } from 'src/shared/stock';
import { normalizePhone, orderAttention, orderWhatsappText } from 'src/shared/stock-orders';
import { OrderSheet } from 'src/front-components/shared/stock-order-sheet';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
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

const ReceiveSheet = ({
  order,
  lines,
  items,
  lastPaid,
  today,
  onClose,
  onDone,
}: {
  order: StockOrder;
  lines: LineProgress[];
  items: Map<string, StockItem>;
  lastPaid: Map<string, number>;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const open = lines.filter((l) => l.outstanding > 0);
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState(order.supplierRef);
  // Cartons received now, per line (starts at what is outstanding).
  const [got, setGot] = useState<Record<string, string>>(() => Object.fromEntries(open.map((l) => [l.itemId, String(toCartons(l.outstanding, items.get(l.itemId) ?? { unitsPerCarton: 1 }))])));
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  // Price per carton on the invoice, when it differs from the order's.
  const [price, setPrice] = useState<Record<string, string>>({});
  const [notComing, setNotComing] = useState<Record<string, boolean>>({});
  const [addExpense, setAddExpense] = useState(true);
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
      addExpense,
      lines: open.map((l) => ({ itemId: l.itemId, units: unitsOf(l), expiryDate: expiry[l.itemId] || undefined, close: Boolean(notComing[l.itemId]), cartonPrice: price[l.itemId] ? toNumber(price[l.itemId]) : undefined })),
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
                <th style={{ ...head, textAlign: 'right' }}>Price / ctn</th>
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
                    <td style={right}>
                      <input
                        value={price[l.itemId] ?? ''}
                        onChange={(e) => setPrice({ ...price, [l.itemId]: readValue(e) })}
                        disabled={notComing[l.itemId]}
                        inputMode="decimal"
                        placeholder={l.cartonPrice.toFixed(2)}
                        title="What the invoice says per carton (empty = the price on the order)"
                        style={{ ...input, width: 84, textAlign: 'right' }}
                      />
                      {item && !notComing[l.itemId] ? (
                        <div style={{ textAlign: 'right' }}>
                          <PriceNote price={(price[l.itemId] ? toNumber(price[l.itemId]) : l.cartonPrice) / (item.unitsPerCarton || 1)} last={lastPaid.get(item.id)} unit={item.unit || 'unit'} />
                        </div>
                      ) : null}
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
        <button
          onClick={() => setAddExpense(!addExpense)}
          style={{ ...small, height: 30, alignSelf: 'flex-start', fontWeight: 600, color: addExpense ? 'var(--t-color-green11)' : c.text3, borderColor: addExpense ? 'var(--t-color-green9)' : c.border2 }}
          title="Book the cost as an expense (Stock & ingredients) so it shows in Expenses, Transactions and the year summary"
        >
          {addExpense ? '✓ Also add to Expenses' : 'Not added to Expenses'}
        </button>
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


// ---------------------------------------------------------------- Send the draft order to the supplier on WhatsApp

const WhatsAppSheet = ({ order, items, company, phoneGuess, onClose, onDone }: { order: StockOrder; items: Map<string, StockItem>; company: string; phoneGuess: string; onClose: () => void; onDone: () => void }) => {
  const [phone, setPhone] = useState(phoneGuess);
  const [message, setMessage] = useState(() => orderWhatsappText(order, items, company));
  const [markSent, setMarkSent] = useState(order.status === 'DRAFT');
  const e164 = normalizePhone(phone);
  const link = e164 ? `https://wa.me/${e164.replace('+', '')}?text=${encodeURIComponent(message)}` : null;

  // Opening WhatsApp is the link itself; this saves the number and the status alongside.
  const afterOpen = async () => {
    if (e164 && e164 !== order.supplierPhone) await stockAction({ action: 'setOrderPhone', orderId: order.id, phone: e164 });
    if (markSent && order.status === 'DRAFT') await stockAction({ action: 'setOrderStatus', orderId: order.id, status: 'SENT' });
    onDone();
  };

  return (
    <Sheet width={560} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          Send {order.number} to {order.supplier || 'the supplier'}
        </span>
        <span style={{ fontSize: 13, color: c.text2 }}>WhatsApp opens with this message typed in. You press send there. Edit the message first if you like.</span>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text3 }}>
          Supplier&apos;s WhatsApp number
          <input value={phone} onChange={(e) => setPhone(readValue(e))} placeholder="e.g. 012-345 6789 or +60 12 345 6789" style={{ ...input, borderColor: phone && !e164 ? 'var(--t-color-red9)' : undefined }} />
          <span style={{ color: e164 ? 'var(--t-color-green11)' : c.text3 }}>{e164 ? `Will open ${e164}. Remembered for the next order to ${order.supplier || 'this supplier'}.` : phone ? 'Not a usable number yet.' : 'Type it once: it is remembered.'}</span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text3 }}>
          Message
          <textarea value={message} onChange={(e) => setMessage(readValue(e))} rows={14} style={{ ...input, height: 'auto', padding: 10, fontFamily: c.font, lineHeight: 1.45 }} />
        </label>
        {order.status === 'DRAFT' ? (
          <button
            onClick={() => setMarkSent(!markSent)}
            style={{ ...small, height: 30, alignSelf: 'flex-start', fontWeight: 600, color: markSent ? 'var(--t-color-green11)' : c.text3, borderColor: markSent ? 'var(--t-color-green9)' : c.border2 }}
          >
            {markSent ? '✓ Also mark the order as sent' : 'Leave the order as a draft'}
          </button>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={control}>
            Cancel
          </button>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              onClick={afterOpen}
              style={{ ...primary, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: '#25D366', borderColor: '#25D366' }}
            >
              Open WhatsApp
            </a>
          ) : (
            <button disabled style={{ ...primary, opacity: 0.5 }}>
              Open WhatsApp
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
};

// ---------------------------------------------------------------- Orders list

type Show = 'OPEN' | 'PARTLY' | 'DONE' | 'ALL';

export const OrdersTab = ({
  orders,
  items,
  movements,
  lastPaid,
  ownerName,
  owners,
  statuses,
  leadDaysOf,
  today,
  ownerId,
  onChanged,
}: {
  orders: StockOrder[];
  items: StockItem[];
  movements: StockMovement[];
  lastPaid: Map<string, number>;
  ownerName: (ownerId: string | null) => string;
  owners: StockOwner[];
  statuses: StockStatus[];
  leadDaysOf: (ownerId: string | null) => number;
  today: string;
  ownerId: string;
  onChanged: () => void;
}) => {
  const [show, setShow] = useState<Show>('OPEN');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [receiving, setReceiving] = useState<StockOrder | null>(null);
  const [sending, setSending] = useState<StockOrder | null>(null);
  // The order sheet: undefined = closed, null = a new order, an order = changing that draft.
  const [editing, setEditing] = useState<StockOrder | null | undefined>(undefined);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isOpen = (o: StockOrder) => ['DRAFT', 'SENT', 'PARTLY_RECEIVED'].includes(o.status);
  const attentionOf = (o: StockOrder) => orderAttention(o, movements, today, leadDaysOf(o.ownerId));
  const needAttention = orders.filter((o) => attentionOf(o));
  const list = orders.filter((o) => show === 'ALL' || (show === 'PARTLY' ? attentionOf(o) !== null : show === 'OPEN' ? isOpen(o) : !isOpen(o)));
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
          lastPaid={lastPaid}
          today={today}
          onClose={() => setReceiving(null)}
          onDone={() => {
            setReceiving(null);
            onChanged();
          }}
        />
      ) : null}
      {editing !== undefined ? (
        <OrderSheet
          order={editing}
          items={items}
          owners={owners}
          statuses={statuses}
          defaultOwnerId={ownerId}
          today={today}
          onClose={() => setEditing(undefined)}
          onDone={() => {
            setEditing(undefined);
            onChanged();
          }}
        />
      ) : null}
      {sending ? (
        <WhatsAppSheet
          order={sending}
          items={byId}
          company={ownerName(sending.ownerId)}
          phoneGuess={sending.supplierPhone || orders.find((o) => o.supplier === sending.supplier && o.supplierPhone)?.supplierPhone || ''}
          onClose={() => setSending(null)}
          onDone={() => {
            setSending(null);
            onChanged();
          }}
        />
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(
          [
            ['OPEN', `Open (${orders.filter(isOpen).length})`],
            ['PARTLY', `Needs a look (${needAttention.length})`],
            ['DONE', 'Received / cancelled'],
            ['ALL', 'All'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} onClick={() => setShow(value)} style={{ ...control, fontWeight: show === value ? 600 : 400, borderColor: show === value ? c.accent : c.border2 }}>
            {label}
          </button>
        ))}
        <button onClick={() => setEditing(null)} style={primary}>
          + New order
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: c.text2 }}>
          Still to arrive: <b style={{ color: 'var(--t-color-blue11)' }}>{rm(openValue)}</b>
        </span>
      </div>

      {needAttention.length && show !== 'PARTLY' ? (
        <div style={{ padding: '10px 12px', borderRadius: c.radius, background: 'var(--t-color-amber2)', border: '1px solid var(--t-color-amber6)', color: 'var(--t-color-amber11)', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            <b>{needAttention.length} order{needAttention.length === 1 ? '' : 's'} not fully received or late.</b> Stock you ordered has not all arrived.
          </span>
          <button onClick={() => setShow('PARTLY')} style={small}>
            Show them
          </button>
        </div>
      ) : null}

      {list.length ? null : (
        <div style={{ padding: 32, textAlign: 'center', color: c.text3, fontSize: 13, border: `1px dashed ${c.border2}`, borderRadius: c.radius }}>
          {show === 'OPEN' ? 'No open orders. Press “+ New order”, or make one on Forecast & order with “Save as order”.' : show === 'PARTLY' ? 'Everything ordered has arrived, nothing is late.' : 'Nothing here yet.'}
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
        const attention = attentionOf(o);
        const daysAgo = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${o.date}T00:00:00Z`)) / 86_400_000);

        return (
          <div key={o.id} style={{ border: `1px solid ${attention === 'LATE' ? 'var(--t-color-red9)' : attention === 'PARTLY' ? 'var(--t-color-amber9)' : c.border}`, borderRadius: c.radius, background: c.bg, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', background: c.bg2 }}>
              <button onClick={() => setExpanded({ ...expanded, [o.id]: !showLines })} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                {showLines ? '▾' : '▸'} {o.number}
              </button>
              <span style={{ fontSize: 13 }}>{o.supplier}</span>
              <span style={{ fontSize: 12, color: c.text3 }}>ordered {shortDate(o.date)}</span>
              {o.supplierRef ? <span style={{ fontSize: 12, color: c.text3 }}>· supplier PO {o.supplierRef}</span> : null}
              <Chip label={status.label} color={status.color} />
              {attention === 'PARTLY' ? <Chip label="Not fully received" color="orange" /> : null}
              {attention === 'LATE' ? <Chip label={`Late: nothing arrived in ${daysAgo} days`} color="red" /> : null}
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
              {o.status === 'DRAFT' || o.status === 'SENT' ? (
                <button onClick={() => setSending(o)} style={{ ...control, fontWeight: 600, color: 'var(--t-color-green11)' }} title="Send this order to the supplier on WhatsApp">
                  Send on WhatsApp
                </button>
              ) : null}
              {o.status === 'DRAFT' ? (
                <button onClick={() => setEditing(o)} style={control} title="Change the products or quantities of this draft">
                  Edit
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
