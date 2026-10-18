import { type ReactNode, useMemo, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { readValue } from 'src/front-components/shared/read-value';
import { ItemPicker } from 'src/front-components/shared/item-picker';
import { Sheet } from 'src/front-components/shared/sheet';
import { c, control, Field, input, knownShop, parseNumber, PriceNote, primary, qty, ReasonPicker, select, ShopChips, small } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { cartonsAndUnits, defaultExpiry, loanRemaining, type StockItem, type StockMovement, type StockRule, unitPrice } from 'src/shared/stock';
import { STOCK_GROUPS, STOCK_MOVEMENT_TYPES } from 'src/shared/stock-types';

// The Stock page's forms: add/edit an item, record IN/OUT, settle a lending,
// stock take and the re-order rule.

type Result = { success: boolean; message?: string; needsWriteOff?: boolean; needsNegativeOk?: boolean; offline?: boolean };

export const requestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Saves that are safe to send again: the server recognises the request id
// (or the change is the same whatever the number of times).
const RETRYABLE = ['setOrderPhone', 'saveRequest', 'issueRequest', 'resolveShort', 'alerts', 'importExcel', 'readCounts', 'record', 'settleBorrow', 'stockTake', 'setStatus', 'saveRule', 'deleteMovement', 'data', 'saveOrder', 'receiveOrder', 'setOrderStatus', 'closeMonth', 'reopenMonth'];

// An answer the server gave with an error status (older routes): the client throws
// "<status>: <body>", so read the body back instead of treating it as a dropped connection.
const answerIn = (error: unknown): Result | null => {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const start = text.indexOf('{');

  if (start < 0) return null;
  try {
    const parsed = JSON.parse(text.slice(start)) as Result;

    return typeof parsed === 'object' && parsed && 'success' in parsed ? parsed : null;
  } catch {
    return null;
  }
};

export const stockAction = async (body: Record<string, unknown>): Promise<Result> => {
  // The same id on every try (and on a second tap after a dropped connection), so the server saves it once.
  const payload = { ...body, requestId: typeof body.requestId === 'string' && body.requestId ? body.requestId : requestId() };
  // A new item has no id yet, so it is only sent once.
  const attempts = RETRYABLE.includes(String(body.action)) || (body.action === 'saveItem' && body.id) ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await new RestApiClient().post<Result>('/s/stock', payload);

      if (!result.needsWriteOff && !result.needsNegativeOk) await enqueueSnackbar({ message: result.message ?? (result.success ? 'Saved.' : 'Could not save.'), variant: result.success ? 'success' : 'error' });

      return result;
    } catch (error) {
      const answer = answerIn(error);

      // A real answer (not allowed, not found...): show it, do not retry.
      if (answer) {
        if (!answer.needsWriteOff && !answer.needsNegativeOk) await enqueueSnackbar({ message: answer.message ?? 'Could not save.', variant: 'error' });

        return answer;
      }
      // The connection dropped or the server was busy starting up: try again.
      lastError = error;
      if (attempt < attempts) await wait(attempt * 1500);
    }
  }

  await enqueueSnackbar({
    message: `The connection dropped, so it may or may not have saved. Check the list; if it is not there, tap Save again (it will not be saved twice). (${lastError instanceof Error ? lastError.message : 'connection problem'})`,
    variant: 'error',
  });

  return { success: false, offline: true };
};

// Saving from a sheet: one request id until the server answers (so a second tap after a
// dropped connection never saves twice), and a "below zero" question for a manager.
export const useStockSave = (onDone: () => void) => {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const id = useRef(requestId());
  const last = useRef<Record<string, unknown>>({});

  const run = async (body: Record<string, unknown>, allowNegative = false) => {
    if (busy) return;
    last.current = body;
    setBusy(true);
    const result = await stockAction({ ...body, requestId: id.current, ...(allowNegative ? { allowNegative: true } : {}) });

    setBusy(false);
    if (result.needsNegativeOk) {
      setConfirm(result.message ?? 'Not enough stock.');

      return;
    }
    setConfirm('');
    // A definite answer: the next save is a new one.
    if (!result.offline) id.current = requestId();
    if (result.success) onDone();
  };

  return { busy, confirm, run, confirmYes: () => run(last.current, true), confirmNo: () => setConfirm('') };
};

