import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar, openSidePanelPage, SidePanelPages } from 'twenty-sdk/front-component';

import { type DateRange, DateRangePicker, presetRange } from 'src/front-components/shared/date-range-picker';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { readValue } from 'src/front-components/shared/read-value';
import { Sheet } from 'src/front-components/shared/sheet';
import type { Expense, Option } from 'src/logic-functions/page-data/expenses-data';
import type { MoneyIn, TransactionsData } from 'src/logic-functions/page-data/transactions-data';
import { todayIso } from 'src/logic-functions/utils/dates';
import { BASE_CURRENCY, formatMoney } from 'src/shared/currencies';
import { expenseCategory } from 'src/shared/expense-categories';
import { MONTHS } from 'src/shared/months';
import { INCOME_CATEGORIES, INCOME_METHODS } from 'src/shared/income-categories';
import { countsAsReceived, METHOD_LABEL, receiptRows, STATUS_LABEL, type TransactionsTab, typeLabel } from 'src/shared/transactions';

// Transactions: every ringgit in and out for a period — money received
// (receipts, voided ones too, and deposits kept), money spent, and the
// register of receipt numbers with any gaps. Each tab downloads as CSV.

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  radius: 'var(--t-border-radius-md)',
  accent: 'var(--t-color-blue9)',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 34,
  padding: '0 10px',
  boxSizing: 'border-box',
  cursor: 'pointer',
};

const small: CSSProperties = { ...control, height: 28, fontSize: 12, padding: '0 8px', display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap' };
const th: CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: c.text3, padding: '10px 12px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
const td: CSSProperties = { fontSize: 13, padding: '12px', borderBottom: `1px solid ${c.border}`, verticalAlign: 'top' };
const card: CSSProperties = { background: c.bg, border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 14, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150, flex: 1 };

const rm = (value: number) => formatMoney(value, BASE_CURRENCY);
const shortDate = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '—');
const monthLabel = (iso: string | null) => (iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');

const STATUS_COLOR: Record<string, string> = { ISSUED: 'green', SENT: 'green', VOID: 'red', KEPT: 'sky', RECORDED: 'blue' };

const Chip = ({ status }: { status: string }) => {
  const color = STATUS_COLOR[status] ?? 'gray';

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
        color: `var(--t-color-${color}11)`,
        background: `var(--t-color-${color}3)`,
        border: `1px solid var(--t-color-${color}6)`,
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
};

type Sort = { key: 'date' | 'amount'; desc: boolean };

const SortHeader = ({ label, sortKey, sort, setSort, align }: { label: string; sortKey: Sort['key']; sort: Sort; setSort: (s: Sort) => void; align?: 'right' }) => (
  <th style={{ ...th, textAlign: align ?? 'left' }}>
    <button
      onClick={() => setSort({ key: sortKey, desc: sort.key === sortKey ? !sort.desc : true })}
      style={{ all: 'unset', cursor: 'pointer', color: sort.key === sortKey ? c.text : c.text3, fontWeight: sort.key === sortKey ? 600 : 500 }}
    >
      {label} {sort.key === sortKey ? (sort.desc ? '↓' : '↑') : '↕'}
    </button>
  </th>
);

const sortRows = <T,>(rows: T[], sort: Sort, date: (row: T) => string, amount: (row: T) => number) =>
  [...rows].sort((a, b) => {
    const diff = sort.key === 'date' ? date(a).localeCompare(date(b)) : amount(a) - amount(b);

    return sort.desc ? -diff : diff;
  });

const Table = ({ head, children, empty }: { head: ReactNode; children: ReactNode[]; empty: string }) => (
  <div style={{ overflowX: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
      <thead>{head}</thead>
      <tbody>
        {children.length ? (
          children
        ) : (
          <tr>
            <td colSpan={9} style={{ ...td, textAlign: 'center', color: c.text3, padding: 32 }}>
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const receiptUrl = (id: string) => new RestApiClient().resolveUrl('/s/receipts/share', { query: { payment: id } });
const openPayment = (id: string) => openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: id, objectNameSingular: 'rentPayment' });
const openIncome = (id: string) => openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: id, objectNameSingular: 'income' });
const openExpense = (id: string) => openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: id, objectNameSingular: 'expense' });

