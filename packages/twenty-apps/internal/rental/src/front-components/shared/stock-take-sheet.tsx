import { useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { readPickedFile } from 'src/front-components/shared/pick-file';
import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import { stockAction } from 'src/front-components/shared/stock-forms';
import { c, control, Field, input, primary, qty, rm, withOwner } from 'src/front-components/shared/stock-ui';
import { cartonsAndUnits, type StockItem, unitValue } from 'src/shared/stock';
import { STOCK_GROUPS } from 'src/shared/stock-types';

// Stock take: count what is on the shelf, see what differs from the system
// (in units and RM) and save the differences as stock-take adjustments.
// The count can be typed here or filled in on the Excel count sheet and loaded back.

type Entry = { ctn: string; loose: string };
type Show = 'all' | 'counted' | 'diff';

const toNumber = (value: string) => Number(value.replace(/[^0-9.]/g, '')) || 0;
const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const round2 = (value: number) => Math.round(value * 100) / 100;
// A difference worth a second look: RM 50 or more, or a fifth of what was expected.
const BIG_VALUE = 50;

export const StockTakeSheet = ({
  items,
  balances,
  today,
  initialDate,
  ownerId,
  onClose,
  onDone,
}: {
  items: StockItem[];
  balances: Map<string, number>;
  today: string;
  initialDate?: string;
  ownerId: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [date, setDate] = useState(initialDate ?? today);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const rows = useMemo(
    () =>
      items.map((item) => {
        const entry = entries[item.id];
        const counted = !entry || (entry.ctn === '' && entry.loose === '') ? null : round2(toNumber(entry.ctn) * (item.unitsPerCarton || 1) + toNumber(entry.loose));
        const expected = balances.get(item.id) ?? 0;
        const diff = counted === null ? 0 : round2(counted - expected);
        const value = round2(diff * unitValue(item));
        const big = counted !== null && diff !== 0 && (Math.abs(value) >= BIG_VALUE || (expected > 0 && Math.abs(diff) / expected >= 0.2));

        return { item, entry, counted, expected, diff, value, big };
      }),
    [items, entries, balances],
  );
  const counted = rows.filter((r) => r.counted !== null);
  const short = counted.filter((r) => r.diff < 0);
  const over = counted.filter((r) => r.diff > 0);
  const shortValue = round2(short.reduce((s, r) => s - r.value, 0));
  const overValue = round2(over.reduce((s, r) => s + r.value, 0));
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!q || `${r.item.code} ${r.item.name}`.toLowerCase().includes(q)) && (show === 'all' || (show === 'counted' ? r.counted !== null : r.counted !== null && r.diff !== 0)));
  const groups = STOCK_GROUPS.map((g) => ({ ...g, rows: shown.filter((r) => r.item.group === g.value) })).filter((g) => g.rows.length);

  const setEntry = (id: string, patch: Partial<Entry>) => setEntries((all) => ({ ...all, [id]: { ...(all[id] ?? { ctn: '', loose: '' }), ...patch } }));

  const loadSheet = async (event: unknown) => {
    const file = await readPickedFile(event);

    if (!file) return;
    setBusy(true);
    const result = (await stockAction({ action: 'readCounts', ownerId, fileBase64: file.base64 })) as unknown as { success: boolean; counts?: Array<{ itemId: string; units: number }>; unmatched?: string[] };

    setBusy(false);
    if (!result.success || !result.counts) return;
    const byId = new Map(items.map((i) => [i.id, i]));
    const next: Record<string, Entry> = { ...entries };

    for (const { itemId, units } of result.counts) {
      const item = byId.get(itemId);

      if (!item) continue;
      const per = item.unitsPerCarton || 1;

      next[itemId] = per > 1 ? { ctn: String(Math.floor(units / per)), loose: String(round2(units % per)) } : { ctn: '', loose: String(units) };
    }
    setEntries(next);
    setNote(result.unmatched?.length ? `Not recognised (left out): ${result.unmatched.slice(0, 6).join(', ')}${result.unmatched.length > 6 ? '…' : ''}` : '');
    setShow('counted');
  };

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'stockTake', date, counts: counted.map((r) => ({ itemId: r.item.id, counted: r.counted })) });

    setBusy(false);
    if (result.success) onDone();
  };

  const ready = counted.length > 0 && isFullDate(date);
  const tab = (value: Show, label: string) => (
    <button
      key={value}
      onClick={() => setShow(value)}
      style={{ ...control, height: 28, fontSize: 12, fontWeight: show === value ? 600 : 400, background: show === value ? 'var(--t-color-blue2)' : c.bg, color: show === value ? 'var(--t-color-blue11)' : c.text }}
    >
      {label}
    </button>
  );

  return (
    <Sheet width={780} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Stock take</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          Count what is on the shelf. The expected quantity only shows after you count a product, so the count stays honest. Only products you fill in are checked; differences are saved as stock-take adjustments on the date.
        </span>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Counted on">
            <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, width: 160, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
          </Field>
          <a
            href={new RestApiClient().resolveUrl('/s/stock/csv', { query: withOwner({ kind: 'xlsx-count' }, ownerId) })}
            target="_blank"
            rel="noreferrer"
            title="A blank sheet to print or fill in at the shelf: no expected quantities"
            style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', fontWeight: 600, color: 'var(--t-color-green11)', whiteSpace: 'nowrap' }}
          >
            ⬇ Count sheet (Excel)
          </a>
          <Field label="Filled in already? Load it here">
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={loadSheet} style={{ ...input, width: 250, paddingTop: 6 }} />
          </Field>
        </div>
        {note ? <span style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>{note}</span> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 10 }}>
            <div style={{ fontSize: 12, color: c.text3 }}>Counted</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {counted.length} <span style={{ fontSize: 13, fontWeight: 400, color: c.text3 }}>of {rows.length}</span>
            </div>
          </div>
          <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 10 }}>
            <div style={{ fontSize: 12, color: c.text3 }}>Short ({short.length} items)</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: shortValue ? 'var(--t-color-red11)' : c.text }}>{shortValue ? `−${rm(shortValue)}` : rm(0)}</div>
          </div>
          <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 10 }}>
            <div style={{ fontSize: 12, color: c.text3 }}>Over ({over.length} items)</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: overValue ? 'var(--t-color-green11)' : c.text }}>{overValue ? `+${rm(overValue)}` : rm(0)}</div>
          </div>
          <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 10 }}>
            <div style={{ fontSize: 12, color: c.text3 }}>Net difference</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: overValue - shortValue < 0 ? 'var(--t-color-red11)' : c.text }}>{rm(round2(overValue - shortValue))}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder="Search code or name" style={{ ...input, width: 200, height: 30 }} />
          {tab('all', `All ${rows.length}`)}
          {tab('counted', `Counted ${counted.length}`)}
          {tab('diff', `Differences ${counted.filter((r) => r.diff !== 0).length}`)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {groups.length ? null : <span style={{ fontSize: 13, color: c.text3 }}>{q || show !== 'all' ? 'Nothing matches.' : 'No items.'}</span>}
          {groups.map((g) => [
            <div key={`g-${g.value}`} style={{ fontSize: 12, fontWeight: 600, color: c.text3, padding: '10px 0 4px' }}>
              {g.label} · {g.rows.length}
            </div>,
            ...g.rows.map((r) => {
              const per = r.item.unitsPerCarton || 1;

              return (
                <div
                  key={r.item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px dashed ${c.border}`, padding: '6px 4px', flexWrap: 'wrap', background: r.big ? 'var(--t-color-amber2)' : undefined }}
                >
                  <div style={{ flex: 1, minWidth: 190 }}>
                    <div style={{ fontSize: 13 }}>{r.item.name}</div>
                    <div style={{ fontSize: 12, color: c.text3 }}>
                      {r.item.code}
                      {r.counted !== null ? ` · expected ${cartonsAndUnits(r.expected, r.item)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {per > 1 ? (
                      <>
                        <input value={r.entry?.ctn ?? ''} onChange={(e) => setEntry(r.item.id, { ctn: readValue(e) })} inputMode="decimal" placeholder="0" style={{ ...input, width: 54, height: 30 }} />
                        <span style={{ fontSize: 12, color: c.text3 }}>ctn</span>
                      </>
                    ) : null}
                    <input value={r.entry?.loose ?? ''} onChange={(e) => setEntry(r.item.id, { loose: readValue(e) })} inputMode="decimal" placeholder="0" style={{ ...input, width: 58, height: 30 }} />
                    <span style={{ fontSize: 12, color: c.text3, whiteSpace: 'nowrap' }}>{r.item.unit || 'unit'}</span>
                  </div>
                  <div style={{ width: 120, textAlign: 'right', fontSize: 12, color: r.diff < 0 ? 'var(--t-color-red11)' : 'var(--t-color-green11)' }}>
                    {r.counted === null ? '' : r.diff === 0 ? '✓ matches' : (
                      <>
                        <b>
                          {r.diff > 0 ? '+' : ''}
                          {qty(r.diff)} {r.item.unit}
                        </b>
                        <div>
                          {r.value > 0 ? '+' : '−'}
                          {rm(Math.abs(r.value))}
                          {r.big ? ' · check' : ''}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            }),
          ])}
        </div>

        <div style={{ position: 'sticky', bottom: 0, background: c.bg, borderTop: `1px solid ${c.border}`, paddingTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={control}>
            Cancel
          </button>
          <button onClick={save} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
            {busy ? 'Saving…' : `Save count (${counted.length})`}
          </button>
        </div>
      </div>
    </Sheet>
  );
};
