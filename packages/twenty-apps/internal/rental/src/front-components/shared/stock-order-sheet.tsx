import { useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { ItemPicker } from 'src/front-components/shared/item-picker';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, control, Field, input, primary, rm, select, small } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { cartonsToCover, type StockItem, type StockStatus, toCartons } from 'src/shared/stock';
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
  statuses,
  defaultOwnerId,
  today,
  onClose,
  onDone,
}: {
  order: StockOrder | null;
  items: StockItem[];
  statuses: StockStatus[];
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
  // Products of one supplier that stock in hand + on order do not cover for `want` months, in whole cartons.
  const neededLines = (forOwner: string, forSupplier: string, want: number): DraftLine[] =>
    statuses
      .filter((s) => s.item.status !== 'DISCONTINUED' && s.item.ownerId === forOwner && supplierOf(s.item) === forSupplier)
      .map((s) => ({ itemId: s.item.id, cartons: cartonsToCover(s, want, order?.lines.find((l) => l.itemId === s.item.id)?.orderedUnits ?? 0) }))
      .filter((x) => x.cartons > 0)
      .map((x, index) => ({ key: index + 1, itemId: x.itemId, cartons: String(x.cartons) }));
  // A new order starts with what needs ordering (one month of use); a draft keeps its own lines.
  const startLines = !order ? neededLines(ownerId, supplier, 1) : [];
  const [lines, setLines] = useState<DraftLine[]>(
    order?.lines.length
      ? order.lines.map((l, index) => ({ key: index + 1, itemId: l.itemId, cartons: String(toCartons(l.orderedUnits, byId.get(l.itemId) ?? { unitsPerCarton: 1 })) }))
      : startLines.length
        ? startLines
        : [{ key: 1, itemId: '', cartons: '' }],
  );
  const [busy, setBusy] = useState(false);
  const [months, setMonths] = useState('1');
  const [loaded, setLoaded] = useState(!order && startLines.length ? `Started with ${startLines.length} product${startLines.length === 1 ? '' : 's'} that need ordering (1 month of use). Change or remove any.` : '');
  // Only this supplier's products (and, when changing an order, what is already on it).
  const onOrder = new Set(order?.lines.map((l) => l.itemId) ?? []);
  const choosable = active.filter((i) => (i.ownerId === ownerId && supplierOf(i) === supplier) || onOrder.has(i.id));
  const filled = lines.filter((l) => l.itemId && toNumber(l.cartons) > 0);
  const estimate = filled.reduce((sum, l) => sum + toNumber(l.cartons) * (byId.get(l.itemId)?.cartonPrice ?? 0), 0);
  const ready = filled.length > 0 && !lines.some((l) => l.itemId && !(toNumber(l.cartons) > 0)) && isFullDate(date) && !!supplier;
  const setLine = (key: number, patch: Partial<DraftLine>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Add every product of this supplier that stock in hand + on order does not cover
  // for the chosen number of months of next month's use, in whole cartons.
  const loadNeeded = () => {
    const want = toNumber(months) > 0 ? toNumber(months) : 1;
    const next = [...lines.filter((l) => l.itemId)];
    let count = 0;

    for (const s of statuses) {
      if (s.item.status === 'DISCONTINUED' || s.item.ownerId !== ownerId || supplierOf(s.item) !== supplier) continue;
      const own = order?.lines.find((l) => l.itemId === s.item.id)?.orderedUnits ?? 0;
      const cartons = cartonsToCover(s, want, own);

      if (cartons <= 0) continue;
      count += 1;
      const at = next.findIndex((l) => l.itemId === s.item.id);

      if (at >= 0) next[at] = { ...next[at], cartons: String(cartons) };
      else next.push({ key: Math.max(0, ...next.map((x) => x.key), ...lines.map((x) => x.key)) + 1, itemId: s.item.id, cartons: String(cartons) });
    }
    setLines(next.length ? next : [{ key: 1, itemId: '', cartons: '' }]);
    setLoaded(count ? `Loaded ${count} product${count === 1 ? '' : 's'} for ${want} month${want === 1 ? '' : 's'} of use. Change any quantity.` : `Nothing to load: stock in hand and on order already cover ${want} month${want === 1 ? '' : 's'} for this supplier.`);
  };

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

                    const first = suppliersOf(next)[0] ?? '';
                    const fresh = neededLines(next, first, 1);

                    setOwnerId(next);
                    setSupplier(first);
                    setLines(fresh.length ? fresh : [{ key: 1, itemId: '', cartons: '' }]);
                    setLoaded(fresh.length ? `Started with ${fresh.length} product${fresh.length === 1 ? '' : 's'} that need ordering (1 month of use).` : '');
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
                  const next = readValue(e);
                  const fresh = neededLines(ownerId, next, 1);

                  setSupplier(next);
                  setLines(fresh.length ? fresh : [{ key: 1, itemId: '', cartons: '' }]);
                  setLoaded(fresh.length ? `Started with ${fresh.length} product${fresh.length === 1 ? '' : 's'} that need ordering (1 month of use).` : 'Nothing needs ordering for this supplier right now: add products by hand.');
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg2 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <span>Load what needs ordering: cover</span>
            <input value={months} onChange={(e) => setMonths(readValue(e))} inputMode="decimal" style={{ ...input, width: 56, height: 30, textAlign: 'right' }} />
            <span>month(s) of next month&apos;s use</span>
            <button onClick={loadNeeded} style={{ ...small, height: 30, fontWeight: 600 }}>
              Load products
            </button>
          </div>
          <span style={{ fontSize: 12, color: loaded.startsWith('Nothing') ? 'var(--t-color-amber11)' : c.text3 }}>
            {loaded || 'Whole cartons: next month’s need ÷ units per carton, rounded up, less what is in hand and on order. Example: 16 bag a month, 8 per carton → 2 ctn.'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
          {lines.map((l) => {
            const item = byId.get(l.itemId);

            return (
              <div key={l.key} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 8, borderBottom: `1px dashed ${c.border}` }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <ItemPicker items={choosable} value={l.itemId} onChange={(itemId) => setLine(l.key, { itemId })} disabledIds={new Set(lines.map((x) => x.itemId))} />
                </div>
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
