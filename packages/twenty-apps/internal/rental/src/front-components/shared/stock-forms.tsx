import { type ReactNode, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { c, control, Field, input, primary, qty, select, small } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { cartonsAndUnits, type StockItem, type StockMovement, type StockRule, unitPrice } from 'src/shared/stock';
import { STOCK_GROUPS, STOCK_MOVEMENT_TYPES } from 'src/shared/stock-types';

// The Stock page's forms: add/edit an item, record IN/OUT, settle a lending,
// stock take and the re-order rule.

type Result = { success: boolean; message?: string; needsWriteOff?: boolean };

const requestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Saves that are safe to send again: the server recognises the request id
// (or the change is the same whatever the number of times).
const RETRYABLE = ['record', 'settleBorrow', 'stockTake', 'setStatus', 'saveRule', 'deleteMovement', 'data', 'saveOrder', 'receiveOrder', 'setOrderStatus'];

export const stockAction = async (body: Record<string, unknown>): Promise<Result> => {
  const payload = { ...body, requestId: requestId() };
  // A new item has no id yet, so it is only sent once.
  const attempts = RETRYABLE.includes(String(body.action)) || (body.action === 'saveItem' && body.id) ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await new RestApiClient().post<Result>('/s/stock', payload);

      if (!result.needsWriteOff) await enqueueSnackbar({ message: result.message ?? (result.success ? 'Saved.' : 'Could not save.'), variant: result.success ? 'success' : 'error' });

      return result;
    } catch (error) {
      // The connection dropped or the server was busy starting up: try again.
      lastError = error;
      if (attempt < attempts) await wait(attempt * 1500);
    }
  }

  await enqueueSnackbar({
    message: `Could not reach the server, so nothing was saved. Please try again in a moment. (${lastError instanceof Error ? lastError.message : 'connection problem'})`,
    variant: 'error',
  });

  return { success: false };
};

const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toNumber = (value: string) => Number(value.replace(/[^0-9.]/g, '')) || 0;

const Shell = ({ title, intro, onClose, children }: { title: string; intro?: string; onClose: () => void; children: ReactNode }) => (
  <Sheet width={520} onClose={onClose}>
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
      {intro ? <span style={{ fontSize: 13, color: c.text2 }}>{intro}</span> : null}
      {children}
    </div>
  </Sheet>
);

const Buttons = ({ onClose, onSave, busy, ready, label }: { onClose: () => void; onSave: () => void; busy: boolean; ready: boolean; label: string }) => (
  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
    <button onClick={onClose} style={control}>
      Cancel
    </button>
    <button onClick={onSave} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
      {busy ? 'Saving…' : label}
    </button>
  </div>
);

// Cartons + loose units, stored as units.
const QtyInput = ({ item, units, onChange }: { item: StockItem | undefined; units: number; onChange: (units: number) => void }) => {
  const per = item?.unitsPerCarton || 1;
  const [ctn, setCtn] = useState(per > 1 ? String(Math.floor(units / per) || '') : '');
  const [loose, setLoose] = useState(per > 1 ? String(Math.round((units % per) * 100) / 100 || '') : String(units || ''));
  const update = (nextCtn: string, nextLoose: string) => {
    setCtn(nextCtn);
    setLoose(nextLoose);
    onChange(toNumber(nextCtn) * per + toNumber(nextLoose));
  };

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {per > 1 ? (
        <>
          <input value={ctn} onChange={(e) => update(readValue(e), loose)} inputMode="decimal" placeholder="0" style={{ ...input, width: 56 }} />
          <span style={{ fontSize: 12, color: c.text3 }}>ctn</span>
        </>
      ) : null}
      <input value={loose} onChange={(e) => update(ctn, readValue(e))} inputMode="decimal" placeholder="0" style={{ ...input, width: 60 }} />
      <span style={{ fontSize: 12, color: c.text3, whiteSpace: 'nowrap' }}>{item?.unit || 'unit'}</span>
    </div>
  );
};

// ---------------------------------------------------------------- Add / edit item