const matches = (query: string, ...fields: Array<string | null | undefined>) => {
  const q = query.trim().toLowerCase();

  return !q || fields.some((field) => (field ?? '').toLowerCase().includes(q));
};

// Asks why, then voids the receipt (it keeps its number).
const VoidSheet = ({ row, onClose, onDone }: { row: MoneyIn; onClose: () => void; onDone: () => void }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await new RestApiClient().post<{ success: boolean; message: string }>('/s/transactions/void', { paymentId: row.id, reason });

      await enqueueSnackbar({ message: result.message, variant: result.success ? 'success' : 'error' });
      if (result.success) onDone();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not void the receipt.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet width={420} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Void receipt {row.receiptNumber}?</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          {rm(row.amount)} · {row.tenantName} · {row.propertyName}. The receipt keeps its number and is marked VOID; the money stops counting
          as received. Record a new payment if it was a mistake in the details.
        </span>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text3 }}>
          Why? (kept on the payment)
          <textarea
            value={reason}
            onChange={(e) => setReason(readValue(e))}
            rows={3}
            placeholder="e.g. Wrong amount, re-issued as the next receipt"
            style={{ ...control, height: 'auto', padding: 8, cursor: 'text', resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={control}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !reason.trim()}
            style={{ ...control, background: 'var(--t-color-red9)', borderColor: 'var(--t-color-red9)', color: 'white', fontWeight: 600, opacity: busy || !reason.trim() ? 0.5 : 1 }}
          >
            {busy ? 'Voiding…' : 'Void receipt'}
          </button>
        </div>
      </div>
    </Sheet>
  );
};

