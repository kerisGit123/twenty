import { useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, control, Field, input, primary, rm, select, small } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { type StockItem, toCartons } from 'src/shared/stock';
import type { StockOrder } from 'src/shared/stock-orders';

// A new order, or a change to a draft order: pick the supplier, then the
// products and how many cartons. (The Forecast & order tab also makes orders,
// from what the forecast suggests.)

type DraftLine = { key: number; itemId: string; cartons: string };

const toNumber = (value: string) => Number(value.replace(/[^0-9.]/g, '')) || 0;
const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const supplierOf = (item: StockItem) => item.supplier || 'No supplier';

export const OrderSheet = ({
  order,
  items,
  owners,
  defaultOwnerId,
  today,
  onClose,
  onDone,
}: {
  order: StockOrder | null;
  items: StockItem[];
  owners: StockOwner[];
  defaultOwnerId: string;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const active = useMemo(() => items.filter((i) => i.status !== 'DISCONTINUED'), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const suppliersOf = (ownerId: string) => [...new Set(active.filter((i) => i.ownerId === ownerId).map(supplierOf))].sort();
  const [ownerId, setOwnerId] = useState(order?.ownerId ?? (owners.some((o) => o.id === defaultOwnerId) ? defaultOwnerId : (owners[0]?.id ?? '')));
  const [supplier, setSupplier] = useState(order?.supplier || suppliersOf(ownerId)[0] || '');
  const [date, setDate] = useState(order?.date || today);
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(
    order?.lines.length
      ? order.lines.map((l, index) => ({ key: index + 1, itemId: l.itemId, cartons: String(toCartons(l.orderedUnits, byId.get(l.itemId) ?? { unitsPerCarton: 1 })) }))
      : [{ key: 1, itemId: '', cartons: '' }],
  );
  const [busy, setBusy] = useState(false);
  // Only this supplier's products (and, when changing an order, what is already on it).
  const onOrder = new Set(order?.lines.map((l) => l.itemId) ?? []);
  const choosable = active.filter((i) => (i.ownerId === ownerId && supplierOf(i) === supplier) || onOrder.has(i.id));
  const filled = lines.filter((l) => l.itemId && toNumber(l.cartons) > 0);
  const estimate = filled.reduce((sum, l) => sum + toNumber(l.cartons) * (byId.get(l.itemId)?.cartonPrice ?? 0), 0);
  const ready = filled.length > 0 && !lines.some((l) => l.itemId && !(toNumber(l.cartons) > 0)) && isFullDate(date) && !!supplier;
  const setLine = (key: number, patch: Partial<DraftLine>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'saveOrder', id: order?.id, date, notes, lines: filled.map((l) => ({ itemId: l.itemId, cartons: toNumber(l.cartons) })) });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Sheet width={600} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{order ? `Change ${order.number}` : 'New order'}</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          {order
            ? `A draft order to ${order.supplier}: change what you want to order. Once it is marked as sent it can no longer be changed here.`
            : 'What you want to order from one supplier. This is your draft: the supplier raises the real PO / invoice, and what actually arrives is recorded with “Receive goods”.'}
        </span>
        {order ? null : (
          <div style={{ display: 'grid', gridTemplateColumns: owners.length > 1 ? '1fr 1fr' : '1fr', gap: 8 }}>
            {owners.length > 1 ? (
              <Field label="Workspace">
                <select
                  value={ownerId}
                  onChange={(e) => {
                    const next = readValue(e);

                    setOwnerId(next);
                    setSupplier(suppliersOf(next)[0] ?? '');
                    setLines([{ key: 1, itemId: '', cartons: '' }]);
                  }}
                  style={select}
                >
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Supplier">
              <select
                value={supplier}
                onChange={(e) => {
                  setSupplier(readValue(e));
                  setLines([{ key: 1, itemId: '', cartons: '' }]);
                }}
                style={select}
              >
                {suppliersOf(ownerId).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Ordered on">
          <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, width: 170, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
          {lines.map((l) => {
            const item = byId.get(l.itemId);

            return (
              <div key={l.key} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 8, borderBottom: `1px dashed ${c.border}` }}>
                <select value={l.itemId} onChange={(e) => setLine(l.key, { itemId: readValue(e) })} style={{ ...select, flex: 1, minWidth: 200 }}>
                  <option value="">Choose a product…</option>
                  {choosable.map((i) => (
                    <option key={i.id} value={i.id} disabled={lines.some((x) => x.key !== l.key && x.itemId === i.id)}>
                      {i.code ? `${i.code} ` : ''}
                      {i.name}
                    </option>
                  ))}
                </select>
                <input value={l.cartons} onChange={(e) => setLine(l.key, { cartons: readValue(e) })} inputMode="decimal" placeholder="0" style={{ ...input, width: 64, textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: c.text3, width: 80 }}>{item ? `ctn × ${rm(item.cartonPrice)}` : 'ctn'}</span>
                <button onClick={() => setLines(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [{ key: 1, itemId: '', cartons: '' }])} style={{ ...small, height: 34 }} title="Remove line">
                  ✕
                </button>
              </div>
            );
          })}
          <button onClick={() => setLines([...lines, { key: Math.max(0, ...lines.map((x) => x.key)) + 1, itemId: '', cartons: '' }])} style={{ ...small, alignSelf: 'flex-start' }}>
            + Add product
          </button>
        </div>
        <Field label="Note (optional)">
          <input value={notes} onChange={(e) => setNotes(readValue(e))} style={input} />
        </Field>
        <span style={{ fontSize: 13, color: c.text2 }}>
          {filled.length} product{filled.length === 1 ? '' : 's'} · about <b>{rm(estimate)}</b> at list prices
        </span>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={control}>
            Cancel
          </button>
          <button onClick={save} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
            {busy ? 'Saving…' : order ? 'Save changes' : 'Save as draft order'}
          </button>
        </div>
      </div>
    </Sheet>
  );
};
