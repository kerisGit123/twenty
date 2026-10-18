import { type CSSProperties, Fragment, useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { useNarrow } from 'src/front-components/shared/use-narrow';
import { ItemPicker } from 'src/front-components/shared/item-picker';
import { Sheet } from 'src/front-components/shared/sheet';
import { BelowZeroBar, QtyInput, stockAction, useStockSave } from 'src/front-components/shared/stock-forms';
import { c, Chip, control, ExcelButton, Field, input, primary, select, shortDate, small } from 'src/front-components/shared/stock-ui';
import type { StockOwner } from 'src/logic-functions/utils/stock-data';
import { cartonsAndUnits, type StockItem, toCartons } from 'src/shared/stock';
import { isOpenRequest, requestCounts, type StockRequest, shortUnits, unresolvedShort } from 'src/shared/stock-requests';
import { REQUEST_STATUSES } from 'src/shared/stock-types';

// Branch requests: the branch (Wawa) asks the warehouse for stock, the
// warehouse issues it (recorded as take-outs), the branch confirms what
// arrived, and a short delivery is settled by a manager.

const cell: CSSProperties = { fontSize: 13, padding: '8px 10px', borderBottom: `1px solid ${c.border}`, verticalAlign: 'middle' };
const head: CSSProperties = { ...cell, textAlign: 'left', fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.3, background: c.bg2, whiteSpace: 'nowrap' };
const isFullDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const statusOf = (value: string) => REQUEST_STATUSES.find((s) => s.value === value);

const SheetBody = ({ title, intro, width = 600, onClose, children }: { title: string; intro?: string; width?: number; onClose: () => void; children: React.ReactNode }) => (
  <Sheet width={width} onClose={onClose}>
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
      {intro ? <span style={{ fontSize: 13, color: c.text2 }}>{intro}</span> : null}
      {children}
    </div>
  </Sheet>
);

const Footer = ({ onClose, onSave, busy, ready, label }: { onClose: () => void; onSave: () => void; busy: boolean; ready: boolean; label: string }) => (
  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
    <button onClick={onClose} style={control}>
      Cancel
    </button>
    <button onClick={onSave} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.5 : 1 }}>
      {busy ? 'Saving…' : label}
    </button>
  </div>
);

// ---------------------------------------------------------------- the tab