// A manager taking out more than the system says is there.
export const BelowZeroBar = ({ message, busy, onYes, onNo }: { message: string; busy: boolean; onYes: () => void; onNo: () => void }) =>
  message ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 8, border: '1px solid var(--t-color-amber9)', background: 'var(--t-color-amber2)' }}>
      <span style={{ fontSize: 13, color: 'var(--t-color-amber11)', fontWeight: 500 }}>{message}</span>
      <span style={{ fontSize: 12, color: c.text2 }}>Better: count the shelf first. Only save if you are sure the stock really went out.</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onNo} style={control}>
          No, go back
        </button>
        <button onClick={onYes} disabled={busy} style={{ ...primary, background: 'var(--t-color-amber9)', borderColor: 'var(--t-color-amber9)' }}>
          {busy ? 'Saving…' : 'Yes, save below zero'}
        </button>
      </div>
    </div>
  ) : null;

const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toNumber = parseNumber;

const Shell = ({ title, intro, onClose, children }: { title: string; intro?: string; onClose: () => void; children: ReactNode }) => (
  <Sheet width={520} onClose={onClose}>
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
      {intro ? <span style={{ fontSize: 13, color: c.text2 }}>{intro}</span> : null}
      {children}
    </div>
  </Sheet>
);

const Buttons = ({ onClose, onSave, busy, ready, label, why }: { onClose: () => void; onSave: () => void; busy: boolean; ready: boolean; label: string; why?: string }) => (
  <>
  {why && !ready ? <div style={{ fontSize: 13, color: 'var(--t-color-amber11)', fontWeight: 500, textAlign: 'right' }}>{why}</div> : null}
  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
    <button onClick={onClose} style={control}>
      Cancel
    </button>
    <button onClick={onSave} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
      {busy ? 'Saving…' : label}
    </button>
  </div>
  </>
);

