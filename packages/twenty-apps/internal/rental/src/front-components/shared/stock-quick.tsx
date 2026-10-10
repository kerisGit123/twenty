import { type CSSProperties, useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, control, input, primary, qty, shortDate } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, expiredStock, type StockItem, type StockMovement } from 'src/shared/stock';

// Fast entry for the store room (works on a phone): search, tap +1 ctn /
// +1 unit, collect several items, save once. And writing off expired stock.

const big: CSSProperties = { ...control, height: 40, minWidth: 64, fontSize: 15, fontWeight: 600 };
const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const KINDS = [
  { value: 'TAKE', label: 'Take out', party: 'Wawa', hint: 'Taken to' },
  { value: 'WASTE', label: 'Waste', party: '', hint: 'Reason (expired, spilled…)' },
  { value: 'PURCHASE', label: 'Stock in', party: 'WeDrink', hint: 'Supplier' },
] as const;

export const QuickSheet = ({
  items,
  balances,
  movements,
  today,
  onClose,
  onDone,
}: {
  items: StockItem[];
  balances: Map<string, number>;
  movements: StockMovement[];
  today: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('TAKE');
  const [party, setParty] = useState('Wawa');
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState('');
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Items taken out most recently come first, so the usual ones are one tap away.
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const list: StockItem[] = [];

    for (const m of [...movements].sort((a, b) => b.date.localeCompare(a.date))) {
      if (m.type !== 'TAKE' || seen.has(m.itemId) || !byId.has(m.itemId)) continue;
      seen.add(m.itemId);
      list.push(byId.get(m.itemId) as StockItem);
      if (list.length >= 8) break;
    }

    return list;
  }, [movements, byId]);
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => `${i.code} ${i.name}`.toLowerCase().includes(q)).slice(0, 12) : recent;
  const add = (item: StockItem, units: number) => setBasket((b) => ({ ...b, [item.id]: Math.max(0, Math.round(((b[item.id] ?? 0) + units) * 100) / 100) }));
  const lines = Object.entries(basket).filter(([, units]) => units > 0);
  const isOut = kind !== 'PURCHASE';

  const save = async () => {
    setBusy(true);
    const result = await stockAction({
      action: 'record',
      type: kind,
      date,
      party: party || (kind === 'WASTE' ? 'Waste' : ''),
      notes: kind === 'WASTE' ? party : '',
      lines: lines.map(([itemId, units]) => ({ itemId, quantity: units })),
    });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Sheet width={560} onClose={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Quick entry</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => {
                setKind(k.value);
                setParty(k.party);
              }}
              style={{ ...big, flex: 1, background: kind === k.value ? c.accent : c.bg, color: kind === k.value ? 'white' : c.text, borderColor: kind === k.value ? c.accent : c.border2 }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 8 }}>
          <input value={party} onChange={(e) => setParty(readValue(e))} placeholder={KINDS.find((k) => k.value === kind)?.hint} style={{ ...input, height: 40 }} />
          <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, height: 40, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
        </div>
        <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder="🔍 Type a code or name…" style={{ ...input, height: 44, fontSize: 15 }} />
        <span style={{ fontSize: 12, color: c.text3 }}>{q ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : 'Recently taken out'}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown.map((item) => {
            const inStock = balances.get(item.id) ?? 0;
            const picked = basket[item.id] ?? 0;

            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, border: `1px solid ${picked ? c.accent : c.border}`, borderRadius: c.radius, background: picked ? 'var(--t-color-blue2)' : c.bg }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: c.text3 }}>
                    {item.code} · in stock {cartonsAndUnits(inStock, item)}
                    {picked ? <b style={{ color: c.accent }}> · {isOut ? '−' : '+'}{cartonsAndUnits(picked, item)}</b> : null}
                  </div>
                </div>
                {item.unitsPerCarton > 1 ? (
                  <button onClick={() => add(item, item.unitsPerCarton)} style={big} title="One carton">
                    +1 ctn
                  </button>
                ) : null}
                <button onClick={() => add(item, 1)} style={big} title="One unit">
                  +1 {item.unit || 'unit'}
                </button>
                {picked ? (
                  <button onClick={() => add(item, -picked)} style={{ ...big, minWidth: 40, color: 'var(--t-color-red11)' }} title="Clear">
                    ✕
                  </button>
                ) : null}
              </div>
            );
          })}
          {!shown.length ? <span style={{ fontSize: 13, color: c.text3 }}>{q ? 'No item matches.' : 'Type to find an item.'}</span> : null}
        </div>
        <div style={{ position: 'sticky', bottom: 0, background: c.bg, borderTop: `1px solid ${c.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.length ? (
            <div style={{ fontSize: 13, color: c.text2 }}>
              {lines.map(([id, units]) => {
                const item = byId.get(id) as StockItem;
                const short = isOut && units > (balances.get(id) ?? 0);

                return (
                  <div key={id} style={{ color: short ? 'var(--t-color-red11)' : c.text2 }}>
                    {isOut ? '−' : '+'}
                    {cartonsAndUnits(units, item)} {item.name}
                    {short ? ' (more than in stock)' : ''}
                  </div>
                );
              })}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ ...big, flex: 1 }}>
              Cancel
            </button>
            <button onClick={save} disabled={busy || !lines.length || !isFullDate(date)} style={{ ...primary, ...{ height: 40, fontSize: 15 }, flex: 2, opacity: busy || !lines.length || !isFullDate(date) ? 0.5 : 1 }}>
              {busy ? 'Saving…' : `Save ${lines.length} item${lines.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
};

// ---------------------------------------------------------------- Write off expired stock

export const ExpiredSheet = ({
  items,
  movementsByItem,
  balances,
  today,
  onClose,
  onDone,
}: {
  items: StockItem[];
  movementsByItem: Map<string, StockMovement[]>;
  balances: Map<string, number>;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const rows = useMemo(
    () =>
      items
        .map((item) => ({ item, ...expiredStock(movementsByItem.get(item.id) ?? [], balances.get(item.id) ?? 0, today) }))
        .filter((r) => r.units > 0)
        .sort((a, b) => (a.earliest ?? '').localeCompare(b.earliest ?? '')),
    [items, movementsByItem, balances, today],
  );
  const [units, setUnits] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.item.id, String(r.units)])));
  const [busy, setBusy] = useState(false);
  const chosen = rows.filter((r) => Number(units[r.item.id]) > 0);

  const save = async () => {
    setBusy(true);
    const result = await stockAction({
      action: 'record',
      type: 'WASTE',
      date: today,
      party: 'Expired',
      notes: 'Expired stock written off',
      lines: chosen.map((r) => ({ itemId: r.item.id, quantity: Number(units[r.item.id]) })),
    });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Sheet width={600} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Expired stock</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          What is past its expiry, assuming the oldest stock was used first. Check the shelf: change a number if some was already used or is still fine (set 0 to keep it). Saved as waste today.
        </span>
        {rows.length ? (
          <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius }}>
            {rows.map((r) => (
              <div key={r.item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${c.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.item.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t-color-red11)' }}>
                    expired {shortDate(r.earliest)} · {cartonsAndUnits(r.units, r.item)} of {cartonsAndUnits(balances.get(r.item.id) ?? 0, r.item)}
                  </div>
                </div>
                <input
                  value={units[r.item.id] ?? ''}
                  onChange={(e) => setUnits({ ...units, [r.item.id]: readValue(e) })}
                  inputMode="decimal"
                  style={{ ...input, width: 70, textAlign: 'right' }}
                />
                <span style={{ fontSize: 12, color: c.text3, width: 44 }}>{r.item.unit}</span>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 13, color: c.text3 }}>Nothing on the shelf is past its expiry.</span>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={control}>
            Cancel
          </button>
          <button onClick={save} disabled={busy || !chosen.length} style={{ ...primary, background: 'var(--t-color-red9)', borderColor: 'var(--t-color-red9)', opacity: busy || !chosen.length ? 0.5 : 1 }}>
            {busy ? 'Saving…' : `Write off ${chosen.length} item${chosen.length === 1 ? '' : 's'} as waste`}
          </button>
        </div>
        <span style={{ fontSize: 12, color: c.text3 }}>Total {qty(chosen.reduce((s, r) => s + Number(units[r.item.id] || 0), 0))} units.</span>
      </div>
    </Sheet>
  );
};