export const ItemSheet = ({ item, owners, defaultOwnerId, today, onClose, onDone }: { item: StockItem | null; owners: StockOwner[]; defaultOwnerId: string; today: string; onClose: () => void; onDone: () => void }) => {
  const [form, setForm] = useState({
    ownerId: item?.ownerId ?? defaultOwnerId ?? owners[0]?.id ?? '',
    code: item?.code ?? '',
    name: item?.name ?? '',
    specification: item?.specification ?? '',
    group: item?.group ?? 'RAW',
    unit: item?.unit ?? 'bag',
    unitsPerCarton: String(item?.unitsPerCarton ?? 1),
    cartonPrice: item ? String(item.cartonPrice) : '',
    supplier: item?.supplier ?? '',
    reorderBelowMonths: item?.reorderBelowMonths != null ? String(item.reorderBelowMonths) : '',
    notes: item?.notes ?? '',
    openingUnits: 0,
    expiryDate: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: Parameters<typeof readValue>[0]) => setForm({ ...form, [key]: readValue(e) });
  const preview = { unitsPerCarton: toNumber(form.unitsPerCarton) || 1, unit: form.unit } as StockItem;

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'saveItem', id: item?.id, ...form, openingDate: today });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Shell title={item ? `Edit ${item.name}` : 'Add stock item'} onClose={onClose}>
      {!item ? (
        <Field label="Workspace">
          <select value={form.ownerId} onChange={set('ownerId')} style={select}>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
        <Field label="Item code">
          <input value={form.code} onChange={set('code')} placeholder="1.045" style={input} />
        </Field>
        <Field label="Product name">
          <input value={form.name} onChange={set('name')} placeholder="原味冰淇淋粉 Original Ice Cream Powder" style={input} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Specification">
          <input value={form.specification} onChange={set('specification')} placeholder="3kg*8袋/件" style={input} />
        </Field>
        <Field label="Group">
          <select value={form.group} onChange={set('group')} style={select}>
            {STOCK_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Field label="Inner unit">
          <input value={form.unit} onChange={set('unit')} placeholder="bag" style={input} />
        </Field>
        <Field label="Units per carton">
          <input value={form.unitsPerCarton} onChange={set('unitsPerCarton')} inputMode="numeric" style={input} />
        </Field>
        <Field label="Carton price (RM)">
          <input value={form.cartonPrice} onChange={set('cartonPrice')} inputMode="decimal" placeholder="0.00" style={input} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Supplier">
          <input value={form.supplier} onChange={set('supplier')} placeholder="WeDrink" style={input} />
        </Field>
        <Field label="Re-order below (months)" hint="Empty = the workspace rule">
          <input value={form.reorderBelowMonths} onChange={set('reorderBelowMonths')} inputMode="decimal" placeholder="1.5" style={input} />
        </Field>
      </div>
      {!item ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
          <Field label="Stock in hand now (opening)">
            <QtyInput item={preview} units={0} onChange={(units) => setForm({ ...form, openingUnits: units })} />
          </Field>
          <Field label="Expiry of that stock">
            <input type="date" value={form.expiryDate} onChange={set('expiryDate')} style={input} />
          </Field>
        </div>
      ) : null}
      <Field label="Notes">
        <input value={form.notes} onChange={set('notes')} style={input} />
      </Field>
      <Buttons onClose={onClose} onSave={save} busy={busy} ready={Boolean(form.name.trim() && toNumber(form.unitsPerCarton) > 0)} label={item ? 'Save item' : 'Add item'} />
    </Shell>
  );
};

// ---------------------------------------------------------------- Record IN / OUT

type Line = { key: number; itemId: string; units: number; unitCost: string; expiryDate: string };

const PARTY_HINT: Record<string, string> = {
  PURCHASE: 'Supplier',
  TAKE: 'Taken to (e.g. Wawa)',
  BORROW: 'Branch that borrowed it',
  WASTE: 'Reason / where',
  RETURN: 'Returned by',
  EXCHANGE_IN: 'Received from',
};

