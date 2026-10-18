import { type CSSProperties, useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { BelowZeroBar, stockAction, useStockSave } from 'src/front-components/shared/stock-forms';
import { c, control, input, knownShop, lastPartyFor, parseNumber, PriceNote, primary, qty, ReasonPicker, ShopChips, shortDate } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, defaultExpiry, expiredStock, type StockItem, type StockMovement } from 'src/shared/stock';
import { STOCK_GROUPS } from 'src/shared/stock-types';

// Fast entry for the store room (works on a phone): search, tap +1 ctn /
// +1 unit, collect several items, save once. And writing off expired stock.

const big: CSSProperties = { ...control, height: 40, minWidth: 64, fontSize: 15, fontWeight: 600 };
const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const KINDS = [
  { value: 'TAKE', label: 'Take out', party: '', hint: 'Taken to (which shop / outlet)' },
  { value: 'WASTE', label: 'Waste', party: '', hint: 'Reason (expired, spilled…)' },
  { value: 'PURCHASE', label: 'Stock in', party: '', hint: 'Supplier' },
  // Stock that moves between shops: it has to be given back, swapped or paid for later (Loans tab).
  { value: 'BORROW_IN', label: 'Borrowed in', party: '', hint: 'Which shop lent it to you?' },
  { value: 'BORROW', label: 'Lent out', party: '', hint: 'Which shop borrowed it?' },
] as const;

const toNumber = parseNumber;