// Records money in that isn't a rent receipt (late fee, refund, interest...).
const AddIncomeSheet = ({
  today,
  owners,
  properties,
  defaultOwnerId,
  onClose,
  onDone,
}: {
  today: string;
  owners: Option[];
  properties: Option[];
  defaultOwnerId: string | null;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [form, setForm] = useState({
    name: '',
    incomeDate: today,
    amount: '',
    category: 'LATE_FEE',
    method: 'BANK_TRANSFER',
    receivedFrom: '',
    propertyId: '',
    ownerId: defaultOwnerId ?? owners[0]?.id ?? '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: Parameters<typeof readValue>[0]) => setForm({ ...form, [key]: readValue(e) });
  const amount = Number(form.amount.replace(/[^0-9.]/g, ''));
  const ready = Boolean(form.name.trim() && amount > 0 && form.incomeDate);
  // Only the chosen workspace's properties (the property decides the workspace).
  const shownProperties = properties.filter((p) => !form.ownerId || p.ownerId === form.ownerId);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await new RestApiClient().post<{ success: boolean; message?: string }>('/s/income/create', {
        ...form,
        amount,
        propertyId: form.propertyId || null,
        ownerId: form.ownerId || null,
      });

      await enqueueSnackbar({ message: result.message ?? (result.success ? 'Income recorded.' : 'Could not save.'), variant: result.success ? 'success' : 'error' });
      if (result.success) onDone();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, input: ReactNode) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text3 }}>
      {label}
      {input}
    </label>
  );
  const input: CSSProperties = { ...control, cursor: 'text', width: '100%' };
  const select: CSSProperties = { ...control, width: '100%' };

  return (
    <Sheet width={440} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Add income</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          For money in that isn&apos;t a rent receipt: a late fee, a damage charge, a refund, bank interest. No receipt is issued.
        </span>
        {field('What was it for?', <input value={form.name} onChange={set('name')} placeholder="e.g. Late fee for September" style={input} />)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {field('Date received', <input type="date" value={form.incomeDate} onChange={set('incomeDate')} style={input} />)}
          {field('Amount (RM)', <input value={form.amount} onChange={set('amount')} inputMode="decimal" placeholder="0.00" style={input} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {field(
            'Category',
            <select value={form.category} onChange={set('category')} style={select}>
              {INCOME_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>,
          )}
          {field(
            'Method',
            <select value={form.method} onChange={set('method')} style={select}>
              {INCOME_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>,
          )}
        </div>
        {field('Received from', <input value={form.receivedFrom} onChange={set('receivedFrom')} placeholder="Tenant, bank, contractor..." style={input} />)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {field(
            'Workspace',
            <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: readValue(e), propertyId: '' })} style={select}>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>,
          )}
          {field(
            'Property (optional)',
            <select value={form.propertyId} onChange={set('propertyId')} style={select}>
              <option value="">None</option>
              {shownProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>,
          )}
        </div>
        {field('Notes', <textarea value={form.notes} onChange={set('notes')} rows={2} style={{ ...input, height: 'auto', padding: 8, resize: 'vertical' }} />)}
        <span style={{ fontSize: 12, color: c.text3 }}>To attach a bank slip, open the record with Details after saving.</span>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={control}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !ready}
            style={{ ...control, background: c.accent, borderColor: c.accent, color: 'white', fontWeight: 600, opacity: busy || !ready ? 0.5 : 1 }}
          >
            {busy ? 'Saving…' : 'Save income'}
          </button>
        </div>
      </div>
    </Sheet>
  );
};

const TABS: Array<{ key: TransactionsTab; label: string }> = [
  { key: 'in', label: 'Money in' },
  { key: 'out', label: 'Money out' },
  { key: 'receipts', label: 'Receipts' },
];

export const Transactions = () => {
  const scope = useOwnerScope();
  const today = todayIso();
  const [tab, setTab] = useState<TransactionsTab>('in');
  const [range, setRange] = useState<DateRange>(() => presetRange('thisMonth', today));
  const [data, setData] = useState<TransactionsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'void'>('all');
  const [sort, setSort] = useState<Sort>({ key: 'date', desc: true });
  const [voiding, setVoiding] = useState<MoneyIn | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');
    new RestApiClient()
      .post<{ success: boolean; data?: TransactionsData; message?: string }>('/s/pages/data', { page: 'transactions', from: range.from, to: range.to })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) setError(result.message ?? 'Could not load the transactions.');
        else setData(result.data);
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const mine = useCallback(<T extends { ownerId: string | null }>(rows: T[]) => (scope.ownerId ? rows.filter((r) => r.ownerId === scope.ownerId) : rows), [scope.key]);

  const moneyIn = useMemo(() => mine(data?.moneyIn ?? []), [data, mine]);
  const moneyOut = useMemo(() => mine(data?.moneyOut ?? []), [data, mine]);

  const inRows = useMemo(
    () =>
      sortRows(
        moneyIn.filter(
          (r) =>
            (statusFilter === 'all' || (statusFilter === 'void' ? r.status === 'VOID' : r.status !== 'VOID')) &&
            matches(query, r.receiptNumber, r.tenantName, r.propertyName, r.ownerName, typeLabel(r), r.notes),
        ),
        sort,
        (r) => r.date,
        (r) => r.amount,
      ),
    [moneyIn, statusFilter, query, sort],
  );
  const outRows = useMemo(
    () => sortRows(moneyOut.filter((e) => matches(query, e.name, e.paidTo, e.propertyName, e.ownerName, expenseCategory(e.category).label)), sort, (e) => e.date ?? '', (e) => e.amount),
    [moneyOut, query, sort],
  );
  const register = useMemo(() => receiptRows(moneyIn).filter((r) => matches(query, r.receiptNumber, r.tenantName, r.propertyName, r.notes)), [moneyIn, query]);

  const received = moneyIn.filter(countsAsReceived);
  const totalIn = received.reduce((sum, r) => sum + r.amount, 0);
  const rentIn = received.filter((r) => r.type === 'RENT').reduce((sum, r) => sum + r.amount, 0);
  const depositsIn = received.filter((r) => r.type === 'DEPOSIT' || r.type === 'UTILITY_DEPOSIT').reduce((sum, r) => sum + r.amount, 0);
  const voided = moneyIn.filter((r) => r.status === 'VOID');
  const otherIn = received.filter((r) => r.type === 'INCOME').reduce((sum, r) => sum + r.amount, 0);
  const outByCurrency = moneyOut.reduce((map, e) => map.set(e.currency, (map.get(e.currency) ?? 0) + e.amount), new Map<string, number>());
  const gaps = data?.gaps ?? [];

  const csvUrl = new RestApiClient().resolveUrl('/s/transactions/csv', {
    query: { tab, from: range.from, to: range.to, ...(scope.ownerId ? { owner: scope.ownerId } : {}) },
  });

  const summary = (label: string, value: string, note?: string, color?: string) => (
    <div key={label} style={card}>
      <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 600, color: color ?? c.text }}>{value}</span>
      {note ? <span style={{ fontSize: 12, color: c.text3 }}>{note}</span> : null}
    </div>
  );

  const moneyInTab = (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {summary('Received', rm(totalIn), `${received.length} payment${received.length === 1 ? '' : 's'}`, 'var(--t-color-green11)')}
        {summary('Rent', rm(rentIn))}
        {summary('Deposits held', rm(depositsIn), 'Owed back at move-out')}
        {summary('Other income', rm(otherIn), 'Recorded by hand')}
        {summary('Voided', String(voided.length), voided.length ? rm(voided.reduce((s, r) => s + r.amount, 0)) + ' not counted' : 'None')}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {(['all', 'paid', 'void'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            style={{ ...small, fontWeight: statusFilter === key ? 600 : 400, borderColor: statusFilter === key ? c.accent : c.border2 }}
          >
            {key === 'all' ? 'All' : key === 'paid' ? 'Paid' : 'Void'}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={() => setAdding(true)} style={{ ...small, height: 32, fontSize: 13, background: c.accent, borderColor: c.accent, color: 'white', fontWeight: 600 }}>
          + Add income
        </button>
      </div>
      <Table
        empty="No money received in this period."
        head={
          <tr>
            <SortHeader label="Date" sortKey="date" sort={sort} setSort={setSort} />
            <th style={th}>Receipt no.</th>
            <th style={th}>Tenant · property</th>
            <th style={th}>Type</th>
            <th style={th}>Method</th>
            <th style={th}>Status</th>
            <SortHeader label="Amount" sortKey="amount" sort={sort} setSort={setSort} align="right" />
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr>
        }
      >
        {inRows.map((r) => (
          <tr key={r.id} style={{ opacity: r.status === 'VOID' ? 0.6 : 1 }}>
            <td style={{ ...td, whiteSpace: 'nowrap', color: c.text2 }}>{shortDate(r.date)}</td>
            <td style={{ ...td, whiteSpace: 'nowrap', textDecoration: r.status === 'VOID' ? 'line-through' : 'none' }}>{r.receiptNumber || '—'}</td>
            <td style={td}>
              {r.type === 'INCOME' ? (
                <>
                  <div>{r.notes || '—'}</div>
                  <div style={{ fontSize: 12, color: c.text3 }}>{[r.tenantName && `from ${r.tenantName}`, r.propertyName].filter(Boolean).join(' · ')}</div>
                </>
              ) : (
                <>
                  <div>{r.tenantName || '—'}</div>
                  <div style={{ fontSize: 12, color: c.text3 }}>
                    {r.propertyName}
                    {r.month && r.type === 'RENT' ? ` · ${monthLabel(r.month)} rent` : ''}
                  </div>
                </>
              )}
            </td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{typeLabel(r)}</td>
            <td style={{ ...td, whiteSpace: 'nowrap', color: c.text2 }}>{r.method ? METHOD_LABEL[r.method] ?? r.method : '—'}</td>
            <td style={td}>
              <Chip status={r.status} />
            </td>
            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 500, textDecoration: r.status === 'VOID' ? 'line-through' : 'none' }}>{rm(r.amount)}</td>
            <td style={{ ...td, textAlign: 'right' }}>
              <div style={{ display: 'inline-flex', gap: 6 }}>
                {r.hasFile && r.receiptNumber ? (
                  <a href={receiptUrl(r.id)} target="_blank" rel="noreferrer" style={small}>
                    ⬇ Receipt
                  </a>
                ) : null}
                {r.status !== 'KEPT' ? (
                  <button onClick={() => (r.type === 'INCOME' ? openIncome(r.id) : openPayment(r.id))} style={small}>
                    Details
                  </button>
                ) : null}
                {r.status === 'ISSUED' || r.status === 'SENT' ? (
                  <button onClick={() => setVoiding(r)} style={{ ...small, color: 'var(--t-color-red11)' }}>
                    Void
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {moneyIn.some((r) => r.method === 'FROM_DEPOSIT') ? (
        <span style={{ fontSize: 12, color: c.text3 }}>Rent paid from the deposit is listed but not added to "Received" (the deposit was counted when it came in).</span>
      ) : null}
    </>
  );

  const moneyOutTab = (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[...outByCurrency.entries()].map(([currency, total]) => summary(`Spent (${currency})`, formatMoney(total, currency), undefined, 'var(--t-color-red11)'))}
        {outByCurrency.size === 0 ? summary('Spent', rm(0)) : null}
        {summary('Expenses', String(moneyOut.length), `${moneyOut.filter((e) => !e.files && !e.noBillNeeded).length} without a bill`)}
      </div>
      <Table
        empty="No expenses in this period."
        head={
          <tr>
            <SortHeader label="Date" sortKey="date" sort={sort} setSort={setSort} />
            <th style={th}>What</th>
            <th style={th}>Category</th>
            <th style={th}>Paid to</th>
            <th style={th}>Property</th>
            <th style={th}>Bill</th>
            <SortHeader label="Amount" sortKey="amount" sort={sort} setSort={setSort} align="right" />
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr>
        }
      >
        {outRows.map((e: Expense) => (
          <tr key={e.id}>
            <td style={{ ...td, whiteSpace: 'nowrap', color: c.text2 }}>{shortDate(e.date)}</td>
            <td style={td}>{e.name || '—'}</td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{expenseCategory(e.category).label}</td>
            <td style={{ ...td, color: c.text2 }}>{e.paidTo || '—'}</td>
            <td style={{ ...td, color: c.text2 }}>{e.propertyName || '—'}</td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>
              {e.fileList[0] ? (
                <a href={e.fileList[0].url} target="_blank" rel="noreferrer" style={small}>
                  📎 {e.files > 1 ? `${e.files} files` : 'View'}
                </a>
              ) : (
                <span style={{ fontSize: 12, color: e.noBillNeeded ? c.text3 : 'var(--t-color-amber11)' }}>{e.noBillNeeded ? 'Not needed' : 'Missing'}</span>
              )}
            </td>
            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 500 }}>{formatMoney(e.amount, e.currency)}</td>
            <td style={{ ...td, textAlign: 'right' }}>
              <button onClick={() => openExpense(e.id)} style={small}>
                Details
              </button>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );

  const receiptsTab = (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {summary('Receipts issued', String(register.filter((r) => r.status !== 'VOID').length))}
        {summary('Voided', String(register.filter((r) => r.status === 'VOID').length))}
        {summary('Missing numbers', String(gaps.reduce((s, g) => s + g.missing.length + g.more, 0)), gaps.length ? 'See below' : 'None — the numbers run in order', gaps.length ? 'var(--t-color-amber11)' : undefined)}
      </div>
      {gaps.length ? (
        <div style={{ background: 'var(--t-color-amber2)', border: '1px solid var(--t-color-amber6)', borderRadius: c.radius, padding: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 600, color: 'var(--t-color-amber11)' }}>Receipt numbers with no payment</span>
          {gaps.map((g) => (
            <span key={g.series} style={{ color: c.text2 }}>
              {g.missing.join(', ')}
              {g.more ? ` and ${g.more} more` : ''}
            </span>
          ))}
          <span style={{ color: c.text3, fontSize: 12 }}>
            Usually a payment that was deleted after its receipt was issued. Check the deleted payments (Payments → ⋯ → Deleted) and restore it, or
            note why for your records.
          </span>
        </div>
      ) : null}
      <Table
        empty="No receipts in this period."
        head={
          <tr>
            <th style={th}>Receipt no.</th>
            <th style={th}>Receipt date</th>
            <th style={th}>Tenant · property</th>
            <th style={th}>Type</th>
            <th style={th}>Status</th>
            <th style={{ ...th, textAlign: 'right' }}>Amount</th>
            <th style={{ ...th, textAlign: 'right' }}>PDF</th>
          </tr>
        }
      >
        {register.map((r) => (
          <tr key={r.id}>
            <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 500, textDecoration: r.status === 'VOID' ? 'line-through' : 'none' }}>{r.receiptNumber}</td>
            <td style={{ ...td, whiteSpace: 'nowrap', color: c.text2 }}>{shortDate(r.receiptDate ?? r.date)}</td>
            <td style={td}>
              <div>{r.tenantName || '—'}</div>
              <div style={{ fontSize: 12, color: c.text3 }}>{r.propertyName}</div>
              {r.status === 'VOID' && r.notes ? <div style={{ fontSize: 12, color: 'var(--t-color-red11)', whiteSpace: 'pre-line' }}>{r.notes}</div> : null}
            </td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{typeLabel(r)}</td>
            <td style={td}>
              <Chip status={r.status} />
            </td>
            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', textDecoration: r.status === 'VOID' ? 'line-through' : 'none' }}>{rm(r.amount)}</td>
            <td style={{ ...td, textAlign: 'right' }}>
              {r.hasFile ? (
                <a href={receiptUrl(r.id)} target="_blank" rel="noreferrer" style={small}>
                  ⬇ PDF
                </a>
              ) : (
                '—'
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', containerType: 'size', boxSizing: 'border-box', position: 'relative' }}>
      {adding && data ? (
        <AddIncomeSheet
          today={today}
          owners={data.owners}
          properties={data.properties}
          defaultOwnerId={scope.ownerId || null}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      ) : null}
      {voiding ? (
        <VoidSheet
          row={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            refresh();
          }}
        />
      ) : null}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Transactions</span>
          <span style={{ fontSize: 13, color: c.text3 }}>Money received and spent, and every receipt number.</span>
        </div>
        <OwnerSwitcher scope={scope} />
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${c.border}` }}>
        {TABS.map((t) => {
          const count = t.key === 'in' ? moneyIn.length : t.key === 'out' ? moneyOut.length : receiptRows(moneyIn).length;

          return (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSort({ key: 'date', desc: true });
              }}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '8px 12px',
                fontSize: 14,
                fontWeight: tab === t.key ? 600 : 500,
                color: tab === t.key ? c.text : c.text3,
                borderBottom: `2px solid ${tab === t.key ? c.text : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {t.label} {data ? <span style={{ fontSize: 12, color: c.text3, fontWeight: 400 }}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <DateRangePicker value={range} today={today} onChange={setRange} />
        <button onClick={() => setRange(presetRange('thisMonth', today))} style={control}>
          Clear
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(readValue(e))}
          placeholder="Search tenant, property, receipt no."
          style={{ ...control, cursor: 'text', flex: 1, minWidth: 160, maxWidth: 320 }}
        />
        <span style={{ flex: 1 }} />
        <button onClick={refresh} disabled={loading} style={control} title="Refresh">
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
        <a href={csvUrl} target="_blank" rel="noreferrer" style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} title="Download this tab as CSV">
          ⬇ CSV
        </a>
      </div>

      {error ? <span style={{ color: 'var(--t-color-red11)', fontSize: 13 }}>{error}</span> : null}
      {!data && !error ? <span style={{ color: c.text3, fontSize: 13 }}>Loading…</span> : null}
      {data ? (tab === 'in' ? moneyInTab : tab === 'out' ? moneyOutTab : receiptsTab) : null}
      </div>
    </div>
  );
};