export const RecordSheet = ({
  items,
  balances,
  initialType,
  initialItemId,
  initialLines,
  initialReference,
  today,
  onClose,
  onDone,
}: {
  items: StockItem[];
  balances: Map<string, number>;
  initialType: string;
  initialItemId?: string;
  initialLines?: Array<{ itemId: string; units: number }>;
  initialReference?: string;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [type, setType] = useState(initialType);
  const [date, setDate] = useState(today);
  const [party, setParty] = useState(initialType === 'TAKE' ? 'Wawa' : initialType === 'PURCHASE' ? 'WeDrink' : '');
  const [reference, setReference] = useState(initialReference ?? '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>(
    initialLines?.length
      ? initialLines.map((l, index) => ({ key: index + 1, itemId: l.itemId, units: l.units, unitCost: '', expiryDate: '' }))
      : [{ key: 1, itemId: initialItemId ?? '', units: 0, unitCost: '', expiryDate: '' }],
  );
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const choosable = items.filter((i) => i.status !== 'DISCONTINUED' || type !== 'PURCHASE');
  const isOut = STOCK_MOVEMENT_TYPES.find((t) => t.value === type)?.direction === 'OUT';
  const ready = isFullDate(date) && lines.some((l) => l.itemId && l.units > 0) && !lines.some((l) => l.itemId && !(l.units > 0)) && (type !== 'BORROW' || party.trim());
  const total = lines.reduce((sum, l) => {
    const item = byId.get(l.itemId);

    return item ? sum + l.units * (type === 'PURCHASE' && l.unitCost ? toNumber(l.unitCost) : unitPrice(item)) : sum;
  }, 0);

  const setLine = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    setBusy(true);
    const result = await stockAction({
      action: 'record',
      type,
      date,
      party,
      reference,
      notes,
      lines: lines.filter((l) => l.itemId && l.units > 0).map((l) => ({ itemId: l.itemId, quantity: l.units, unitCost: l.unitCost ? toNumber(l.unitCost) : undefined, expiryDate: l.expiryDate || undefined })),
    });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Shell title="Record stock in / out" intro="One date, one kind of movement, as many items as you like." onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="What happened">
          <select
            value={type}
            onChange={(e) => {
              const next = readValue(e);

              setType(next);
              setParty(next === 'TAKE' ? 'Wawa' : next === 'PURCHASE' ? 'WeDrink' : '');
            }}
            style={select}
          >
            {STOCK_MOVEMENT_TYPES.filter((t) => !t.value.startsWith('ADJUST')).map((t) => (
              <option key={t.value} value={t.value}>
                {t.direction === 'IN' ? 'IN · ' : 'OUT · '}
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" hint={isFullDate(date) ? undefined : 'Pick a full date (day, month and year).'}>
          <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label={PARTY_HINT[type] ?? 'To / from'}>
          <input value={party} onChange={(e) => setParty(readValue(e))} style={input} />
        </Field>
        <Field label={type === 'PURCHASE' ? 'Invoice / DO no.' : 'Reference'}>
          <input value={reference} onChange={(e) => setReference(readValue(e))} style={input} />
        </Field>
      </div>
      {type === 'RETURN' || type === 'EXCHANGE_IN' ? (
        <span style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>To settle a lending, use Settle on the Borrowed tab instead: it links the return to the lending.</span>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
        {lines.map((l) => {
          const item = byId.get(l.itemId);
          const left = item ? balances.get(item.id) ?? 0 : 0;

          return (
            <div key={l.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8, borderBottom: `1px dashed ${c.border}` }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={l.itemId} onChange={(e) => setLine(l.key, { itemId: readValue(e) })} style={{ ...select, flex: 1, minWidth: 0 }}>
                  <option value="">Choose an item…</option>
                  {choosable.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.code ? `${i.code} ` : ''}
                      {i.name}
                    </option>
                  ))}
                </select>
                {lines.length > 1 ? (
                  <button onClick={() => setLines(lines.filter((x) => x.key !== l.key))} style={{ ...small, height: 34 }} title="Remove line">
                    ✕
                  </button>
                ) : null}
              </div>
              {item ? (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <QtyInput key={`${l.key}-${item.id}`} item={item} units={l.units} onChange={(units) => setLine(l.key, { units })} />
                  {type === 'PURCHASE' ? (
                    <>
                      <input
                        value={l.unitCost}
                        onChange={(e) => setLine(l.key, { unitCost: readValue(e) })}
                        placeholder={`RM ${unitPrice(item).toFixed(2)}/${item.unit || 'unit'}`}
                        style={{ ...input, width: 130 }}
                        title="Cost per unit (empty = carton price ÷ units)"
                      />
                      <input type="date" value={l.expiryDate} onChange={(e) => setLine(l.key, { expiryDate: readValue(e) })} style={{ ...input, width: 150 }} title="Expiry date" />
                    </>
                  ) : null}
                  <span style={{ fontSize: 12, color: isOut && l.units > left ? 'var(--t-color-red11)' : c.text3 }}>
                    In stock: {cartonsAndUnits(left, item)}
                    {isOut && l.units > left ? ' (not enough)' : ''}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
        <button onClick={() => setLines([...lines, { key: Date.now(), itemId: '', units: 0, unitCost: '', expiryDate: '' }])} style={{ ...small, alignSelf: 'flex-start' }}>
          + Add another item
        </button>
      </div>
      <Field label="Notes">
        <input value={notes} onChange={(e) => setNotes(readValue(e))} style={input} />
      </Field>
      <span style={{ fontSize: 13, color: c.text2 }}>Value: RM {total.toFixed(2)}</span>
      <Buttons onClose={onClose} onSave={save} busy={busy} ready={Boolean(ready)} label="Save" />
    </Shell>
  );
};

// ---------------------------------------------------------------- Settle a lending

export const SettleSheet = ({ borrow, item, items, today, onClose, onDone }: { borrow: StockMovement; item: StockItem; items: StockItem[]; today: string; onClose: () => void; onDone: () => void }) => {
  const [how, setHow] = useState<'RETURNED' | 'EXCHANGED' | 'PAID'>('RETURNED');
  const [date, setDate] = useState(today);
  const [units, setUnits] = useState(borrow.quantity);
  const [exchangeItemId, setExchangeItemId] = useState('');
  const [exchangeUnits, setExchangeUnits] = useState(0);
  const [amount, setAmount] = useState((borrow.quantity * unitPrice(item)).toFixed(2));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const other = items.find((i) => i.id === exchangeItemId);
  const ready = how === 'RETURNED' ? units > 0 : how === 'EXCHANGED' ? Boolean(other && exchangeUnits > 0) : toNumber(amount) > 0;

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'settleBorrow', movementId: borrow.id, how, date, quantity: units, exchangeItemId, exchangeQuantity: exchangeUnits, amount: toNumber(amount), notes });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Shell title={`Settle: ${borrow.party || 'branch'} borrowed ${item.name}`} intro={`${cartonsAndUnits(borrow.quantity, item)} lent on ${borrow.date}.`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(
          [
            ['RETURNED', 'Returned the same item'],
            ['EXCHANGED', 'Gave another item'],
            ['PAID', 'Paid money'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} onClick={() => setHow(value)} style={{ ...small, height: 32, fontWeight: how === value ? 600 : 400, borderColor: how === value ? c.accent : c.border2 }}>
            {label}
          </button>
        ))}
      </div>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={input} />
      </Field>
      {how === 'RETURNED' ? (
        <Field label="How much came back">
          <QtyInput item={item} units={units} onChange={setUnits} />
        </Field>
      ) : null}
      {how === 'EXCHANGED' ? (
        <>
          <Field label="Item received instead">
            <select value={exchangeItemId} onChange={(e) => setExchangeItemId(readValue(e))} style={select}>
              <option value="">Choose an item…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code ? `${i.code} ` : ''}
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          {other ? (
            <Field label="How much of it">
              <QtyInput key={other.id} item={other} units={0} onChange={setExchangeUnits} />
            </Field>
          ) : null}
        </>
      ) : null}
      {how === 'PAID' ? (
        <Field label="Amount paid (RM)" hint="Recorded as income (Transactions → Money in). Suggested: the stock's cost.">
          <input value={amount} onChange={(e) => setAmount(readValue(e))} inputMode="decimal" style={input} />
        </Field>
      ) : null}
      <Field label="Notes">
        <input value={notes} onChange={(e) => setNotes(readValue(e))} style={input} />
      </Field>
      <Buttons onClose={onClose} onSave={save} busy={busy} ready={ready} label="Settle" />
    </Shell>
  );
};

// ---------------------------------------------------------------- Stock take

export const StockTakeSheet = ({ items, balances, today, onClose, onDone }: { items: StockItem[]; balances: Map<string, number>; today: string; onClose: () => void; onDone: () => void }) => {
  const [date, setDate] = useState(today);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const entered = Object.keys(counts);

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'stockTake', date, counts: entered.map((itemId) => ({ itemId, counted: counts[itemId] })) });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Shell
      title="Stock take"
      intro="Type what you counted. Only items you fill in are checked; differences are saved as stock-take adjustments on that date."
      onClose={onClose}
    >
      <Field label="Counted on">
        <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, width: 170 }} />
      </Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => {
          const expected = balances.get(item.id) ?? 0;
          const counted = counts[item.id];
          const diff = counted === undefined ? 0 : Math.round((counted - expected) * 100) / 100;

          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px dashed ${c.border}`, paddingBottom: 6, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: c.text3 }}>Expected {cartonsAndUnits(expected, item)}</div>
              </div>
              <QtyInput item={item} units={0} onChange={(units) => setCounts({ ...counts, [item.id]: units })} />
              {counted !== undefined && diff !== 0 ? (
                <span style={{ fontSize: 12, width: 70, textAlign: 'right', color: diff < 0 ? 'var(--t-color-red11)' : 'var(--t-color-green11)' }}>
                  {diff > 0 ? '+' : ''}
                  {qty(diff)}
                </span>
              ) : (
                <span style={{ width: 70 }} />
              )}
            </div>
          );
        })}
      </div>
      <Buttons onClose={onClose} onSave={save} busy={busy} ready={entered.length > 0} label={`Save count (${entered.length})`} />
    </Shell>
  );
};

// ---------------------------------------------------------------- Discontinue with stock left

export const WriteOffSheet = ({ item, message, today, onClose, onDone }: { item: StockItem; message: string; today: string; onClose: () => void; onDone: () => void }) => {
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'setStatus', itemId: item.id, status: 'DISCONTINUED', writeOff: true, date: today });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Shell title={`Discontinue ${item.name}?`} intro={message} onClose={onClose}>
      <span style={{ fontSize: 13, color: c.text2 }}>
        Writing it off records the rest as waste today, so the balance becomes 0. If you can still use or return it, cancel and record that first.
      </span>
      <Buttons onClose={onClose} onSave={save} busy={busy} ready label="Write off and discontinue" />
    </Shell>
  );
};

// ---------------------------------------------------------------- Re-order rule

export const RuleSheet = ({ owner, onClose, onDone }: { owner: StockOwner; onClose: () => void; onDone: () => void }) => {
  const [rule, setRule] = useState<{ reorderBelow: string; orderUpTo: string }>({ reorderBelow: String(owner.rule.reorderBelow), orderUpTo: String(owner.rule.orderUpTo) });
  const [busy, setBusy] = useState(false);
  const parsed: StockRule = { reorderBelow: toNumber(rule.reorderBelow), orderUpTo: toNumber(rule.orderUpTo) };

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'saveRule', ownerId: owner.id, ...parsed });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Shell title={`Re-order rule · ${owner.name}`} intro="Each item can override the first number on its own." onClose={onClose}>
      <Field label="Re-order when stock lasts less than (months)">
        <input value={rule.reorderBelow} onChange={(e) => setRule({ ...rule, reorderBelow: readValue(e) })} inputMode="decimal" style={input} />
      </Field>
      <Field label="Order enough for (months)" hint="The suggested order tops the item up to this many months of next month's forecast, in whole cartons.">
        <input value={rule.orderUpTo} onChange={(e) => setRule({ ...rule, orderUpTo: readValue(e) })} inputMode="decimal" style={input} />
      </Field>
      <Buttons onClose={onClose} onSave={save} busy={busy} ready={parsed.reorderBelow > 0 && parsed.orderUpTo >= parsed.reorderBelow} label="Save rule" />
    </Shell>
  );
};