export const RequestsTab = ({
  requests,
  items,
  mayManage,
  onNew,
  onEdit,
  onIssue,
  onReceive,
  onSettle,
  onChanged,
}: {
  requests: StockRequest[];
  items: StockItem[];
  mayManage: (ownerId: string | null) => boolean;
  onNew: () => void;
  onEdit: (request: StockRequest) => void;
  onIssue: (request: StockRequest) => void;
  onReceive: (request: StockRequest) => void;
  onSettle: (request: StockRequest) => void;
  onChanged: () => void;
}) => {
  const narrow = useNarrow();
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const counts = requestCounts(requests);
  const shown = requests.filter((r) => showAll || isOpenRequest(r)).sort((a, b) => b.number.localeCompare(a.number));

  const cancel = async (request: StockRequest) => {
    setBusy(true);
    const result = await stockAction({ action: 'cancelRequest', id: request.id });

    setBusy(false);
    setSure(null);
    if (result.success) onChanged();
  };

  const summary = (request: StockRequest) => {
    const cartons = request.lines.reduce((sum, l) => sum + toCartons(l.requestedUnits, byId.get(l.itemId) ?? { unitsPerCarton: 1 }), 0);

    return `${request.lines.length} item${request.lines.length === 1 ? '' : 's'} · ${Math.round(cartons * 100) / 100} ctn`;
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onNew} style={primary}>
          + New request
        </button>
        <div style={{ display: 'inline-flex', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
          {(
            [
              [false, `To do (${counts.toIssue + counts.toConfirm + counts.short})`],
              [true, 'All'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              onClick={() => setShowAll(value)}
              style={{ ...control, border: 'none', borderRadius: 0, fontWeight: showAll === value ? 600 : 400, background: showAll === value ? 'var(--t-color-blue2)' : c.bg, color: showAll === value ? 'var(--t-color-blue11)' : c.text }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, color: c.text2 }}>
          {counts.toIssue ? `${counts.toIssue} to issue` : 'Nothing waiting to be issued'}
          {counts.toConfirm ? ` · ${counts.toConfirm} sent, not confirmed` : ''}
          {counts.short ? ` · ${counts.short} short` : ''}
        </span>
      </div>

      {narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.length ? null : (
            <div style={{ padding: 24, textAlign: 'center', color: c.text3, fontSize: 13, border: `1px dashed ${c.border2}`, borderRadius: c.radius }}>
              {showAll ? 'No requests yet. “+ New request” is how a branch asks the warehouse for stock.' : 'Nothing to do. Switch to “All” to see finished requests.'}
            </div>
          )}
          {shown.map((r) => {
            const open = expanded === r.id;
            const status = statusOf(r.status);
            const manage = mayManage(r.ownerId);

            return (
              <div key={r.id} style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => setExpanded(open ? null : r.id)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                    {open ? '▾' : '▸'} {r.number}
                  </button>
                  <Chip label={status?.label ?? r.status} color={status?.color ?? 'gray'} />
                </div>
                <div style={{ fontSize: 12, color: c.text2 }}>
                  {r.branch} · {shortDate(r.date)}
                  {r.requestedBy ? ` · ${r.requestedBy}` : ''} · {summary(r)}
                </div>
                {open ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0', borderTop: `1px dashed ${c.border}`, borderBottom: `1px dashed ${c.border}` }}>
                    {r.lines.map((l) => {
                      const item = byId.get(l.itemId);
                      const short = shortUnits(l);
                      const show = (units: number | undefined) => (units === undefined ? '—' : item ? cartonsAndUnits(units, item) : String(units));

                      return (
                        <div key={l.itemId} style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{item?.name ?? 'Item removed'}</div>
                          <div style={{ color: c.text2 }}>
                            asked {show(l.requestedUnits)} · issued {show(l.issuedUnits)} · received {show(l.receivedUnits)}
                            {short ? <b style={{ color: 'var(--t-color-red11)' }}> · short {item ? cartonsAndUnits(short, item) : short}</b> : null}
                            {l.resolved ? <span style={{ color: c.text3 }}> ({l.resolved === 'RETURNED' ? 'put back in stock' : 'written off'})</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {r.status === 'REQUESTED' ? (
                    <>
                      <button onClick={() => onIssue(r)} style={{ ...primary, height: 40 }}>
                        Issue…
                      </button>
                      <button onClick={() => onEdit(r)} style={{ ...control, height: 40 }}>
                        Edit
                      </button>
                      {sure === r.id ? (
                        <button onClick={() => cancel(r)} disabled={busy} style={{ ...control, height: 40, color: 'var(--t-color-red11)', fontWeight: 600 }}>
                          Really cancel?
                        </button>
                      ) : (
                        <button onClick={() => setSure(r.id)} style={{ ...control, height: 40, color: 'var(--t-color-red11)' }}>
                          Cancel
                        </button>
                      )}
                    </>
                  ) : null}
                  {r.status === 'ISSUED' ? (
                    <button onClick={() => onReceive(r)} style={{ ...primary, height: 40 }}>
                      Confirm received…
                    </button>
                  ) : null}
                  {r.status === 'SHORT' ? (
                    manage ? (
                      <button onClick={() => onSettle(r)} style={{ ...primary, height: 40 }}>
                        Settle the shortage…
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: c.text3 }}>A manager settles this</span>
                    )
                  ) : null}
                  {r.status !== 'CANCELLED' ? <ExcelButton query={{ kind: 'xlsx-request', request: r.id, ...(r.ownerId ? { owner: r.ownerId } : {}) }} title="Picking list / delivery note (Excel)" /> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div style={{ overflowX: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={head}>Request</th>
              <th style={head}>Branch</th>
              <th style={head}>Asked</th>
              <th style={head}>What</th>
              <th style={head}>Status</th>
              <th style={{ ...head, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {shown.length ? null : (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center', color: c.text3, padding: 32 }}>
                  {showAll ? 'No requests yet. “+ New request” is how a branch asks the warehouse for stock.' : 'Nothing to do. Switch to “All” to see finished requests.'}
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const open = expanded === r.id;
              const status = statusOf(r.status);
              const manage = mayManage(r.ownerId);

              return (
                <Fragment key={r.id}>
                  <tr style={{ background: open ? 'var(--t-color-gray1)' : c.bg }}>
                    <td style={{ ...cell, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setExpanded(open ? null : r.id)} title="Show the lines">
                      {open ? '▾' : '▸'} {r.number}
                    </td>
                    <td style={cell}>{r.branch}</td>
                    <td style={{ ...cell, color: c.text2, whiteSpace: 'nowrap' }}>
                      {shortDate(r.date)}
                      {r.requestedBy ? <div style={{ fontSize: 11, color: c.text3 }}>{r.requestedBy}</div> : null}
                    </td>
                    <td style={{ ...cell, color: c.text2 }}>{summary(r)}</td>
                    <td style={cell}>
                      <Chip label={status?.label ?? r.status} color={status?.color ?? 'gray'} />
                      {r.status === 'ISSUED' && r.issuedOn ? <div style={{ fontSize: 11, color: c.text3, marginTop: 3 }}>issued {shortDate(r.issuedOn)}</div> : null}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.status !== 'CANCELLED' ? (
                        <>
                          <ExcelButton query={{ kind: 'xlsx-request', request: r.id, ...(r.ownerId ? { owner: r.ownerId } : {}) }} title={r.status === 'REQUESTED' ? 'Picking list for the warehouse (Excel)' : 'Delivery note to print and sign (Excel)'} />{' '}
                        </>
                      ) : null}
                      {r.status === 'REQUESTED' ? (
                        <>
                          <button onClick={() => onIssue(r)} style={primary}>
                            Issue…
                          </button>{' '}
                          <button onClick={() => onEdit(r)} style={small}>
                            Edit
                          </button>{' '}
                          {sure === r.id ? (
                            <button onClick={() => cancel(r)} disabled={busy} style={{ ...small, color: 'var(--t-color-red11)', fontWeight: 600 }}>
                              Really cancel?
                            </button>
                          ) : (
                            <button onClick={() => setSure(r.id)} style={{ ...small, color: 'var(--t-color-red11)' }}>
                              Cancel
                            </button>
                          )}
                        </>
                      ) : null}
                      {r.status === 'ISSUED' ? (
                        <button onClick={() => onReceive(r)} style={primary}>
                          Confirm received…
                        </button>
                      ) : null}
                      {r.status === 'SHORT' ? (
                        manage ? (
                          <button onClick={() => onSettle(r)} style={primary}>
                            Settle the shortage…
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: c.text3 }}>A manager settles this</span>
                        )
                      ) : null}
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={6} style={{ ...cell, background: 'var(--t-color-gray1)', padding: '6px 10px 12px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ ...head, background: 'transparent' }}>Item</th>
                              <th style={{ ...head, background: 'transparent', textAlign: 'right' }}>Asked</th>
                              <th style={{ ...head, background: 'transparent', textAlign: 'right' }}>Issued</th>
                              <th style={{ ...head, background: 'transparent', textAlign: 'right' }}>Received</th>
                              <th style={{ ...head, background: 'transparent', textAlign: 'right' }}>Short</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.lines.map((l) => {
                              const item = byId.get(l.itemId);
                              const short = shortUnits(l);
                              const show = (units: number | undefined) => (units === undefined ? '—' : item ? cartonsAndUnits(units, item) : String(units));

                              return (
                                <tr key={l.itemId}>
                                  <td style={cell}>{item?.name ?? 'Item removed'}</td>
                                  <td style={{ ...cell, textAlign: 'right' }}>{show(l.requestedUnits)}</td>
                                  <td style={{ ...cell, textAlign: 'right' }}>{show(l.issuedUnits)}</td>
                                  <td style={{ ...cell, textAlign: 'right' }}>{show(l.receivedUnits)}</td>
                                  <td style={{ ...cell, textAlign: 'right', color: short ? 'var(--t-color-red11)' : c.text3, fontWeight: short ? 600 : 400 }}>
                                    {short ? (item ? cartonsAndUnits(short, item) : short) : '—'}
                                    {l.resolved ? <div style={{ fontSize: 11, fontWeight: 400, color: c.text3 }}>{l.resolved === 'RETURNED' ? 'put back in stock' : 'written off'}</div> : null}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div style={{ fontSize: 12, color: c.text3, paddingTop: 6 }}>
                          {r.notes ? `Note: ${r.notes} · ` : ''}
                          {r.issuedOn ? `Issued ${shortDate(r.issuedOn)}${r.issuedBy ? ` by ${r.issuedBy}` : ''}` : 'Not issued yet'}
                          {r.receivedOn ? ` · Received ${shortDate(r.receivedOn)}${r.receivedBy ? ` by ${r.receivedBy}` : ''}` : ''}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <span style={{ fontSize: 12, color: c.text3 }}>
        Flow: the branch asks → the warehouse issues it (recorded as a take-out to the branch) → the branch confirms what arrived. If less arrived, a manager puts the difference back in stock or writes it off as lost.
      </span>
    </>
  );
};

// ---------------------------------------------------------------- new / edit a request

type DraftLine = { key: number; itemId: string; units: number };

export const RequestSheet = ({
  request,
  items,
  balances,
  owners,
  defaultOwnerId,
  onClose,
  onDone,
}: {
  request: StockRequest | null;
  items: StockItem[];
  balances: Map<string, number>;
  owners: StockOwner[];
  defaultOwnerId: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [ownerId, setOwnerId] = useState(request?.ownerId ?? (owners.some((o) => o.id === defaultOwnerId) ? defaultOwnerId : (owners[0]?.id ?? '')));
  const [branch, setBranch] = useState(request?.branch ?? 'Wawa');
  const [notes, setNotes] = useState(request?.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(request?.lines.length ? request.lines.map((l, i) => ({ key: i + 1, itemId: l.itemId, units: l.requestedUnits })) : [{ key: 1, itemId: '', units: 0 }]);
  const [busy, setBusy] = useState(false);
  const choosable = items.filter((i) => i.ownerId === ownerId && i.status !== 'DISCONTINUED');
  const byId = new Map(items.map((i) => [i.id, i]));
  const ready = lines.some((l) => l.itemId && l.units > 0) && !lines.some((l) => l.itemId && !(l.units > 0)) && branch.trim().length > 0;
  const setLine = (key: number, patch: Partial<DraftLine>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'saveRequest', id: request?.id, branch, notes, lines: lines.filter((l) => l.itemId && l.units > 0).map((l) => ({ itemId: l.itemId, units: l.units })) });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <SheetBody title={request ? `Change ${request.number}` : 'New branch request'} intro="What the branch needs from the warehouse. The warehouse issues it from this tab." onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: owners.length > 1 && !request ? '1fr 1fr' : '1fr', gap: 8 }}>
        {owners.length > 1 && !request ? (
          <Field label="Workspace">
            <select
              value={ownerId}
              onChange={(e) => {
                setOwnerId(readValue(e));
                setLines([{ key: 1, itemId: '', units: 0 }]);
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
        <Field label="Branch asking">
          <input value={branch} onChange={(e) => setBranch(readValue(e))} style={input} />
        </Field>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
        {lines.map((l) => {
          const item = byId.get(l.itemId);

          return (
            <div key={l.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8, borderBottom: `1px dashed ${c.border}` }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <ItemPicker items={choosable} value={l.itemId} onChange={(itemId) => setLine(l.key, { itemId })} />
                </div>
                <button onClick={() => setLines(lines.filter((x) => x.key !== l.key))} style={{ ...small, height: 34 }} title="Remove line">
                  ✕
                </button>
              </div>
              {item ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <QtyInput key={`${l.key}-${item.id}`} item={item} units={l.units} onChange={(units) => setLine(l.key, { units })} />
                  <span style={{ fontSize: 12, color: c.text3 }}>in the warehouse: {cartonsAndUnits(balances.get(item.id) ?? 0, item)}</span>
                </div>
              ) : null}
            </div>
          );
        })}
        <button onClick={() => setLines([...lines, { key: Math.max(0, ...lines.map((x) => x.key)) + 1, itemId: '', units: 0 }])} style={{ ...small, alignSelf: 'flex-start' }}>
          + Add item
        </button>
      </div>
      <Field label="Note (optional)">
        <input value={notes} onChange={(e) => setNotes(readValue(e))} style={input} />
      </Field>
      <Footer onClose={onClose} onSave={save} busy={busy} ready={ready} label={request ? 'Save changes' : 'Send request'} />
    </SheetBody>
  );
};

// ---------------------------------------------------------------- warehouse issues the stock

export const IssueSheet = ({ request, items, balances, today, onClose, onDone }: { request: StockRequest; items: StockItem[]; balances: Map<string, number>; today: string; onClose: () => void; onDone: () => void }) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  const [date, setDate] = useState(today);
  const [issued, setIssued] = useState<Record<string, number>>(() => Object.fromEntries(request.lines.map((l) => [l.itemId, l.requestedUnits])));
  const saver = useStockSave(onDone);
  const busy = saver.busy;
  const total = request.lines.filter((l) => (issued[l.itemId] ?? 0) > 0).length;

  const save = () => saver.run({ action: 'issueRequest', id: request.id, date, lines: request.lines.map((l) => ({ itemId: l.itemId, issuedUnits: issued[l.itemId] ?? 0 })) });

  return (
    <SheetBody title={`Issue ${request.number} to ${request.branch}`} intro="Type what you are sending (it starts as what was asked). Saving takes it out of the warehouse stock, dated below. Put 0 on anything you are not sending." onClose={onClose}>
      <Field label="Issued on">
        <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, width: 170, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
      </Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {request.lines.map((l) => {
          const item = byId.get(l.itemId);
          const inStock = balances.get(l.itemId) ?? 0;
          const giving = issued[l.itemId] ?? 0;

          return (
            <div key={l.itemId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: `1px dashed ${c.border}`, paddingBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 190 }}>
                <div style={{ fontSize: 13 }}>{item?.name ?? 'Item removed'}</div>
                <div style={{ fontSize: 12, color: c.text3 }}>
                  asked {item ? cartonsAndUnits(l.requestedUnits, item) : l.requestedUnits} · in the warehouse {item ? cartonsAndUnits(inStock, item) : inStock}
                </div>
                {giving > inStock ? <div style={{ fontSize: 12, color: 'var(--t-color-red11)' }}>More than in stock. Count the shelf first; only a manager can send more than the system shows.</div> : null}
              </div>
              {item ? <QtyInput item={item} units={l.requestedUnits} onChange={(units) => setIssued({ ...issued, [l.itemId]: units })} /> : null}
            </div>
          );
        })}
      </div>
      <BelowZeroBar message={saver.confirm} busy={busy} onYes={saver.confirmYes} onNo={saver.confirmNo} />
      <Footer onClose={onClose} onSave={save} busy={busy} ready={total > 0 && isFullDate(date) && !saver.confirm} label={`Issue ${total} item${total === 1 ? '' : 's'}`} />
    </SheetBody>
  );
};

// ---------------------------------------------------------------- the branch counts what arrived

export const ReceiveRequestSheet = ({ request, items, today, onClose, onDone }: { request: StockRequest; items: StockItem[]; today: string; onClose: () => void; onDone: () => void }) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  const sent = request.lines.filter((l) => (l.issuedUnits ?? 0) > 0);
  const [date, setDate] = useState(today);
  const [got, setGot] = useState<Record<string, number>>(() => Object.fromEntries(sent.map((l) => [l.itemId, l.issuedUnits as number])));
  const [busy, setBusy] = useState(false);
  const shortLines = sent.filter((l) => (got[l.itemId] ?? 0) < (l.issuedUnits as number) - 0.001);
  const over = sent.some((l) => (got[l.itemId] ?? 0) > (l.issuedUnits as number) + 0.001);

  const save = async () => {
    setBusy(true);
    const result = await stockAction({ action: 'receiveRequest', id: request.id, date, lines: sent.map((l) => ({ itemId: l.itemId, receivedUnits: got[l.itemId] ?? 0 })) });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <SheetBody title={`Confirm ${request.number} received`} intro={`Count what actually arrived at ${request.branch}. It starts as what was issued: change only what is different.`} onClose={onClose}>
      <Field label="Received on">
        <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, width: 170, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
      </Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sent.map((l) => {
          const item = byId.get(l.itemId);
          const diff = Math.round(((l.issuedUnits as number) - (got[l.itemId] ?? 0)) * 100) / 100;

          return (
            <div key={l.itemId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: `1px dashed ${c.border}`, paddingBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 190 }}>
                <div style={{ fontSize: 13 }}>{item?.name ?? 'Item removed'}</div>
                <div style={{ fontSize: 12, color: c.text3 }}>issued {item ? cartonsAndUnits(l.issuedUnits as number, item) : l.issuedUnits}</div>
              </div>
              {item ? <QtyInput item={item} units={l.issuedUnits as number} onChange={(units) => setGot({ ...got, [l.itemId]: units })} /> : null}
              <span style={{ width: 90, textAlign: 'right', fontSize: 12, color: diff > 0 ? 'var(--t-color-red11)' : 'var(--t-color-green11)' }}>
                {diff > 0 ? `short ${item ? cartonsAndUnits(diff, item) : diff}` : diff < 0 ? 'more than issued' : '✓'}
              </span>
            </div>
          );
        })}
      </div>
      {over ? <span style={{ fontSize: 12, color: 'var(--t-color-red11)' }}>More arrived than was issued. Ask the warehouse to correct what they issued, then confirm.</span> : null}
      {shortLines.length ? <span style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>{shortLines.length} item{shortLines.length === 1 ? ' is' : 's are'} short: a manager will put them back in stock or write them off.</span> : null}
      <Footer onClose={onClose} onSave={save} busy={busy} ready={isFullDate(date) && !over} label={shortLines.length ? 'Confirm (with shortage)' : 'Confirm everything arrived'} />
    </SheetBody>
  );
};

// ---------------------------------------------------------------- a manager settles a shortage

export const SettleRequestSheet = ({ request, items, today, onClose, onDone }: { request: StockRequest; items: StockItem[]; today: string; onClose: () => void; onDone: () => void }) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  const pending = unresolvedShort(request);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  const save = async (how: 'RETURN' | 'WRITE_OFF') => {
    setBusy(true);
    const result = await stockAction({ action: 'resolveShort', id: request.id, how, date });

    setBusy(false);
    if (result.success) onDone();
  };

  return (
    <SheetBody title={`Settle the shortage on ${request.number}`} intro={`${request.branch} received less than the warehouse issued. Decide where the difference is.`} onClose={onClose}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(readValue(e))} style={{ ...input, width: 170, borderColor: isFullDate(date) ? undefined : 'var(--t-color-red9)' }} />
      </Field>
      <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius }}>
        {pending.map((l) => {
          const item = byId.get(l.itemId);

          return (
            <div key={l.itemId} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${c.border}`, fontSize: 13 }}>
              <span style={{ flex: 1 }}>{item?.name ?? 'Item removed'}</span>
              <span style={{ color: c.text3 }}>
                issued {item ? cartonsAndUnits(l.issuedUnits as number, item) : l.issuedUnits} · received {item ? cartonsAndUnits(l.receivedUnits as number, item) : l.receivedUnits}
              </span>
              <b style={{ color: 'var(--t-color-red11)' }}>short {item ? cartonsAndUnits(shortUnits(l), item) : shortUnits(l)}</b>
            </div>
          );
        })}
      </div>
      <button onClick={() => save('RETURN')} disabled={busy || !isFullDate(date)} style={{ ...primary, height: 44, opacity: busy ? 0.5 : 1 }}>
        Put it back in the warehouse stock
      </button>
      <span style={{ fontSize: 12, color: c.text3, marginTop: -6 }}>Use this when the warehouse over-counted what it sent: the stock was never really out.</span>
      <button onClick={() => save('WRITE_OFF')} disabled={busy || !isFullDate(date)} style={{ ...control, height: 44, color: 'var(--t-color-red11)', borderColor: 'var(--t-color-red9)', fontWeight: 600, opacity: busy ? 0.5 : 1 }}>
        Write it off as lost on the way
      </button>
      <span style={{ fontSize: 12, color: c.text3, marginTop: -6 }}>Use this when it really went missing. The warehouse count stays as it is (the stock left when it was issued); the loss shows under “Where the loss went” on Month end.</span>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={control}>
          Cancel
        </button>
      </div>
    </SheetBody>
  );
};
