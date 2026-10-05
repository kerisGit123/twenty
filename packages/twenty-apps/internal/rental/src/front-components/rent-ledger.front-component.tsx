import { type CSSProperties, type SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, enqueueSnackbar, navigate } from 'twenty-sdk/front-component';

import { RENT_LEDGER_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { ReceiptSettingsPanel } from 'src/front-components/shared/receipt-settings-panel';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { ReceiptView, type ReceiptViewData } from 'src/front-components/shared/receipt-view';
import { StatementPanel } from 'src/front-components/shared/statement-panel';
import type { LedgerData, Payment, Rental } from 'src/logic-functions/page-data/ledger-data';
import { whatsappLink } from 'src/shared/whatsapp-link';
import {
  dueDateInMonth,
  monthStart,
  nextMonthStart,
  todayIso,
} from 'src/logic-functions/utils/dates';

// ---------------------------------------------------------------- types

type CellStatus = 'paid' | 'due' | 'overdue' | 'upcoming' | 'none';

type Selection = { rental: Rental; month: string };

type Mode = 'month' | 'year' | 'range';

// ---------------------------------------------------------------- helpers

const GRACE_DAYS = 3;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'DUITNOW', label: 'DuitNow' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
  { value: 'FROM_DEPOSIT', label: 'Paid from deposit' },
];
const TYPES = [
  { value: '', label: 'All types' },
  { value: 'CONDO', label: 'Condo / Apartment' },
  { value: 'LANDED', label: 'Landed house' },
  { value: 'SHOP', label: 'Shop / Office' },
  { value: 'ROOM', label: 'Room' },
];
const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
];

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const monthLabel = (iso: string, long = false) => {
  const [year, month] = iso.split('-').map(Number);

  return long ? `${MONTHS[month - 1]} ${year}` : MONTHS[month - 1];
};

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const monthsBetween = (fromIso: string, toIso: string, cap = 24) => {
  const months: string[] = [];
  let cursor = monthStart(fromIso);

  while (cursor <= monthStart(toIso) && months.length < cap) {
    months.push(cursor);
    cursor = nextMonthStart(cursor);
  }

  return months;
};

const shiftMonth = (iso: string, delta: number) => {
  const [year, month] = iso.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
};

// remote-dom serialises events; the value may sit on detail or target.
const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const cellStatus = (rental: Rental, month: string, payment: Payment | undefined, today: string): CellStatus => {
  const startsAfter = rental.startDate && monthStart(rental.startDate) > month;
  const endedBefore = rental.endDate && rental.endDate < month;

  if (startsAfter || endedBefore) return 'none';
  if (payment && (payment.status === 'ISSUED' || payment.status === 'SENT')) return 'paid';
  if (month > monthStart(today)) return 'upcoming';

  const overdueFrom = addDays(dueDateInMonth(month, rental.dueDay), GRACE_DAYS);

  return today > overdueFrom ? 'overdue' : 'due';
};

// ---------------------------------------------------------------- styles

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  accent: 'var(--t-color-blue9)',
  radius: 'var(--t-border-radius-md)',
};

const STATUS_STYLE: Record<CellStatus, CSSProperties> = {
  paid: { background: 'var(--t-color-green3)', color: 'var(--t-color-green11)' },
  due: { background: 'var(--t-color-amber3)', color: 'var(--t-color-amber11)' },
  overdue: { background: 'var(--t-color-red3)', color: 'var(--t-color-red11)' },
  upcoming: { background: c.bg2, color: c.text3 },
  none: { background: 'transparent' },
};
const STATUS_LABEL: Record<CellStatus, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  none: '',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 30,
  padding: '0 10px',
  boxSizing: 'border-box',
};

const button = (primary = false): CSSProperties => ({
  ...control,
  cursor: 'pointer',
  fontWeight: 500,
  ...(primary ? { background: c.accent, color: '#fff', border: `1px solid ${c.accent}` } : {}),
});

// ---------------------------------------------------------------- data

// ---------------------------------------------------------------- component

type RecordResponse = {
  success: boolean;
  paymentId?: string;
  message?: string;
  fileUrl?: string;
  receiptNumber?: string;
};