// Cartons + loose units, stored as units.
export const QtyInput = ({ item, units, onChange }: { item: StockItem | undefined; units: number; onChange: (units: number) => void }) => {
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
    shelfLifeDays: item?.shelfLifeDays != null ? String(item.shelfLifeDays) : '',
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
      {!item && owners.length > 1 ? (
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
        <Field label="Re-order below (months)" hint="Empty = the business rule">
          <input value={form.reorderBelowMonths} onChange={set('reorderBelowMonths')} inputMode="decimal" placeholder="1.5" style={input} />
        </Field>
      </div>
      <Field label="Shelf life (days)" hint="How long it keeps, e.g. 180. When stock comes in without an expiry date, it gets this many days from the day it arrives. Empty = no automatic expiry.">
        <input value={form.shelfLifeDays} onChange={set('shelfLifeDays')} inputMode="numeric" placeholder="e.g. 180" style={{ ...input, width: 160 }} />
      </Field>
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
  BORROW: 'Shop that borrowed it',
  BORROW_IN: 'Shop that lent it to you',
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
  lastPaid,
  shops = [],
  lastParty = () => '',
  today,
  onClose,
  onDone,
}: {
  items: StockItem[];
  balances: Map<string, number>;
  lastPaid?: Map<string, number>; // per unit, the last delivery's price
  shops?: string[]; // shops used in earlier loans
  lastParty?: (type: string) => string; // the name used last time for this kind
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
  const [party, setParty] = useState(initialType === 'TAKE' || initialType === 'PURCHASE' ? lastParty(initialType) : '');
  const [reference, setReference] = useState(initialReference ?? '');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  // Purchases also go into Expenses (switch off if the bill is recorded already).
  const [addExpense, setAddExpense] = useState(true);
  const [lines, setLines] = useState<Line[]>(
    initialLines?.length
      ? initialLines.map((l, index) => ({ key: index + 1, itemId: l.itemId, units: l.units, unitCost: '', expiryDate: '' }))
      : [{ key: 1, itemId: initialItemId ?? '', units: 0, unitCost: '', expiryDate: '' }],
  );
  const saver = useStockSave(onDone);
  const busy = saver.busy;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const choosable = items.filter((i) => i.status !== 'DISCONTINUED' || type !== 'PURCHASE');
  const isOut = STOCK_MOVEMENT_TYPES.find((t) => t.value === type)?.direction === 'OUT';
  const ready = isFullDate(date) && lines.some((l) => l.itemId && l.units > 0) && !lines.some((l) => l.itemId && !(l.units > 0)) && (!['BORROW', 'BORROW_IN'].includes(type) || party.trim()) && (type !== 'WASTE' || reason);
  const total = lines.reduce((sum, l) => {
    const item = byId.get(l.itemId);

    return item ? sum + l.units * (type === 'PURCHASE' && l.unitCost ? toNumber(l.unitCost) : unitPrice(item)) : sum;
  }, 0);

  const setLine = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const why = !isFullDate(date)
    ? 'Pick a full date.'
    : !lines.some((l) => l.itemId && l.units > 0)
      ? 'Pick an item and type how much.'
      : lines.some((l) => l.itemId && !(l.units > 0))
        ? 'Every item needs a quantity (or remove the line).'
        : ['BORROW', 'BORROW_IN'].includes(type) && !party.trim()
          ? 'Say which shop.'
          : type === 'WASTE' && !reason
            ? 'Pick why it was wasted.'
            : '';

  const save = () =>
    saver.run({
      action: 'record',
      type,
      date,
      party: type === 'BORROW' || type === 'BORROW_IN' ? knownShop(shops, party) : party,
      reference,
      notes,
      reason: type === 'WASTE' ? reason : undefined,
      addExpense: type === 'PURCHASE' ? addExpense : undefined,
      lines: lines
        .filter((l) => l.itemId && l.units > 0)
        .map((l) => ({ itemId: l.itemId, quantity: l.units, unitCost: l.unitCost ? toNumber(l.unitCost) : undefined, ...(l.expiryDate === 'none' ? { noExpiry: true } : { expiryDate: l.expiryDate || undefined }) })),
    });

  return (
    <Shell title="Record stock in / out" intro="One date, one kind of movement, as many items as you like." onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="What happened">
          <select
            value={type}
            onChange={(e) => {
              const next = readValue(e);

              setType(next);
              setParty(next === 'TAKE' || next === 'PURCHASE' ? lastParty(next) : '');
            }}
            style={select}
          >
            {STOCK_MOVEMENT_TYPES.filter((t) => !t.value.startsWith('ADJUST') && t.value !== 'GIVE_BACK' && t.value !== 'LOAN_SETTLED').map((t) => (
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
        {type === 'WASTE' ? (
          <ReasonPicker value={reason} onChange={setReason} />
        ) : (
          <Field label={PARTY_HINT[type] ?? 'To / from'}>
            <input value={party} onChange={(e) => setParty(readValue(e))} style={input} />
          </Field>
        )}
        <Field label={type === 'PURCHASE' ? 'Invoice / DO no.' : 'Reference'}>
          <input value={reference} onChange={(e) => setReference(readValue(e))} style={input} />
        </Field>
      </div>
      {type === 'RETURN' || type === 'EXCHANGE_IN' ? (
        <span style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>To settle a lending, use Settle on the Loans tab instead: it links the return to the lending.</span>
      ) : null}
      {type === 'BORROW' || type === 'BORROW_IN' ? <ShopChips shops={shops} value={party} onPick={setParty} /> : null}
      {type === 'BORROW_IN' ? (
        <span style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>
          Stock you borrow from another shop. It stays on the Loans tab until you give it back, swap it for another item or pay for it, and it is not counted as yours when working out what to re-order.
        </span>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
        {lines.map((l) => {
          const item = byId.get(l.itemId);
          const left = item ? balances.get(item.id) ?? 0 : 0;

          return (
            <div key={l.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8, borderBottom: `1px dashed ${c.border}` }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <ItemPicker items={choosable} value={l.itemId} onChange={(itemId) => setLine(l.key, { itemId })} />
                </div>
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
                      <input type="date" value={l.expiryDate === 'none' ? '' : l.expiryDate || defaultExpiry(item, date)} onChange={(e) => setLine(l.key, { expiryDate: readValue(e) || 'none' })} style={{ ...input, width: 150 }} title={item.shelfLifeDays ? `Expiry date (filled in from the ${item.shelfLifeDays}-day shelf life)` : 'Expiry date'} />
                    </>
                  ) : null}
                  <span style={{ fontSize: 12, color: isOut && l.units > left ? 'var(--t-color-red11)' : c.text3 }}>
                    In stock: {cartonsAndUnits(left, item)}
                    {isOut && l.units > left ? ' (not enough)' : ''}
                  </span>
                  {type === 'PURCHASE' && l.unitCost ? <PriceNote price={toNumber(l.unitCost)} last={lastPaid?.get(item.id)} unit={item.unit || 'unit'} /> : null}
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: c.text2 }}>Value: RM {total.toFixed(2)}</span>
        {type === 'PURCHASE' ? (
          <button
          onClick={() => setAddExpense(!addExpense)}
          style={{ ...small, height: 30, alignSelf: 'flex-start', fontWeight: 600, color: addExpense ? 'var(--t-color-green11)' : c.text3, borderColor: addExpense ? 'var(--t-color-green9)' : c.border2 }}
          title="Book the cost as an expense (Stock & ingredients) so it shows in Expenses, Transactions and the year summary"
        >
          {addExpense ? '✓ Also add to Expenses' : 'Not added to Expenses'}
        </button>
        ) : null}
      </div>
      <BelowZeroBar message={saver.confirm} busy={busy} onYes={saver.confirmYes} onNo={saver.confirmNo} />
      <Buttons onClose={onClose} onSave={save} busy={busy} ready={Boolean(ready) && !saver.confirm} label="Save" why={why} />
    </Shell>
  );
};

// ---------------------------------------------------------------- Settle a loan

// A loan between shops, lent out (BORROW) or borrowed in (BORROW_IN). It can be
// settled in parts: with the same item, another item, or money.
export const SettleSheet = ({
  borrow,
  item,
  items,
  movements,
  today,
  onClose,
  onDone,
}: {
  borrow: StockMovement;
  item: StockItem;
  items: StockItem[];
  movements: StockMovement[];
  today: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const borrowedIn = borrow.type === 'BORROW_IN';
  const left = loanRemaining(borrow, movements);
  const [how, setHow] = useState<'RETURNED' | 'EXCHANGED' | 'PAID'>('RETURNED');
  const [date, setDate] = useState(today);
  const [units, setUnits] = useState(left);
  const [exchangeItemId, setExchangeItemId] = useState('');
  const [exchangeUnits, setExchangeUnits] = useState(0);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const saver = useStockSave(onDone);
  const busy = saver.busy;
  // "Another item" means another item: the same one is "give it back".
  const others = items.filter((i) => i.id !== item.id);
  const other = others.find((i) => i.id === exchangeItemId);
  const suggested = (units * unitPrice(item)).toFixed(2);
  const paid = toNumber(amount || suggested);
  const covered = units > 0 && units <= left + 0.005;
  const ready = isFullDate(date) && covered && (how === 'RETURNED' ? true : how === 'EXCHANGED' ? Boolean(other && exchangeUnits > 0) : paid > 0);
  const who = borrow.party || (borrowedIn ? 'the shop' : 'a shop');

  const tooEarly = isFullDate(date) && date < borrow.date;
  const why = tooEarly
    ? `The loan started on ${borrow.date}: pick that day or later.`
    : !covered
      ? units > left + 0.005
        ? `Only ${cartonsAndUnits(left, item)} is still open.`
        : 'Type how much of the loan this settles.'
      : how === 'EXCHANGED' && !(other && exchangeUnits > 0)
        ? 'Pick the other item and how much of it.'
        : how === 'PAID' && !(paid > 0)
          ? 'Type the amount paid.'
          : '';
  const save = () => saver.run({ action: 'settleBorrow', movementId: borrow.id, how, date, units, exchangeItemId, exchangeQuantity: exchangeUnits, amount: paid, notes });

  const choices = borrowedIn
    ? ([
        ['RETURNED', 'Give the same item back'],
        ['EXCHANGED', 'Give another item'],
        ['PAID', 'Pay money'],
      ] as const)
    : ([
        ['RETURNED', 'Same item came back'],
        ['EXCHANGED', 'Received another item'],
        ['PAID', 'Received money'],
      ] as const);

  return (
    <Shell
      title={borrowedIn ? `Settle: borrowed ${item.name} from ${who}` : `Settle: ${who} borrowed ${item.name}`}
      intro={`${cartonsAndUnits(borrow.quantity, item)} ${borrowedIn ? 'borrowed' : 'lent'} on ${borrow.date}${left < borrow.quantity ? ` · ${cartonsAndUnits(left, item)} still open` : ''}.`}
      onClose={onClose}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {choices.map(([value, label]) => (
          <button key={value} onClick={() => setHow(value)} style={{ ...small, height: 32, fontWeight: how === value ? 600 : 400, borderColor: how === value ? c.accent : c.border2 }}>
            {label}
          </button>
        ))}
      </div>
      <Field label="Date" hint={isFullDate(date) ? undefined : 'Pick a full date (day, month and year).'}>
        <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={input} />
      </Field>
      <Field
        label="How much of the loan does this settle"
        hint={units > left + 0.005 ? `Only ${cartonsAndUnits(left, item)} is still open.` : left > units ? 'The rest stays open until it is settled too.' : undefined}
      >
        <QtyInput item={item} units={units} onChange={setUnits} />
      </Field>
      {how === 'RETURNED' ? (
        <span style={{ fontSize: 12, color: c.text3 }}>
          {borrowedIn ? `${cartonsAndUnits(units, item)} will be taken out of your stock automatically.` : `${cartonsAndUnits(units, item)} will be added back to your stock automatically.`}
        </span>
      ) : null}
      {how === 'EXCHANGED' ? (
        <>
          <Field label={borrowedIn ? 'Item you give instead' : 'Item received instead'}>
            <select value={exchangeItemId} onChange={(e) => setExchangeItemId(readValue(e))} style={select}>
              <option value="">Choose an item…</option>
              {others.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code ? `${i.code} ` : ''}
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          {other ? (
            <Field label="How much of it" hint={borrowedIn ? 'Taken out of the stock of that item automatically.' : 'Added to the stock of that item automatically.'}>
              <QtyInput key={other.id} item={other} units={0} onChange={setExchangeUnits} />
            </Field>
          ) : null}
        </>
      ) : null}
      {how === 'PAID' ? (
        <Field
          label="Amount paid (RM)"
          hint={`No stock moves. Saved on this loan, and recorded as ${borrowedIn ? 'an expense (Stock & ingredients)' : 'income (Transactions → Money in)'}. Suggested: the stock's cost.`}
        >
          <input value={amount} onChange={(e) => setAmount(readValue(e))} placeholder={suggested} inputMode="decimal" style={input} />
        </Field>
      ) : null}
      <Field label={how === 'PAID' ? 'Note (who was paid, how, receipt no.)' : 'Notes'}>
        <input value={notes} onChange={(e) => setNotes(readValue(e))} style={input} />
      </Field>
      <BelowZeroBar message={saver.confirm} busy={busy} onYes={saver.confirmYes} onNo={saver.confirmNo} />
      <Buttons onClose={onClose} onSave={save} busy={busy} ready={ready && !tooEarly && !saver.confirm} label="Settle" why={why} />
    </Shell>
  );
};
// ---------------------------------------------------------------- Stock take

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
  const [rule, setRule] = useState<{ reorderBelow: string; orderUpTo: string; leadDays: string }>({
    reorderBelow: String(owner.rule.reorderBelow),
    orderUpTo: String(owner.rule.orderUpTo),
    leadDays: String(owner.rule.leadDays ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const parsed: StockRule = { reorderBelow: toNumber(rule.reorderBelow), orderUpTo: toNumber(rule.orderUpTo), leadDays: toNumber(rule.leadDays) };

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
      <Field label="Delivery takes (days)" hint="From ordering to the goods arriving. Items are flagged this much earlier, and orders cover these days too.">
        <input value={rule.leadDays} onChange={(e) => setRule({ ...rule, leadDays: readValue(e) })} inputMode="numeric" style={input} />
      </Field>
      <Buttons onClose={onClose} onSave={save} busy={busy} ready={parsed.reorderBelow > 0 && parsed.orderUpTo >= parsed.reorderBelow} label="Save rule" />
    </Shell>
  );
};