export const QuickSheet = ({
  items,
  balances,
  movements,
  lastPaid,
  initialKind,
  shops = [],
  canManage = true,
  today,
  onClose,
  onDone,
}: {
  items: StockItem[];
  balances: Map<string, number>;
  movements: StockMovement[];
  lastPaid: Map<string, number>; // per unit, the last delivery's price
  initialKind?: 'TAKE' | 'WASTE' | 'PURCHASE' | 'BORROW_IN' | 'BORROW';
  shops?: string[]; // shops used in earlier loans
  canManage?: boolean; // staff cannot take out more than is in stock
  today: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const start = KINDS.find((k) => k.value === initialKind) ?? KINDS[0];
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>(start.value);
  const [party, setParty] = useState<string>(() => lastPartyFor(movements, start.value) || start.party);
  // Stock in: expiry, price per carton and invoice number are optional extras.
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState('');
  // What the list shows when nothing is typed: the usual ones, or a whole group, or everything.
  const [view, setView] = useState<string>('usual');
  const [basket, setBasket] = useState<Record<string, number>>({});
  const saver = useStockSave(onDone);
  const busy = saver.busy;
  const [oldOk, setOldOk] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Usual items: the ones done most often in the last 60 days for this kind (ties: most recent first),
  // so a single back-dated entry cannot reshuffle the list. Nothing in 60 days: the latest ever.
  const verb = kind === 'TAKE' ? 'taken' : kind === 'WASTE' ? 'wasted' : kind === 'PURCHASE' ? 'received' : kind === 'BORROW_IN' ? 'borrowed' : 'lent';
  const lastDone = useMemo(() => {
    const map = new Map<string, string>();

    for (const m of movements) if (m.type === kind && m.date > (map.get(m.itemId) ?? '')) map.set(m.itemId, m.date);

    return map;
  }, [movements, kind]);
  const recent = useMemo(() => {
    const since = new Date(`${today}T00:00:00Z`);

    since.setUTCDate(since.getUTCDate() - 60);
    const from = since.toISOString().slice(0, 10);
    const counts = new Map<string, number>();

    for (const m of movements) if (m.type === kind && m.date >= from && m.date <= today) counts.set(m.itemId, (counts.get(m.itemId) ?? 0) + 1);
    const rank = (ids: string[]) =>
      ids
        .filter((id) => byId.has(id))
        .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (lastDone.get(b) ?? '').localeCompare(lastDone.get(a) ?? ''))
        .slice(0, 8)
        .map((id) => byId.get(id) as StockItem);
    const used = rank([...counts.keys()]);

    return used.length ? used : rank([...lastDone.keys()]).length ? rank([...lastDone.keys()]) : items.slice(0, 8);
  }, [movements, byId, kind, items, today, lastDone]);
  const q = query.trim().toLowerCase();
  const groupLabel = (value: string) => STOCK_GROUPS.find((g) => g.value === value)?.label ?? '';
  const groupsHere = STOCK_GROUPS.filter((g) => items.some((i) => i.group === g.value));
  const byCode = useMemo(() => [...items].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })), [items]);
  const shown = q
    ? byCode.filter((i) => `${i.code} ${i.name} ${i.specification} ${groupLabel(i.group)}`.toLowerCase().includes(q)).slice(0, 40)
    : view === 'usual'
      ? recent
      : view === 'all'
        ? byCode
        : byCode.filter((i) => i.group === view);
  const usualLabel = `Usual items: the ones most often ${verb} in the last 60 days`;
  const add = (item: StockItem, units: number) => setBasket((b) => ({ ...b, [item.id]: Math.max(0, Math.round(((b[item.id] ?? 0) + units) * 100) / 100) }));
  const lines = Object.entries(basket).filter(([, units]) => units > 0);
  const isOut = kind !== 'PURCHASE' && kind !== 'BORROW_IN';
  const isLoan = kind === 'BORROW_IN' || kind === 'BORROW';
  const needsShop = isLoan && !party.trim();
  const shortLines = isOut ? lines.filter(([id, units]) => units > (balances.get(id) ?? 0) + 0.005) : [];
  // Staff cannot take out more than the system says is there: count first, or ask a manager.
  const staffShort = !canManage && shortLines.length > 0;

  const daysAgo = isFullDate(date) ? Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000) : 0;
  const oldDate = daysAgo > 7;
  const future = daysAgo < 0;
  const askFirst = (oldDate || future) && !oldOk;
  // Why Save is greyed out, said in words, so nobody has to guess.
  const whyNot = !lines.length
    ? 'Tap +1 carton or a unit button on an item to add it.'
    : !isFullDate(date)
      ? 'Pick a full date.'
      : kind === 'WASTE' && !reason
        ? 'Pick why it was wasted (the buttons near the top), then Save.'
        : needsShop
          ? 'Say which shop: tap one near the top or type its name.'
          : staffShort
            ? `Not enough stock for ${shortLines.map(([id]) => byId.get(id)?.name ?? 'an item').join(', ')}. Count the shelf first (Count button), or ask a manager.`
            : '';

  const save = async () => {
    if (askFirst) {
      setOldOk(true);

      return;
    }

    await saver.run({
      action: 'record',
      type: kind,
      date,
      party: kind === 'WASTE' ? '' : isLoan ? knownShop(shops, party) : party,
      reason: kind === 'WASTE' ? reason : undefined,
      reference: kind === 'PURCHASE' ? reference : undefined,
      lines: lines.map(([itemId, units]) => {
        const item = byId.get(itemId) as StockItem;
        const perCarton = toNumber(cost[itemId] ?? '');

        return {
          itemId,
          quantity: units,
          ...(kind === 'PURCHASE'
            ? { ...(expiry[itemId] === '' ? { noExpiry: true } : { expiryDate: expiry[itemId] || defaultExpiry(item, date) || undefined }), unitCost: perCarton > 0 ? perCarton / (item.unitsPerCarton || 1) : undefined }
            : {}),
        };
      }),
    });
  };

  return (
    <Sheet width={560} onClose={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Quick entry</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => {
                if (k.value === kind) return;
                setKind(k.value);
                setParty(lastPartyFor(movements, k.value) || k.party);
                // Items picked for "Take out" must never be saved as "Waste": start the list again.
                setBasket({});
              }}
              style={{ ...big, flex: '1 1 90px', background: kind === k.value ? c.accent : c.bg, color: kind === k.value ? 'white' : c.text, borderColor: kind === k.value ? c.accent : c.border2 }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 8 }}>
          {kind === 'WASTE' ? <span /> : <input value={party} onChange={(e) => setParty(readValue(e))} placeholder={KINDS.find((k) => k.value === kind)?.hint} style={{ ...input, height: 40 }} />}
          <input type="date" value={date} onChange={(e) => {
            setDate(readValue(e));
            setOldOk(false);
          }} style={{ ...input, height: 40, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
        </div>
        {isLoan ? (
          <>
            <ShopChips shops={shops} value={party} onPick={setParty} />
            <span style={{ fontSize: 12, color: needsShop ? 'var(--t-color-amber11)' : c.text3 }}>
              {needsShop ? 'Say which shop: tap one above or type its name.' : kind === 'BORROW_IN' ? 'You will owe this back: give it back, swap it or pay for it later on the Loans tab.' : 'The shop will owe this back: settle it later on the Loans tab.'}
            </span>
          </>
        ) : null}
        {kind === 'PURCHASE' ? <input value={reference} onChange={(e) => setReference(readValue(e))} placeholder="Invoice / DO no. (optional)" style={{ ...input, height: 40 }} /> : null}
        {kind === 'WASTE' ? <ReasonPicker value={reason} onChange={setReason} /> : null}
        {oldDate || future ? (
          <span style={{ fontSize: 13, color: 'var(--t-color-amber11)', fontWeight: 500 }}>
            {future ? `This date is ${-daysAgo} day${daysAgo === -1 ? '' : 's'} in the future` : `This is dated ${shortDate(date)}, ${daysAgo} days ago, not today`}. It is saved as a new entry with that date.
          </span>
        ) : null}
        <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder="🔍 Type a code or name…" style={{ ...input, height: 44, fontSize: 15 }} />
        {q ? null : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ value: 'usual', label: '★ Usual' }, { value: 'all', label: `All ${items.length}` }, ...groupsHere.map((g) => ({ value: g.value, label: g.label.split(' ')[0] }))].map((v) => (
              <button key={v.value} onClick={() => setView(v.value)} style={{ ...control, height: 32, fontSize: 13, background: view === v.value ? c.accent : c.bg, color: view === v.value ? 'white' : c.text, borderColor: view === v.value ? c.accent : c.border2 }}>
                {v.label}
              </button>
            ))}
          </div>
        )}
        <span style={{ fontSize: 12, color: c.text3 }}>
          {q ? `${shown.length} match${shown.length === 1 ? '' : 'es'} (searching all items by code, name or group)` : view === 'usual' ? `${usualLabel}. Tap All or a group to see everything.` : `${shown.length} items, by code`}
        </span>
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
                    {lastDone.get(item.id) ? ` · last ${verb} ${shortDate(lastDone.get(item.id) ?? null)}` : ` · never ${verb}`}
                    {picked ? <b style={{ color: c.accent }}> · {isOut ? '−' : '+'}{cartonsAndUnits(picked, item)}</b> : null}
                  </div>
                </div>
                {item.unitsPerCarton > 1 ? (
                  <button onClick={() => add(item, item.unitsPerCarton)} style={big} title={`One carton = ${item.unitsPerCarton} ${item.unit || 'units'}`}>
                    +1 carton
                  </button>
                ) : null}
                <button onClick={() => add(item, 1)} style={big} title="One unit">
                  +1 {item.unit || 'unit'}
                </button>
                {picked ? (
                  <button onClick={() => add(item, item.unitsPerCarton > 1 && picked >= item.unitsPerCarton ? -item.unitsPerCarton : -1)} style={{ ...big, minWidth: 40 }} title="One less">
                    −1
                  </button>
                ) : null}
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
                    {!isOut ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 8px' }}>
                        <span style={{ fontSize: 12, color: c.text3 }}>expires</span>
                        <input type="date" value={expiry[id] ?? defaultExpiry(item, date)} onChange={(e) => setExpiry({ ...expiry, [id]: readValue(e) })} placeholder="no expiry" title={item.shelfLifeDays ? `Filled in from the ${item.shelfLifeDays}-day shelf life` : 'Expiry date (optional)'} style={{ ...input, width: 148, height: 34 }} />
                        <input value={cost[id] ?? ''} onChange={(e) => setCost({ ...cost, [id]: readValue(e) })} inputMode="decimal" placeholder={`RM ${item.cartonPrice.toFixed(2)} / ctn`} title="Price per carton on the invoice (empty = the list price)" style={{ ...input, width: 128, height: 34 }} />
                        <PriceNote price={(toNumber(cost[id] ?? '') || item.cartonPrice) / (item.unitsPerCarton || 1)} last={lastPaid.get(id)} unit={item.unit || 'unit'} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          <BelowZeroBar message={saver.confirm} busy={busy} onYes={saver.confirmYes} onNo={saver.confirmNo} />
          {whyNot ? <div style={{ fontSize: 13, color: 'var(--t-color-amber11)', fontWeight: 500 }}>{whyNot}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ ...big, flex: 1 }}>
              Cancel
            </button>
            <button onClick={save} disabled={busy || !lines.length || !isFullDate(date) || (kind === 'WASTE' && !reason) || needsShop || staffShort || !!saver.confirm} style={{ ...primary, ...{ height: 40, fontSize: 15 }, flex: 2, opacity: busy || !lines.length || !isFullDate(date) || (kind === 'WASTE' && !reason) || needsShop || staffShort || !!saver.confirm ? 0.5 : 1 }}>
              {busy ? 'Saving…' : askFirst ? `Yes, save with ${shortDate(date)}` : `Save ${lines.length} item${lines.length === 1 ? '' : 's'}`}
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
      reason: 'EXPIRED',
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
