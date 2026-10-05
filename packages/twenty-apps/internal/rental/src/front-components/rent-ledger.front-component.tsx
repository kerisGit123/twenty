import { type CSSProperties, type SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, enqueueSnackbar, navigate } from 'twenty-sdk/front-component';

import { RENT_LEDGER_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { ReceiptSettingsPanel } from 'src/front-components/shared/receipt-settings-panel';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { ReceiptView, type ReceiptViewData } from 'src/front-components/shared/receipt-view';
import { Sheet } from 'src/front-components/shared/sheet';
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
  // Contract being caught up (several past months at once).
  const [catchUpFor, setCatchUpFor] = useState<Rental | null>(null);

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

  const periodLabel = mode === 'month' ? monthLabel(anchor, true) : mode === 'year' ? anchor.slice(0, 4) : `${monthLabel(rangeFrom, true)} – ${monthLabel(rangeTo, true)}`;

  const step = (delta: number) => setAnchor(shiftMonth(anchor, mode === 'year' ? delta * 12 : delta));

  // The month each card highlights: the one shown (month view), else this
  // month when it's in view, else the last month shown.
  const focusMonth = mode === 'month' ? monthStart(anchor) : months.includes(monthStart(today)) ? monthStart(today) : months[months.length - 1];

  const segmented = <T extends string>(value: T, options: Array<{ value: T; label: string }>, onChange: (value: T) => void) => (
    <div style={{ display: 'flex', background: c.bg2, borderRadius: 8, padding: 2, gap: 2 }}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{
            ...control,
            height: 30,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            background: value === option.value ? c.bg : 'transparent',
            boxShadow: value === option.value ? `0 0 0 1px ${c.border2}` : 'none',
            color: value === option.value ? c.text : c.text3,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const statusChip = (value: string, label: string, count?: number) => (
    <button
      key={value}
      onClick={() => setStatus(value)}
      style={{
        fontFamily: c.font,
        fontSize: 13,
        fontWeight: 500,
        height: 32,
        padding: '0 12px',
        borderRadius: 16,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        background: status === value ? 'var(--t-color-blue3)' : c.bg,
        color: status === value ? 'var(--t-color-blue11)' : c.text,
        border: `1px solid ${status === value ? 'var(--t-color-blue7)' : c.border2}`,
      }}
    >
      {label}
      {count ? <span style={{ marginLeft: 6, opacity: 0.7 }}>{count}</span> : null}
    </button>
  );

  const unpaidCount = allRows.filter(({ cells }) => cells.some((cell) => cell.status === 'due' || cell.status === 'overdue')).length;
  const overdueContracts = allRows.filter(({ cells }) => cells.some((cell) => cell.status === 'overdue')).length;
  const collectedShare = totals.expected > 0 ? Math.min(1, totals.collected / totals.expected) : 0;
  const card: CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 12, background: c.bg, minWidth: 0, boxSizing: 'border-box' };
  const pillFor = (cellState: CellStatus, text: string) => (
    <span style={{ ...STATUS_STYLE[cellState], fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{text}</span>
  );

  return (
    // The page fills the screen-tall widget and scrolls inside itself; as a size
    // container it lets side sheets (100cqw x 100cqh) cover exactly what you see.
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', containerType: 'size', boxSizing: 'border-box', position: 'relative' }}>
      {/* Side sheets come first so they can stick to the top of the screen */}
      {settingsOpen && (
        <Sheet width={860} onClose={() => setSettingsOpen(false)}>
          <ReceiptSettingsPanel onClose={() => setSettingsOpen(false)} />
        </Sheet>
      )}
      {statementFor && (
        <Sheet width={560} onClose={() => setStatementFor(null)}>
          <StatementPanel
            key={statementFor.id}
            rentalId={statementFor.id}
            propertyName={statementFor.propertyName}
            tenantName={statementFor.tenantName}
            tenantPhone={statementFor.tenantPhone}
            initialYear={Number((mode === 'range' ? rangeTo : anchor).slice(0, 4))}
            onClose={() => setStatementFor(null)}
          />
        </Sheet>
      )}
      {catchUpFor && (
        <Sheet width={520} onClose={() => setCatchUpFor(null)}>
          <CatchUpPanel
            key={catchUpFor.id}
            rental={catchUpFor}
            months={months.map((month) => ({
              month,
              status: cellStatus(catchUpFor, month, paymentByCell.get(`${catchUpFor.id}|${month}`), today),
            }))}
            lastMethod={[...payments].reverse().find((p) => p.rentalId === catchUpFor.id && p.method)?.method ?? 'BANK_TRANSFER'}
            onClose={() => setCatchUpFor(null)}
            onSaved={reload}
          />
        </Sheet>
      )}
      {selection && (
        <Sheet width={500} onClose={() => setSelection(null)}>
          <PaymentPanel
            key={`${selection.rental.id}|${selection.month}`}
            selection={selection}
            payment={paymentByCell.get(`${selection.rental.id}|${selection.month}`)}
            status={cellStatus(selection.rental, selection.month, paymentByCell.get(`${selection.rental.id}|${selection.month}`), today)}
            lastMethod={[...payments].reverse().find((p) => p.rentalId === selection.rental.id && p.method)?.method ?? 'BANK_TRANSFER'}
            onClose={() => setSelection(null)}
            onSaved={reload}
          />
        </Sheet>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', padding: 'clamp(4px, 2vw, 16px)', gap: 14, maxWidth: 980 }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 650 }}>Rent ledger</div>
            <div style={{ fontSize: 13, color: c.text3 }}>Who paid, who hasn’t — tap a month to record rent and send the receipt.</div>
          </div>
          <button
            onClick={() => {
              setSelection(null);
              setSettingsOpen(true);
            }}
            style={{ ...button(), height: 34, color: c.text2 }}
          >
            ⚙ Receipt settings
          </button>
        </div>

        {/* Workspace + period */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <OwnerSwitcher scope={scope} />
          {segmented(mode, [{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'range', label: 'Range' }], setMode)}
          {mode === 'range' ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: c.text2, flexWrap: 'wrap' }}>
              <input type="month" value={rangeFrom.slice(0, 7)} onChange={(e) => { const v = readValue(e); if (v) setRangeFrom(`${v}-01`); }} style={{ ...control, height: 34 }} />
              to
              <input type="month" value={rangeTo.slice(0, 7)} onChange={(e) => { const v = readValue(e); if (v) setRangeTo(`${v}-01`); }} style={{ ...control, height: 34 }} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => step(-1)} style={{ ...button(), width: 36, height: 34, padding: 0 }} aria-label="Previous">‹</button>
              <span style={{ minWidth: 92, textAlign: 'center', fontWeight: 600, fontSize: 15 }}>{periodLabel}</span>
              <button onClick={() => step(1)} style={{ ...button(), width: 36, height: 34, padding: 0 }} aria-label="Next">›</button>
              {monthStart(anchor) !== monthStart(today) && (
                <button onClick={() => setAnchor(monthStart(today))} style={{ ...button(), height: 34, color: c.text2 }}>
                  Today
                </button>
              )}
            </div>
          )}
        </div>

        {/* Totals: tap to filter */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
          <button
            onClick={() => setStatus(status === 'paid' ? '' : 'paid')}
            style={{ ...card, all: 'unset', boxSizing: 'border-box', cursor: 'pointer', border: `1px solid ${status === 'paid' ? c.accent : c.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <span style={{ fontSize: 13, color: c.text3 }}>Collected</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--t-color-green11)' }}>{rm(totals.collected)}</span>
            <span style={{ height: 6, background: c.bg2, borderRadius: 3, display: 'block' }}>
              <span style={{ display: 'block', height: 6, width: `${collectedShare * 100}%`, background: 'var(--t-color-green9)', borderRadius: 3 }} />
            </span>
            <span style={{ fontSize: 12, color: c.text3 }}>
              {Math.round(collectedShare * 100)}% of {rm(totals.expected)} expected
            </span>
          </button>
          <button
            onClick={() => setStatus(status === 'unpaid' ? '' : 'unpaid')}
            style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', border: `1px solid ${status === 'unpaid' ? c.accent : c.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <span style={{ fontSize: 13, color: c.text3 }}>Still to collect</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: totals.outstanding ? 'var(--t-color-amber11)' : c.text }}>{rm(totals.outstanding)}</span>
            <span style={{ fontSize: 12, color: c.text3 }}>{unpaidCount} contract{unpaidCount === 1 ? '' : 's'} with unpaid months</span>
          </button>
          <button
            onClick={() => setStatus(status === 'overdue' ? '' : 'overdue')}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              cursor: 'pointer',
              border: `1px solid ${status === 'overdue' ? c.accent : totals.overdue ? 'var(--t-color-red6)' : c.border}`,
              background: totals.overdue ? 'var(--t-color-red2)' : 'transparent',
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 13, color: c.text3 }}>Overdue</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: totals.overdue ? 'var(--t-color-red11)' : c.text }}>{rm(totals.overdue)}</span>
            <span style={{ fontSize: 12, color: c.text3 }}>
              {totals.overdueCount ? `${totals.overdueCount} month${totals.overdueCount === 1 ? '' : 's'} late` : 'Nothing late 🎉'}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: 2, maxWidth: '100%' }}>
            {statusChip('', 'All', allRows.length)}
            {statusChip('unpaid', 'Unpaid', unpaidCount)}
            {statusChip('overdue', 'Overdue', overdueContracts)}
            {statusChip('paid', 'Paid')}
          </div>
          <input placeholder="🔍  Property or tenant" value={search} onChange={(e) => setSearch(readValue(e))} style={{ ...control, height: 34, flex: '1 1 180px', minWidth: 0 }} />
          <select value={type} onChange={(e) => setType(readValue(e))} style={{ ...control, height: 34 }}>
            {TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        {/* Contracts */}
        {loading && rows.length === 0 ? (
          <div style={{ color: c.text3, fontSize: 13, padding: 24, textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ ...card, color: c.text3, fontSize: 14, padding: '32px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 28 }}>{allRows.length > 0 ? '✅' : '🏠'}</span>
            {allRows.length > 0 ? (
              <>
                Nothing {status === 'paid' ? 'collected' : status === 'overdue' ? 'overdue' : 'outstanding'} in this period.
                <button onClick={() => setStatus('')} style={button()}>
                  Show all
                </button>
              </>
            ) : scope.owner ? (
              `No active contracts for ${scope.owner.name} in this period. Set ${scope.owner.name} as the workspace on its properties.`
            ) : (
              'No active contracts in this period. Create a contract and set it to Active.'
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(({ rental, cells }) => {
              const focus = cells.find((cell) => cell.month === focusMonth) ?? cells[cells.length - 1];
              const unpaid = cells.filter((cell) => cell.status === 'due' || cell.status === 'overdue');
              const oldestUnpaid = unpaid[0];
              const collected = cells.reduce((sum, cell) => sum + (cell.status === 'paid' ? cell.payment?.amount ?? 0 : 0), 0);
              const due = focus ? dueDateInMonth(focus.month, rental.dueDay) : null;
              const daysLate = due ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000)) : 0;
              const focusText =
                !focus || focus.status === 'none'
                  ? ''
                  : focus.status === 'paid'
                    ? `${monthLabel(focus.month)} paid`
                    : focus.status === 'overdue'
                      ? `${monthLabel(focus.month)} · ${daysLate} day${daysLate === 1 ? '' : 's'} late`
                      : focus.status === 'due'
                        ? `${monthLabel(focus.month)} due ${Number((due ?? '').slice(8, 10))} ${monthLabel(focus.month)}`
                        : `${monthLabel(focus.month)} upcoming`;
              const remindText = oldestUnpaid
                ? `Hi ${rental.tenantName.split(' ')[0] || 'there'}, a friendly reminder that the rent for ${rental.propertyName} for ${monthLabel(oldestUnpaid.month, true)} (${rm(rental.rent)}) ${oldestUnpaid.status === 'overdue' ? 'was' : 'is'} due on ${Number(dueDateInMonth(oldestUnpaid.month, rental.dueDay).slice(8, 10))} ${monthLabel(oldestUnpaid.month)}. Please let us know once it's paid. Thank you!`
                : '';
              const remind = oldestUnpaid ? whatsappLink(rental.tenantPhone, remindText) : null;

              return (
                <div key={rental.id} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, containerType: 'inline-size' }}>
                  {/* Who + where */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ width: 40, height: 40, borderRadius: 10, background: c.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {rental.propertyType === 'SHOP' ? '🏪' : rental.propertyType === 'LANDED' ? '🏡' : rental.propertyType === 'ROOM' ? '🛏️' : '🏢'}
                    </span>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rental.propertyName}</div>
                      <div style={{ fontSize: 13, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rental.tenantName} · {rm(rental.rent)}/month · due on the {rental.dueDay}
                        {rental.dueDay === 1 ? 'st' : rental.dueDay === 2 ? 'nd' : rental.dueDay === 3 ? 'rd' : 'th'}
                      </div>
                    </div>
                    {focus && focus.status !== 'none' ? pillFor(focus.status, focusText) : null}
                  </div>

                  {/* Months: tap one to record or view */}
                  {mode !== 'month' && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`, gap: 'clamp(2px, 0.8cqw, 4px)' }}>
                        {cells.map((cell) => {
                          const selected = selection?.rental.id === rental.id && selection.month === cell.month;
                          const isNow = cell.month === monthStart(today);

                          return cell.status === 'none' ? (
                            <div key={cell.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 'clamp(8px, 2.7cqw, 10.5px)', color: c.text3 }}>{cells.length > 12 ? monthLabel(cell.month).charAt(0) : monthLabel(cell.month)}</span>
                              <span style={{ height: 30, width: '100%', borderRadius: 6, border: `1px dashed ${c.border}` }} />
                            </div>
                          ) : (
                            <button
                              key={cell.month}
                              onClick={() => setSelection({ rental, month: cell.month })}
                              title={`${monthLabel(cell.month, true)} · ${STATUS_LABEL[cell.status]}${cell.payment?.receiptNumber ? ` · ${cell.payment.receiptNumber}` : ''}`}
                              style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 }}
                            >
                              <span style={{ fontSize: 'clamp(8px, 2.7cqw, 10.5px)', color: isNow ? c.text : c.text3, fontWeight: isNow ? 700 : 400 }}>
                                {cells.length > 12 ? monthLabel(cell.month).charAt(0) : monthLabel(cell.month)}
                              </span>
                              <span
                                style={{
                                  ...STATUS_STYLE[cell.status],
                                  height: 30,
                                  width: '100%',
                                  borderRadius: 6,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  boxSizing: 'border-box',
                                  border: selected ? `2px solid ${c.accent}` : isNow ? `1.5px solid ${c.border2}` : 'none',
                                }}
                              >
                                {cell.status === 'paid' ? '✓' : cell.status === 'overdue' ? '!' : cell.status === 'due' ? '•' : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: c.text3, flex: '1 1 140px' }}>
                      {mode === 'month' ? (focus?.payment?.receiptNumber ? `Receipt ${focus.payment.receiptNumber}` : '') : `Collected ${rm(collected)}`}
                      {unpaid.length > 0 && mode !== 'month' ? <span style={{ color: 'var(--t-color-amber11)' }}> · {unpaid.length} unpaid</span> : null}
                    </span>
                    {remind && (
                      <a
                        href={remind}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...button(), height: 34, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: '#25D366', border: '1px solid #25D366', color: '#fff' }}
                      >
                        Remind
                      </a>
                    )}
                    {unpaid.length >= 2 && (
                      <button
                        onClick={() => {
                          setSelection(null);
                          setCatchUpFor(rental);
                        }}
                        style={{ ...button(), height: 34 }}
                        title="Record several months at once"
                      >
                        Catch up ({unpaid.length})
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelection(null);
                        setStatementFor(rental);
                      }}
                      style={{ ...button(), height: 34, color: c.text2 }}
                    >
                      Statement
                    </button>
                    {(oldestUnpaid ?? focus) && (oldestUnpaid ?? focus).status !== 'none' && (
                      <button onClick={() => setSelection({ rental, month: (oldestUnpaid ?? focus).month })} style={{ ...button(Boolean(oldestUnpaid)), height: 34 }}>
                        {oldestUnpaid ? `Record ${monthLabel(oldestUnpaid.month)}` : 'View receipt'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {mode !== 'month' && rows.length > 0 && (
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: c.text2, flexWrap: 'wrap' }}>
            {(['paid', 'due', 'overdue', 'upcoming'] as CellStatus[]).map((key) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...STATUS_STYLE[key], width: 12, height: 12, borderRadius: 3, display: 'inline-block' }} />
                {STATUS_LABEL[key]}
              </span>
            ))}
            <span style={{ color: c.text3 }}>Overdue = {GRACE_DAYS} days after the due day.</span>
          </div>
        )}
      </div>



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
  // Back-dated payments: the receipt can carry the payment date instead of today.
  const [receiptOnPaidDate, setReceiptOnPaidDate] = useState(month < monthStart(todayIso()));
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
        receiptDate: receiptOnPaidDate && paidOn < todayIso() ? paidOn : null,
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

  const first = rental.tenantName.split(' ')[0] || 'there';
  const period = monthLabel(month, true);
  const dueIso = dueDateInMonth(month, rental.dueDay);
  const whatsappText = isPaid
    ? `Hi ${first}, thank you! We've received your rent for ${rental.propertyName} for ${period}${payment?.amount ? ` (${rm(payment.amount)})` : ''}.${payment?.receiptNumber ? ` Receipt no. ${payment.receiptNumber}.` : ''}`
    : `Hi ${first}, a friendly reminder that the rent for ${rental.propertyName} for ${period} (${rm(rental.rent)}) ${status === 'overdue' ? 'was' : 'is'} due on ${Number(dueIso.slice(8, 10))} ${monthLabel(month)}. Please let us know once it's paid. Thank you!`;
  const whatsapp = whatsappLink(rental.tenantPhone, whatsappText);
  const chipStyle = (active: boolean): CSSProperties => ({
    fontFamily: c.font,
    fontSize: 13,
    fontWeight: 500,
    height: 32,
    padding: '0 12px',
    borderRadius: 16,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: active ? 'var(--t-color-blue3)' : c.bg,
    color: active ? 'var(--t-color-blue11)' : c.text,
    border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
  });
  const dateChip = (label: string, iso: string) => (
    <button key={label} onClick={() => setPaidOn(iso)} style={chipStyle(paidOn === iso)}>
      {label}
    </button>
  );
  const methodChip = (value: string, label: string) => (
    <button
      key={value}
      onClick={() => setMethod(value)}
      style={{
        fontFamily: c.font,
        fontSize: 13,
        fontWeight: 500,
        height: 32,
        padding: '0 12px',
        borderRadius: 16,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        background: method === value ? 'var(--t-color-blue3)' : c.bg,
        color: method === value ? 'var(--t-color-blue11)' : c.text,
        border: `1px solid ${method === value ? 'var(--t-color-blue7)' : c.border2}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        height: '100%',
        background: c.bg,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: c.font,
        color: c.text,
      }}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 16 }}>{period} rent</div>
          <div style={{ fontSize: 13, color: c.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rental.propertyName} · {rental.tenantName}
          </div>
        </div>
        <span style={{ ...STATUS_STYLE[status], fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>{STATUS_LABEL[status]}</span>
        <button onClick={onClose} style={{ ...button(), width: 32, height: 32, padding: 0, border: 'none', fontSize: 18, background: 'transparent' }} aria-label="Close">
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!isPaid && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: c.text3 }}>
                Amount received · due {Number(dueIso.slice(8, 10))} {monthLabel(month)}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: `2px solid ${c.accent}`, paddingBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 600, color: c.text3 }}>RM</span>
                <input
                  value={amount}
                  inputMode="decimal"
                  onChange={(e) => setAmount(readValue(e))}
                  style={{ fontFamily: c.font, fontSize: 30, fontWeight: 700, color: c.text, border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, padding: 0 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Paid on</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {dateChip('Today', todayIso())}
                {dateChip('Yesterday', addDays(todayIso(), -1))}
                <input type="date" value={paidOn} onChange={(e) => { const v = readValue(e); if (v) setPaidOn(v); }} style={{ ...control, height: 32 }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Paid by</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{METHODS.map((m) => methodChip(m.value, m.label))}</div>
            </div>

            {paidOn < todayIso() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Receipt dated</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setReceiptOnPaidDate(false)} style={chipStyle(!receiptOnPaidDate)}>
                    Today
                  </button>
                  <button onClick={() => setReceiptOnPaidDate(true)} style={chipStyle(receiptOnPaidDate)}>
                    Payment date · {Number(paidOn.slice(8, 10))} {monthLabel(paidOn)} {paidOn.slice(0, 4)}
                  </button>
                </div>
              </div>
            )}

            <input value={notes} onChange={(e) => setNotes(readValue(e))} placeholder="Note on the receipt (optional)" style={{ ...control, height: 36 }} />

            <button onClick={() => setSendToTenant(!sendToTenant)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
              <span style={{ width: 40, height: 22, borderRadius: 11, background: sendToTenant ? '#25D366' : c.border2, position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: sendToTenant ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff' }} />
              </span>
              Send the receipt to the tenant (WhatsApp / email)
            </button>
          </>
        )}

        {isPaid && paymentId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <a
              href={new RestApiClient().resolveUrl('/s/receipts/share', { query: { payment: paymentId } })}
              target="_blank"
              rel="noreferrer"
              style={{ ...button(true), height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 14 }}
            >
              📤 Send receipt to tenant
            </a>
            <span style={{ fontSize: 12, color: c.text3, lineHeight: 1.4 }}>
              Opens the receipt PDF. On your phone tap <b>Share PDF</b> → WhatsApp → the tenant. On a PC, download it and attach
              it in the WhatsApp chat.
            </span>
          </div>
        )}
        {whatsapp && !isPaid && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...button(), height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: '#fff', border: '1px solid #25D366', color: '#128C7E' }}
          >
            {isPaid ? '💬 Send thank-you on WhatsApp' : status === 'overdue' ? '💬 Remind on WhatsApp (overdue)' : '💬 Remind on WhatsApp'}
          </a>
        )}
        {!whatsapp && <div style={{ fontSize: 12, color: c.text3 }}>Add the tenant’s phone number to message them on WhatsApp.</div>}

        {(receipt || loadingReceipt) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, fontSize: 12, color: c.text2, fontWeight: 500 }}>{isPaid ? 'Receipt' : 'Draft preview (no number used yet)'}</div>
              {zoomButton(-0.1, '−', 'Zoom out')}
              <span style={{ fontSize: 12, color: c.text2, minWidth: 38, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
              {zoomButton(0.1, '+', 'Zoom in')}
            </div>
            <div style={{ background: c.bg2, borderRadius: 10, padding: 10, overflow: 'auto' }}>
              {loadingReceipt && !receipt ? (
                <div style={{ color: c.text3, fontSize: 13, padding: 24, textAlign: 'center' }}>Loading receipt…</div>
              ) : receipt ? (
                <ReceiptView data={receipt} scale={scale} />
              ) : null}
            </div>
          </div>
        )}

        {isPaid && (
          <div style={{ fontSize: 12, color: c.text3 }}>
            Issued receipts can’t be edited. <b>Correct receipt</b> voids this one and makes a draft copy to fix and resend.
          </div>
        )}
      </div>

      {/* Actions stay at the bottom */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${c.border}`, background: c.bg, flexWrap: 'wrap' }}>
        {isPaid ? (
          <>
            {paymentId && (
              <button onClick={() => navigate(AppPath.RecordShowPage, { objectNameSingular: 'rentPayment', objectRecordId: paymentId })} style={{ ...button(), flex: 1, height: 44 }}>
                Open (PDF)
              </button>
            )}
            <button onClick={correct} disabled={busy !== ''} style={{ ...button(), flex: 1, height: 44 }}>
              {busy === 'correct' ? 'Correcting…' : 'Correct receipt'}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => submit('preview')} disabled={busy !== ''} style={{ ...button(), flex: 1, height: 44 }}>
              {busy === 'preview' ? 'Preparing…' : receipt ? 'Update preview' : 'Preview'}
            </button>
            <button onClick={() => submit(sendToTenant ? 'send' : 'issue')} disabled={busy !== ''} style={{ ...button(true), flex: 1.6, height: 44 }}>
              {busy === 'save' ? 'Saving…' : sendToTenant ? 'Save & send receipt' : 'Save receipt'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- catch up

// Records several months for one contract in one go — one receipt per month.
const CatchUpPanel = ({
  rental,
  months,
  lastMethod,
  onClose,
  onSaved,
}: {
  rental: Rental;
  months: Array<{ month: string; status: CellStatus }>;
  lastMethod: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const today = todayIso();
  const open = months.filter((m) => m.status === 'due' || m.status === 'overdue' || m.status === 'upcoming');
  const [picked, setPicked] = useState<string[]>(open.filter((m) => m.status !== 'upcoming').map((m) => m.month));
  const [amount, setAmount] = useState(String(rental.rent || ''));
  const [dateMode, setDateMode] = useState<'same' | 'due'>('same');
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState(lastMethod);
  const [receiptOnPaidDate, setReceiptOnPaidDate] = useState(true);
  const [sendToTenant, setSendToTenant] = useState(false);
  const [progress, setProgress] = useState<Record<string, 'waiting' | 'saving' | 'done' | 'failed'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);

  const amountValue = Number(amount.replace(/[^\d.]/g, ''));
  const ordered = open.map((m) => m.month).filter((month) => picked.includes(month));
  const paidOnFor = (month: string) => (dateMode === 'same' ? paidOn : dueDateInMonth(month, rental.dueDay));
  const finished = ordered.length > 0 && ordered.every((month) => progress[month] === 'done' || progress[month] === 'failed');

  const chip = (active: boolean): CSSProperties => ({
    fontFamily: c.font,
    fontSize: 13,
    fontWeight: 500,
    height: 32,
    padding: '0 12px',
    borderRadius: 16,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: active ? 'var(--t-color-blue3)' : c.bg,
    color: active ? 'var(--t-color-blue11)' : c.text,
    border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
  });
  const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 };

  const run = async () => {
    if (!(amountValue > 0) || ordered.length === 0) return;
    setRunning(true);
    setProgress(Object.fromEntries(ordered.map((month) => [month, 'waiting'])));
    setErrors({});
    for (const month of ordered) {
      setProgress((current) => ({ ...current, [month]: 'saving' }));
      try {
        const date = paidOnFor(month);
        const result = await new RestApiClient().post<RecordResponse>('/s/ledger/record', {
          rentalId: rental.id,
          month,
          amount: amountValue,
          paidOn: date,
          method,
          notes: '',
          receiptDate: receiptOnPaidDate && date < today ? date : null,
          action: sendToTenant ? 'send' : 'issue',
        });

        if (!result.success) throw new Error(result.message ?? 'Could not save.');
        setProgress((current) => ({ ...current, [month]: 'done' }));
      } catch (error) {
        setProgress((current) => ({ ...current, [month]: 'failed' }));
        setErrors((current) => ({ ...current, [month]: error instanceof Error ? error.message : 'Could not save.' }));
      }
    }
    setRunning(false);
    await onSaved();
  };

  const doneCount = ordered.filter((month) => progress[month] === 'done').length;

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 16 }}>Catch up past months</div>
          <div style={{ fontSize: 13, color: c.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rental.propertyName} · {rental.tenantName} · one receipt per month
          </div>
        </div>
        <button onClick={onClose} disabled={running} style={{ ...button(), width: 32, height: 32, padding: 0, border: 'none', fontSize: 18, background: 'transparent' }} aria-label="Close">
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ ...label, flex: 1 }}>Months</span>
            {!running && !finished && (
              <button
                onClick={() => setPicked(picked.length === open.length ? [] : open.map((m) => m.month))}
                style={{ ...button(), height: 26, fontSize: 12, border: 'none', background: 'transparent', color: 'var(--t-color-blue11)' }}
              >
                {picked.length === open.length ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>
          {open.length === 0 && <span style={{ fontSize: 13, color: c.text3 }}>Nothing unpaid in this period. Go back a year with ‹ to catch up older months.</span>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
            {open.map(({ month, status }) => {
              const on = picked.includes(month);
              const state = progress[month];

              return (
                <button
                  key={month}
                  disabled={running || finished}
                  onClick={() => setPicked(on ? picked.filter((m) => m !== month) : [...picked, month])}
                  title={errors[month] ?? ''}
                  style={{
                    ...chip(on),
                    height: 46,
                    borderRadius: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    ...(state === 'done' ? { background: 'var(--t-color-green3)', color: 'var(--t-color-green11)', borderColor: 'var(--t-color-green7)' } : {}),
                    ...(state === 'failed' ? { background: 'var(--t-color-red3)', color: 'var(--t-color-red11)', borderColor: 'var(--t-color-red7)' } : {}),
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {state === 'done' ? '✓ ' : state === 'failed' ? '✗ ' : state === 'saving' ? '… ' : on ? '☑ ' : '☐ '}
                    {monthLabel(month)} {month.slice(2, 4)}
                  </span>
                  <span style={{ fontSize: 10.5, opacity: 0.8 }}>{status === 'upcoming' ? 'in advance' : status === 'overdue' ? 'overdue' : 'due'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!finished && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>Amount each month</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: `2px solid ${c.accent}`, paddingBottom: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: c.text3 }}>RM</span>
                <input
                  value={amount}
                  inputMode="decimal"
                  disabled={running}
                  onChange={(e) => setAmount(readValue(e))}
                  style={{ fontFamily: c.font, fontSize: 26, fontWeight: 700, color: c.text, border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, padding: 0 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={label}>Paid on</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setDateMode('same')} style={chip(dateMode === 'same')}>
                  Same date for all
                </button>
                <button onClick={() => setDateMode('due')} style={chip(dateMode === 'due')}>
                  Each month’s due date
                </button>
                {dateMode === 'same' && (
                  <input type="date" value={paidOn} onChange={(e) => { const v = readValue(e); if (v) setPaidOn(v); }} style={{ ...control, height: 32 }} />
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={label}>Paid by</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {METHODS.map((m) => (
                  <button key={m.value} onClick={() => setMethod(m.value)} style={chip(method === m.value)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={label}>Receipts dated</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => setReceiptOnPaidDate(true)} style={chip(receiptOnPaidDate)}>
                  Payment date
                </button>
                <button onClick={() => setReceiptOnPaidDate(false)} style={chip(!receiptOnPaidDate)}>
                  Today
                </button>
              </div>
            </div>

            <button onClick={() => setSendToTenant(!sendToTenant)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
              <span style={{ width: 40, height: 22, borderRadius: 11, background: sendToTenant ? '#25D366' : c.border2, position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: sendToTenant ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff' }} />
              </span>
              Send each receipt to the tenant
            </button>
          </>
        )}

        {finished && (
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            {doneCount === ordered.length ? '✅' : '⚠️'} {doneCount} of {ordered.length} month{ordered.length === 1 ? '' : 's'} recorded.
            {Object.entries(errors).map(([month, message]) => (
              <div key={month} style={{ fontSize: 12.5, color: 'var(--t-color-red11)' }}>
                {monthLabel(month, true)}: {message}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${c.border}`, background: c.bg, alignItems: 'center' }}>
        {finished ? (
          <button onClick={onClose} style={{ ...button(true), flex: 1, height: 44 }}>
            Done
          </button>
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 13, color: c.text2 }}>
              {ordered.length} receipt{ordered.length === 1 ? '' : 's'} · {rm(ordered.length * (amountValue || 0))}
            </span>
            <button onClick={run} disabled={running || ordered.length === 0 || !(amountValue > 0)} style={{ ...button(true), flex: 1.4, height: 44, opacity: ordered.length && amountValue > 0 ? 1 : 0.55 }}>
              {running ? `Recording ${doneCount + 1} of ${ordered.length}…` : `Record ${ordered.length} month${ordered.length === 1 ? '' : 's'}`}
            </button>
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
