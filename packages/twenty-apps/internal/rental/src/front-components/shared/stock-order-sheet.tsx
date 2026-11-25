import { useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { L, tr } from 'src/front-components/shared/stock-i18n';
import { c, control, Field, input, primary, rm, select, small } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { cartonsToCover, type StockItem, type StockStatus, toCartons } from 'src/shared/stock';
import type { StockOrder } from 'src/shared/stock-orders';

// A new order, or a change to a draft order. Type a code or name, tap the
// product, type how many cartons: date and note are set once at the top, and
// products of different suppliers can go on the same list (the app makes one
// order per supplier). The Forecast & order tab also makes orders, from what
// the forecast suggests.

type DraftLine = { itemId: string; cartons: string };

const toNumber = (value: string) => Number(value.replace(/[^0-9.]/g, '')) || 0;
const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const supplierOf = (item: StockItem) => item.supplier || 'No supplier';
const label = (item: StockItem) => `${item.code ? `${item.code} ` : ''}${item.name}`;
const SHOWN = 8;

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
  const statusOf = useMemo(() => new Map(statuses.map((s) => [s.item.id, s])), [statuses]);
  const [ownerId, setOwnerId] = useState(order?.ownerId ?? (owners.some((o) => o.id === defaultOwnerId) ? defaultOwnerId : (owners[0]?.id ?? '')));
  const [date, setDate] = useState(order?.date || today);
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(
    order?.lines.map((l) => ({ itemId: l.itemId, cartons: String(toCartons(l.orderedUnits, byId.get(l.itemId) ?? { unitsPerCarton: 1 })) })) ?? [],
  );
  const [query, setQuery] = useState('');
  const [months, setMonths] = useState('1');
  const [loaded, setLoaded] = useState('');
  const [busy, setBusy] = useState(false);
  const [arrived, setArrived] = useState(false);
  // Changing a draft: only products of its supplier (what is already on it stays). A new order: any product of the workspace.
  const onOrder = new Set(order?.lines.map((l) => l.itemId) ?? []);
  const choosable = active.filter((i) => (order ? supplierOf(i) === order.supplier && i.ownerId === order.ownerId : i.ownerId === ownerId) || onOrder.has(i.id));
  const onList = new Set(lines.map((l) => l.itemId));
  const q = query.trim().toLowerCase();
  // Nothing typed: what needs ordering first, then the rest by code.
  const urgency = (item: StockItem) => ({ ORDER: 0, LOW: 1 })[statusOf.get(item.id)?.flag as 'ORDER' | 'LOW'] ?? 2;
  const matches = useMemo(() => {
    const list = q ? choosable.filter((i) => `${i.code} ${i.name} ${i.specification} ${i.supplier}`.toLowerCase().includes(q)) : [...choosable];

    return list.sort((a, b) => urgency(a) - urgency(b) || a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [choosable, q, statusOf]);
  const filled = lines.filter((l) => toNumber(l.cartons) > 0);
  const estimate = filled.reduce((sum, l) => sum + toNumber(l.cartons) * (byId.get(l.itemId)?.cartonPrice ?? 0), 0);
  const ready = filled.length > 0 && !lines.some((l) => !(toNumber(l.cartons) > 0)) && isFullDate(date);
  // A new order is split by supplier: say how many orders this will make.
  const suppliers = [...new Set(filled.map((l) => supplierOf(byId.get(l.itemId) as StockItem)))];
  const setCartons = (itemId: string, cartons: string) => setLines((current) => current.map((l) => (l.itemId === itemId ? { ...l, cartons } : l)));
  const remove = (itemId: string) => setLines((current) => current.filter((l) => l.itemId !== itemId));
  // Tap a product: it goes to the top of the list with 1 carton; tapping it again adds one more.
  const add = (item: StockItem) =>
    setLines((current) =>
      current.some((l) => l.itemId === item.id)
        ? current.map((l) => (l.itemId === item.id ? { ...l, cartons: String(toNumber(l.cartons) + 1) } : l))
        : [{ itemId: item.id, cartons: '1' }, ...current],
    );

  // Add every product that stock in hand + on order does not cover for the chosen
  // number of months of next month's use, in whole cartons.
  const loadNeeded = () => {
    const want = toNumber(months) > 0 ? toNumber(months) : 1;
    const next = [...lines];
    let count = 0;

    for (const s of statuses) {
      if (s.item.status === 'DISCONTINUED' || !choosable.some((i) => i.id === s.item.id)) continue;
      const own = order?.lines.find((l) => l.itemId === s.item.id)?.orderedUnits ?? 0;
      const cartons = cartonsToCover(s, want, own);

      if (cartons <= 0) continue;
      count += 1;
      const at = next.findIndex((l) => l.itemId === s.item.id);

      if (at >= 0) next[at] = { ...next[at], cartons: String(cartons) };
      else next.push({ itemId: s.item.id, cartons: String(cartons) });
    }
    setLines(next);
    setLoaded(
      count
        ? L(`Added ${count} product${count === 1 ? '' : 's'} for ${want} month${want === 1 ? '' : 's'} of use. Change any quantity.`, `${count} produk ditambah untuk guna ${want} bulan. Ubah mana-mana kuantiti.`)
        : L(`Nothing to add: stock in hand and on order already cover ${want} month${want === 1 ? '' : 's'}.`, `Tiada untuk ditambah: stok di tangan dan dalam pesanan sudah cukup untuk ${want} bulan.`),
    );
  };

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'saveOrder', id: order?.id, date, notes, lines: filled.map((l) => ({ itemId: l.itemId, cartons: toNumber(l.cartons) })), ...(arrived && !order ? { receiveNow: true } : {}) });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <Sheet width={620} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{order ? L(`Change ${order.number}`, `Ubah ${order.number}`) : tr('New order')}</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          {order
            ? L(
                `A draft order to ${order.supplier}: change what you want to order. Once it is marked as sent it can no longer be changed here.`,
                `Draf pesanan kepada ${order.supplier}: ubah apa yang anda mahu pesan. Setelah ditanda sebagai dihantar, ia tidak boleh diubah di sini.`,
              )
            : L(
                'Type a code or name, tap the product, then type how many cartons. This is your draft: the supplier raises the real PO / invoice, and what actually arrives is recorded with “Receive goods”.',
                'Taip kod atau nama, tekan produk, kemudian taip berapa karton. Ini draf anda: pembekal mengeluarkan PO / invois sebenar, dan apa yang benar-benar sampai direkodkan dengan “Terima barang”.',
              )}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: !order && owners.length > 1 ? '1fr 1fr' : '1fr', gap: 8 }}>
          {!order && owners.length > 1 ? (
            <Field label={tr('Workspace')}>
              <select
                value={ownerId}
                onChange={(e) => {
                  setOwnerId(readValue(e));
                  setLines([]);
                  setLoaded('');
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
          <Field label={arrived && !order ? tr('Date received') : tr('Order date')}>
            <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, width: 170, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
          </Field>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder={tr('🔍 Type a code or name to add a product…')} style={{ ...input, height: 44, fontSize: 15 }} />
          <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, overflow: 'hidden' }}>
            {matches.slice(0, SHOWN).map((item) => {
              const on = onList.has(item.id);
              const status = statusOf.get(item.id);

              return (
                <button
                  key={item.id}
                  onClick={() => add(item)}
                  style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${c.border}`, fontSize: 13, boxSizing: 'border-box', width: '100%', background: on ? 'var(--t-color-blue2)' : c.bg }}
                >
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(item)}</span>
                    <span style={{ fontSize: 11.5, color: c.text3 }}>
                      {[item.specification, supplierOf(item), status ? L(`in stock ${status.cartons} ctn`, `dalam stok ${status.cartons} ctn`) : ''].filter(Boolean).join(' · ')}
                      {status?.flag === 'ORDER' ? <b style={{ color: 'var(--t-color-red11)' }}> · {tr('needs ordering')}</b> : null}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: on ? c.accent : c.text2 }}>{on ? tr('✓ on the list · +1') : tr('+ Add')}</span>
                </button>
              );
            })}
            {!matches.length ? <div style={{ padding: 12, fontSize: 13, color: c.text3 }}>{q ? L(`No product matches “${query}”.`, `Tiada produk sepadan dengan “${query}”.`) : tr('No products yet.')}</div> : null}
          </div>
          <span style={{ fontSize: 12, color: c.text3 }}>
            {q
              ? L(
                  `${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length > SHOWN ? `: showing ${SHOWN}, keep typing to narrow down` : ''}.`,
                  `${matches.length} sepadan${matches.length > SHOWN ? `: menunjukkan ${SHOWN}, teruskan menaip untuk mengecilkan` : ''}.`,
                )
              : L(
                  `Products that need ordering first. ${matches.length > SHOWN ? `Type to search all ${matches.length}.` : ''}`,
                  `Produk yang perlu dipesan dahulu. ${matches.length > SHOWN ? `Taip untuk cari semua ${matches.length}.` : ''}`,
                )}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{L(`On this order (${lines.length})`, `Dalam pesanan ini (${lines.length})`)}</span>
          {lines.length === 0 ? <span style={{ fontSize: 13, color: c.text3 }}>{tr('Nothing yet. Tap a product above.')}</span> : null}
          {lines.map((l) => {
            const item = byId.get(l.itemId);

            if (!item) return null;

            return (
              <div key={l.itemId} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 6, borderBottom: `1px dashed ${c.border}` }}>
                <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{label(item)}</span>
                  <span style={{ fontSize: 11.5, color: c.text3 }}>{order ? item.specification : [item.specification, supplierOf(item)].filter(Boolean).join(' · ')}</span>
                </div>
                <input value={l.cartons} onChange={(e) => setCartons(l.itemId, readValue(e))} inputMode="decimal" placeholder="0" style={{ ...input, width: 64, textAlign: 'right', borderColor: toNumber(l.cartons) > 0 ? undefined : 'var(--t-color-red9)' }} />
                <span style={{ fontSize: 12, color: c.text3, width: 90 }}>ctn × {rm(item.cartonPrice)}</span>
                <button onClick={() => remove(l.itemId)} style={{ ...small, height: 34 }} title={tr('Remove from the order')}>
                  ✕
                </button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: c.text2, marginTop: 4 }}>
            <span>{tr('Or add everything that needs ordering, to cover')}</span>
            <input value={months} onChange={(e) => setMonths(readValue(e))} inputMode="decimal" style={{ ...input, width: 52, height: 28, textAlign: 'right' }} />
            <span>{tr('month(s)')}</span>
            <button onClick={loadNeeded} style={{ ...small, height: 28, fontWeight: 600 }}>
              {tr('Add them')}
            </button>
          </div>
          {loaded ? <span style={{ fontSize: 12, color: loaded.startsWith('Nothing') || loaded.startsWith('Tiada') ? 'var(--t-color-amber11)' : c.text3 }}>{loaded}</span> : null}
        </div>

        <Field label={tr('Note (optional)')}>
          <input value={notes} onChange={(e) => setNotes(readValue(e))} style={input} />
        </Field>
        {!order ? (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', padding: '8px 10px', border: `1px solid ${c.border}`, borderRadius: c.radius, background: arrived ? 'var(--t-color-green2)' : c.bg }}>
            <input type="checkbox" checked={arrived} onChange={() => setArrived(!arrived)} />
            <span>
              <b>{tr('The goods have already arrived')}</b>
              {L(': add these quantities to stock now, on the date above.', ': tambah kuantiti ini ke stok sekarang, pada tarikh di atas.')}
            </span>
          </label>
        ) : null}
        <span style={{ fontSize: 13, color: c.text2 }}>
          {L(`${filled.length} product${filled.length === 1 ? '' : 's'}`, `${filled.length} produk`)} · {L('about', 'kira-kira')} <b>{rm(estimate)}</b> {L('at list prices', 'pada harga senarai')}
          {!order && suppliers.length > 1 ? <b style={{ color: c.text }}>{L(` · makes ${suppliers.length} orders, one per supplier (${suppliers.join(', ')})`, ` · menghasilkan ${suppliers.length} pesanan, satu setiap pembekal (${suppliers.join(', ')})`)}</b> : null}
        </span>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={control}>
            {tr('Cancel')}
          </button>
          <button onClick={save} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
            {busy ? tr('Saving…') : order ? tr('Save changes') : arrived ? tr('Save and add to stock') : suppliers.length > 1 ? L(`Save ${suppliers.length} draft orders`, `Simpan ${suppliers.length} draf pesanan`) : tr('Save as draft order')}
          </button>
        </div>
      </div>
    </Sheet>
  );
};