const RentLedger = () => {
  const today = todayIso();
  const [mode, setMode] = useState<Mode>('year');
  const [anchor, setAnchor] = useState(monthStart(today)); // month or year anchor
  const [rangeFrom, setRangeFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [rangeTo, setRangeTo] = useState(monthStart(today));
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Contract whose year statement is open.
  const [statementFor, setStatementFor] = useState<Rental | null>(null);

  // Opening a month closes the statement.
  useEffect(() => {
    if (selection) setStatementFor(null);
  }, [selection]);
  const scope = useOwnerScope();

  const months = useMemo(() => {
    if (mode === 'month') return [monthStart(anchor)];
    if (mode === 'year') return monthsBetween(`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-01`);

    return monthsBetween(rangeFrom, rangeTo);
  }, [mode, anchor, rangeFrom, rangeTo]);

  const reload = useCallback(async () => {
    if (months.length === 0) return;
    setLoading(true);
    try {
      // The server reads the ledger and keeps only the caller's workspaces.
      const result = await new RestApiClient().post<{ success: boolean; data?: LedgerData; message?: string }>(
        '/s/pages/data',
        { page: 'ledger', from: months[0], to: nextMonthStart(months[months.length - 1]) },
      );

      if (!result.success || !result.data) throw new Error(result.message ?? 'Could not load the ledger.');
      setRentals(result.data.rentals);
      setPayments(result.data.payments);
    } catch (error) {
      await enqueueSnackbar({
        message: error instanceof Error ? error.message : 'Could not load the ledger.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    reload();
  }, [reload]);

  const paymentByCell = useMemo(() => {
    const map = new Map<string, Payment>();

    for (const payment of payments) map.set(`${payment.rentalId}|${payment.month}`, payment);

    return map;
  }, [payments]);

  const allRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rentals
      .map((rental) => {
        const cells = months.map((month) => {
          const payment = paymentByCell.get(`${rental.id}|${month}`);

          return { month, payment, status: cellStatus(rental, month, payment, today) };
        });

        return { rental, cells };
      })
      .filter(({ rental, cells }) => {
        if (cells.every((cell) => cell.status === 'none')) return false;
        if (!scope.matches(rental.ownerId)) return false;
        if (type && rental.propertyType !== type) return false;
        if (query && !`${rental.propertyName} ${rental.tenantName}`.toLowerCase().includes(query)) return false;

        return true;
      });
  }, [rentals, months, paymentByCell, search, type, today, scope.key]);

  const rows = useMemo(
    () =>
      allRows.filter(({ cells }) => {
        if (status === 'paid') return cells.some((cell) => cell.status === 'paid');
        if (status === 'overdue') return cells.some((cell) => cell.status === 'overdue');
        if (status === 'unpaid') return cells.some((cell) => cell.status === 'due' || cell.status === 'overdue');

        return true;
      }),
    [allRows, status],
  );

  const totals = useMemo(() => {
    let expected = 0;
    let collected = 0;
    let outstanding = 0;
    let overdue = 0;
    let overdueCount = 0;

    for (const { rental, cells } of allRows) {
      for (const cell of cells) {
        if (cell.status === 'none') continue;
        expected += rental.rent;
        if (cell.status === 'paid') collected += cell.payment?.amount ?? 0;
        if (cell.status === 'due' || cell.status === 'overdue') outstanding += rental.rent;
        if (cell.status === 'overdue') {
          overdue += rental.rent;
          overdueCount += 1;
        }
      }
    }

    return { expected, collected, outstanding, overdue, overdueCount };
  }, [allRows]);

  const periodLabel =
    mode === 'month' ? monthLabel(anchor, true) : mode === 'year' ? anchor.slice(0, 4) : '';

  const step = (delta: number) => setAnchor(shiftMonth(anchor, mode === 'year' ? delta * 12 : delta));

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', display: 'flex', boxSizing: 'border-box', position: 'relative' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: 16, gap: 14, overflow: 'auto' }}>
        {/* Period + filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <OwnerSwitcher scope={scope} />
          <div style={{ display: 'flex', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
            {(['month', 'year', 'range'] as Mode[]).map((option) => (
              <button
                key={option}
                onClick={() => setMode(option)}
                style={{
                  ...control,
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  background: mode === option ? c.bg2 : c.bg,
                  fontWeight: mode === option ? 600 : 400,
                }}
              >
                {option === 'month' ? 'Month' : option === 'year' ? 'Year' : 'Range'}
              </button>
            ))}
          </div>

          {mode === 'range' ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: c.text2 }}>
              <input type="month" value={rangeFrom.slice(0, 7)} onChange={(e) => { const v = readValue(e); if (v) setRangeFrom(`${v}-01`); }} style={control} />
              to
              <input type="month" value={rangeTo.slice(0, 7)} onChange={(e) => { const v = readValue(e); if (v) setRangeTo(`${v}-01`); }} style={control} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => step(-1)} style={{ ...button(), width: 30, padding: 0 }} aria-label="Previous">‹</button>
              <span style={{ minWidth: 88, textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{periodLabel}</span>
              <button onClick={() => step(1)} style={{ ...button(), width: 30, padding: 0 }} aria-label="Next">›</button>
              <button onClick={() => setAnchor(monthStart(today))} style={{ ...button(), color: c.text2 }}>Today</button>
            </div>
          )}

          <div style={{ flex: 1 }} />

          <input placeholder="Search property or tenant" value={search} onChange={(e) => setSearch(readValue(e))} style={{ ...control, width: 200 }} />
          <select value={type} onChange={(e) => setType(readValue(e))} style={control}>
            {TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(readValue(e))} style={control}>
            {STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button onClick={() => { setSelection(null); setSettingsOpen(true); }} style={button()}>Receipt settings</button>
        </div>

        {/* Totals */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {[
            { label: 'Expected', value: rm(totals.expected), color: c.text, filter: '' },
            { label: 'Collected', value: rm(totals.collected), color: 'var(--t-color-green11)', filter: 'paid' },
            { label: 'Outstanding', value: rm(totals.outstanding), color: 'var(--t-color-amber11)', filter: 'unpaid' },
            { label: `Overdue${totals.overdueCount ? ` · ${totals.overdueCount}` : ''}`, value: rm(totals.overdue), color: 'var(--t-color-red11)', filter: 'overdue' },
          ].map((card) => {
            const active = status === card.filter;

            // Clicking a card shows only the matching rows; click again (or Expected) for all.
            return (
              <button
                key={card.label}
                onClick={() => setStatus(active ? '' : card.filter)}
                style={{
                  fontFamily: c.font,
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: active && card.filter ? c.bg : c.bg2,
                  border: `1px solid ${active && card.filter ? c.accent : 'transparent'}`,
                  borderRadius: c.radius,
                  padding: '10px 14px',
                }}
              >
                <div style={{ fontSize: 12, color: c.text2 }}>
                  {card.label}
                  {active && card.filter ? ' · showing' : ''}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: card.color, marginTop: 2 }}>{card.value}</div>
              </button>
            );
          })}
        </div>

        {/* Ledger */}
        {loading && rows.length === 0 ? (
          <div style={{ color: c.text3, fontSize: 13, padding: 24, textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: c.text3, fontSize: 13, padding: 24, textAlign: 'center' }}>
            {allRows.length > 0 ? (
              <>
                Nothing {status === 'paid' ? 'collected' : status === 'overdue' ? 'overdue' : 'outstanding'} in this period.{' '}
                <button onClick={() => setStatus('')} style={{ ...button(), height: 26, marginLeft: 6 }}>
                  Show all
                </button>
              </>
            ) : (
              scope.owner
                ? `No active contracts for ${scope.owner.name} in this period. Set ${scope.owner.name} as the workspace on its properties.`
                : 'No active contracts in this period. Create a contract and set it to Active.'
            )}
          </div>
        ) : mode === 'month' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: c.text3, textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Property</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Tenant</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Due</th>
                <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Rent</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ rental, cells }) => {
                const cell = cells[0];

                return (
                  <tr key={rental.id} style={{ borderTop: `1px solid ${c.border}` }}>
                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>{rental.propertyName}</td>
                    <td style={{ padding: '10px 8px', color: c.text2 }}>{rental.tenantName}</td>
                    <td style={{ padding: '10px 8px', color: c.text2 }}>{dueDateInMonth(cell.month, rental.dueDay).slice(8)} {monthLabel(cell.month)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{rm(cell.payment?.amount || rental.rent)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      {cell.status !== 'none' && (
                        <span style={{ ...STATUS_STYLE[cell.status], fontSize: 12, padding: '2px 8px', borderRadius: 10 }}>
                          {STATUS_LABEL[cell.status]}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          setSelection(null);
                          setStatementFor(rental);
                        }}
                        style={{ ...button(), marginRight: 6, color: c.text2 }}
                      >
                        Statement
                      </button>
                      {cell.status !== 'none' && (
                        <button onClick={() => setSelection({ rental, month: cell.month })} style={button(cell.status !== 'paid')}>
                          {cell.status === 'paid' ? 'View' : 'Record'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 160 + months.length * 38 + 90, display: 'grid', gridTemplateColumns: `minmax(160px, 1.4fr) repeat(${months.length}, minmax(34px, 1fr)) minmax(80px, auto)`, gap: 4, alignItems: 'center', fontSize: 12 }}>
            <div />
            {months.map((month) => (
              <div key={month} style={{ textAlign: 'center', color: month === monthStart(today) ? c.text : c.text3, fontWeight: month === monthStart(today) ? 600 : 400 }}>
                {monthLabel(month)}
                {mode === 'range' && month.slice(5, 7) === '01' ? <div style={{ fontSize: 10 }}>{month.slice(0, 4)}</div> : null}
              </div>
            ))}
            <div style={{ textAlign: 'right', color: c.text3 }}>Collected</div>

            {rows.map(({ rental, cells }) => (
              <div key={rental.id} style={{ display: 'contents' }}>
                <div style={{ lineHeight: 1.3, paddingRight: 8 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{rental.propertyName}</div>
                  <div style={{ color: c.text3 }}>
                    {rental.tenantName} · {rm(rental.rent)} ·{' '}
                    <button
                      onClick={() => {
                        setSelection(null);
                        setStatementFor(rental);
                      }}
                      title="Year statement for the tenant"
                      style={{ fontFamily: c.font, fontSize: 12, color: c.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      Statement
                    </button>
                  </div>
                </div>
                {cells.map((cell) => {
                  const selected = selection?.rental.id === rental.id && selection.month === cell.month;

                  return cell.status === 'none' ? (
                    <div key={cell.month} />
                  ) : (
                    <button
                      key={cell.month}
                      title={`${monthLabel(cell.month, true)} · ${STATUS_LABEL[cell.status]}${cell.payment?.receiptNumber ? ` · ${cell.payment.receiptNumber}` : ''}`}
                      onClick={() => setSelection({ rental, month: cell.month })}
                      style={{
                        ...STATUS_STYLE[cell.status],
                        height: 30,
                        borderRadius: 8,
                        border: selected ? `2px solid ${c.accent}` : STATUS_STYLE[cell.status].border ?? 'none',
                        cursor: 'pointer',
                        fontFamily: c.font,
                        fontSize: 11,
                        fontWeight: 500,
                        padding: 0,
                      }}
                    >
                      {cell.status === 'paid' ? '✓' : cell.status === 'overdue' ? '!' : cell.status === 'due' ? '•' : ''}
                    </button>
                  );
                })}
                <div style={{ textAlign: 'right', fontWeight: 500 }}>
                  {rm(cells.reduce((sum, cell) => sum + (cell.status === 'paid' ? cell.payment?.amount ?? 0 : 0), 0))}
                </div>
              </div>
            ))}
          </div>
          </div>
        )}

        {mode !== 'month' && rows.length > 0 && (
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: c.text2 }}>
            {(['paid', 'due', 'overdue', 'upcoming'] as CellStatus[]).map((key) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...STATUS_STYLE[key], width: 12, height: 12, borderRadius: 3, display: 'inline-block' }} />
                {STATUS_LABEL[key]}
              </span>
            ))}
            <span style={{ color: c.text3 }}>Overdue = {GRACE_DAYS} days after the due day. Click a month to record or view.</span>
          </div>
        )}
      </div>

      {settingsOpen && <ReceiptSettingsPanel onClose={() => setSettingsOpen(false)} />}

      {statementFor && (
        <StatementPanel
          key={statementFor.id}
          rentalId={statementFor.id}
          propertyName={statementFor.propertyName}
          tenantName={statementFor.tenantName}
          tenantPhone={statementFor.tenantPhone}
          initialYear={Number((mode === 'range' ? rangeTo : anchor).slice(0, 4))}
          onClose={() => setStatementFor(null)}
        />
      )}

      {selection && (
        <PaymentPanel
          key={`${selection.rental.id}|${selection.month}`}
          selection={selection}
          payment={paymentByCell.get(`${selection.rental.id}|${selection.month}`)}
          status={cellStatus(selection.rental, selection.month, paymentByCell.get(`${selection.rental.id}|${selection.month}`), today)}
          lastMethod={[...payments].reverse().find((p) => p.rentalId === selection.rental.id && p.method)?.method ?? 'BANK_TRANSFER'}
          onClose={() => setSelection(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------- side panel

const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 };

const PaymentPanel = ({
  selection,
  payment,
  status,
  lastMethod,
  onClose,
  onSaved,
}: {
  selection: Selection;
  payment: Payment | undefined;
  status: CellStatus;
  lastMethod: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const { rental, month } = selection;
  const isPaid = status === 'paid';
  const [amount, setAmount] = useState(String(payment?.amount || rental.rent || ''));
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState(payment?.method ?? lastMethod);
  const [notes, setNotes] = useState('');
  const [sendToTenant, setSendToTenant] = useState(true);
  const [busy, setBusy] = useState<'' | 'preview' | 'save' | 'correct'>('');
  const [paymentId, setPaymentId] = useState<string | null>(payment?.id ?? null);
  const [receipt, setReceipt] = useState<ReceiptViewData | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [scale, setScale] = useState(1);

  const loadReceipt = useCallback(async (id: string) => {
    setLoadingReceipt(true);
    try {
      const result = await new RestApiClient().post<RecordResponse & { receipt?: ReceiptViewData }>(
        '/s/receipts/view',
        { recordId: id },
      );

      setReceipt(result.success && result.receipt ? result.receipt : null);
    } catch {
      setReceipt(null);
    } finally {
      setLoadingReceipt(false);
    }
  }, []);

  // Issued months show their receipt straight away.
  useEffect(() => {
    if (isPaid && payment?.id) {
      setPaymentId(payment.id);
      loadReceipt(payment.id);
    }
  }, [isPaid, payment?.id, loadReceipt]);

  const submit = async (action: 'preview' | 'issue' | 'send') => {
    setBusy(action === 'preview' ? 'preview' : 'save');
    try {
      const result = await new RestApiClient().post<RecordResponse>('/s/ledger/record', {
        rentalId: rental.id,
        month,
        amount: Number(amount.replace(/[^\d.]/g, '')),
        paidOn,
        method,
        notes,
        action,
      });

      if (result.paymentId) setPaymentId(result.paymentId);
      if (result.success && action === 'preview' && result.paymentId) await loadReceipt(result.paymentId);
      await enqueueSnackbar({
        message:
          action === 'preview' && result.success
            ? 'Draft receipt below. Save and send when it looks right.'
            : result.message ?? (result.success ? 'Saved.' : 'Could not save.'),
        variant: result.success ? 'success' : 'error',
      });
      if (result.success && action !== 'preview') await onSaved();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBusy('');
    }
  };

  const correct = async () => {
    if (!payment) return;
    setBusy('correct');
    try {
      const result = await new RestApiClient().post<RecordResponse>('/s/receipts/correct', { recordId: payment.id });

      await enqueueSnackbar({ message: result.message ?? 'Done.', variant: result.success ? 'success' : 'error' });
      if (result.success) {
        await onSaved();
        onClose();
      }
    } finally {
      setBusy('');
    }
  };

  const zoomButton = (delta: number, text: string, labelText: string) => (
    <button
      onClick={() => setScale(Math.min(2, Math.max(0.7, Math.round((scale + delta) * 10) / 10)))}
      style={{ ...button(), width: 28, height: 26, padding: 0 }}
      aria-label={labelText}
    >
      {text}
    </button>
  );

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(520px, 100%)', borderLeft: `1px solid ${c.border}`, background: c.bg, display: 'flex', flexDirection: 'column', overflow: 'auto', boxShadow: '-8px 0 24px rgba(0,0,0,0.08)', zIndex: 2 }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{rental.propertyName}</div>
          <div style={{ fontSize: 12, color: c.text2, marginTop: 2 }}>
            {rental.tenantName} · rent for {monthLabel(month, true)}
          </div>
        </div>
        <span style={{ ...STATUS_STYLE[status], fontSize: 12, padding: '2px 8px', borderRadius: 10 }}>{STATUS_LABEL[status]}</span>
        <button onClick={onClose} style={{ ...button(), width: 28, height: 28, padding: 0 }} aria-label="Close">×</button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(() => {
          const first = rental.tenantName.split(' ')[0] || 'there';
          const period = monthLabel(month, true);
          const due = dueDateInMonth(month, rental.dueDay);
          const text = isPaid
            ? `Hi ${first}, thank you! We've received your rent for ${rental.propertyName} for ${period}${payment?.amount ? ` (${rm(payment.amount)})` : ''}.${payment?.receiptNumber ? ` Receipt no. ${payment.receiptNumber}.` : ''}`
            : `Hi ${first}, a friendly reminder that the rent for ${rental.propertyName} for ${period} (${rm(rental.rent)}) ${status === 'overdue' ? 'was' : 'is'} due on ${Number(due.slice(8, 10))} ${monthLabel(month)}. Please let us know once it's paid. Thank you!`;
          const link = whatsappLink(rental.tenantPhone, text);

          return link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...button(), height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: '#25D366', border: '1px solid #25D366', color: '#fff' }}
            >
              {isPaid ? 'Send thank-you on WhatsApp' : status === 'overdue' ? 'Remind on WhatsApp (overdue)' : 'Remind on WhatsApp'}
            </a>
          ) : (
            <div style={{ fontSize: 12, color: c.text3 }}>Add the tenant's phone number to message them on WhatsApp.</div>
          );
        })()}
        {!isPaid && (
          <>
            <label style={field}>
              Amount received (RM)
              <input value={amount} onChange={(e) => setAmount(readValue(e))} style={{ ...control, height: 34, fontSize: 15, fontWeight: 600 }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={field}>
                Paid on
                <input type="date" value={paidOn} onChange={(e) => setPaidOn(readValue(e))} style={control} />
              </label>
              <label style={field}>
                Method
                <select value={method} onChange={(e) => setMethod(readValue(e))} style={control}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            </div>
            <label style={field}>
              Notes (optional)
              <input value={notes} onChange={(e) => setNotes(readValue(e))} placeholder="Shown on the receipt" style={control} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={sendToTenant} onChange={() => setSendToTenant(!sendToTenant)} />
              Send receipt to tenant (WhatsApp / email)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => submit('preview')} disabled={busy !== ''} style={{ ...button(), flex: 1 }}>
                {busy === 'preview' ? 'Preparing…' : receipt ? 'Update preview' : 'Preview receipt'}
              </button>
              <button onClick={() => submit(sendToTenant ? 'send' : 'issue')} disabled={busy !== ''} style={{ ...button(true), flex: 1.4 }}>
                {busy === 'save' ? 'Saving…' : sendToTenant ? 'Save and send' : 'Save receipt'}
              </button>
            </div>
          </>
        )}

        {(receipt || loadingReceipt) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, fontSize: 12, color: c.text2, fontWeight: 500 }}>
                {isPaid ? 'Receipt' : 'Draft preview (no number used yet)'}
              </div>
              {zoomButton(-0.1, '−', 'Zoom out')}
              <span style={{ fontSize: 12, color: c.text2, minWidth: 38, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
              {zoomButton(0.1, '+', 'Zoom in')}
            </div>
            <div style={{ background: c.bg2, borderRadius: c.radius, padding: 10, overflow: 'auto', maxHeight: 520 }}>
              {loadingReceipt && !receipt ? (
                <div style={{ color: c.text3, fontSize: 13, padding: 24, textAlign: 'center' }}>Loading receipt…</div>
              ) : receipt ? (
                <ReceiptView data={receipt} scale={scale} />
              ) : null}
            </div>
          </div>
        )}

        {isPaid && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              {paymentId && (
                <button
                  onClick={() => navigate(AppPath.RecordShowPage, { objectNameSingular: 'rentPayment', objectRecordId: paymentId })}
                  style={{ ...button(), flex: 1 }}
                >
                  Open payment (PDF download)
                </button>
              )}
              <button onClick={correct} disabled={busy !== ''} style={{ ...button(), flex: 1 }}>
                {busy === 'correct' ? 'Correcting…' : 'Correct receipt'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: c.text3 }}>
              Issued receipts can't be edited. Correct receipt voids this one and makes a draft copy to fix and resend.
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: RENT_LEDGER_FRONT_COMPONENT_ID,
  name: 'rent-ledger',
  description: 'Month-by-month rent ledger with recording and receipts',
  component: RentLedger,
});
