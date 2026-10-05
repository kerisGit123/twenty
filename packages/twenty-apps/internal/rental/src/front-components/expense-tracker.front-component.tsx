import { type CSSProperties, type ReactNode, type SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, enqueueSnackbar, navigate, openSidePanelPage, SidePanelPages } from 'twenty-sdk/front-component';

import { EXPENSE_TRACKER_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { FileDrop, filesFromEvent, type PickedFile, uploadFile } from 'src/front-components/shared/file-drop';
import { FileViewer, type ViewerFile } from 'src/front-components/shared/file-viewer';
import { Sheet } from 'src/front-components/shared/sheet';
import type { Expense, ExpensesData, Option } from 'src/logic-functions/page-data/expenses-data';
import { monthStart, nextMonthStart, todayIso } from 'src/logic-functions/utils/dates';
import { REPEATS, repeatOf, type RepeatingBill } from 'src/shared/repeating';
import { BASE_CURRENCY, CURRENCIES, currencySymbol, formatMoney } from 'src/shared/currencies';
import {
  EXPENSE_AREAS,
  EXPENSE_CATEGORIES,
  EXPENSE_GROUPS,
  type ExpenseArea,
  expenseCategory,
  expenseGroup,
  groupByKey,
} from 'src/shared/expense-categories';

// Expenses: everything you spend — everyday life, your properties and your
// business. Pick a period and area, see where the money went, and add an
// expense in a few taps (amount, what, category); property is only asked for
// property costs. Works on a phone.

type Mode = 'month' | 'year' | 'range';
type GroupBy = 'month' | 'category' | 'property' | 'owner';
type AreaFilter = 'ALL' | ExpenseArea;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METHODS = [
  { value: 'CASH', label: 'Cash', icon: '💵' },
  { value: 'CARD', label: 'Card', icon: '💳' },
  { value: 'EWALLET', label: 'E-wallet', icon: '📱' },
  { value: 'DUITNOW', label: 'DuitNow', icon: '⚡' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer', icon: '🏦' },
  { value: 'OTHER', label: 'Other', icon: '•' },
];

// ---------------------------------------------------------------- helpers

const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shiftMonth = (iso: string, delta: number) => {
  const [year, month] = iso.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
};

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const shortDate = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}` : '—');
// With the year when it isn't this year.
const dueDate = (iso: string) => (iso.slice(0, 4) === todayIso().slice(0, 4) ? shortDate(iso) : `${shortDate(iso)} ${iso.slice(0, 4)}`);
const monthTitle = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const openExpense = (id: string) => openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: id, objectNameSingular: 'expense' });

const areaOf = (category: string | null) => expenseGroup(category).area;

// ---------------------------------------------------------------- look

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  blue: 'var(--t-color-blue9)',
  blueText: 'var(--t-color-blue11)',
  blueSoft: 'var(--t-color-blue3)',
  amber: 'var(--t-color-amber11)',
  amberSoft: 'var(--t-color-amber3)',
  radius: 'var(--t-border-radius-md)',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 14,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: 8,
  height: 36,
  padding: '0 10px',
  boxSizing: 'border-box',
  width: '100%',
};

const button = (tone: 'plain' | 'primary' | 'ghost' = 'plain'): CSSProperties => ({
  ...control,
  width: 'auto',
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  ...(tone === 'primary' ? { background: c.blue, color: '#fff', border: `1px solid ${c.blue}` } : {}),
  ...(tone === 'ghost' ? { background: 'transparent', border: '1px solid transparent', color: c.text2 } : {}),
});

const chip = (active: boolean): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 13,
  fontWeight: 500,
  height: 32,
  padding: '0 12px',
  borderRadius: 16,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
  background: active ? c.blueSoft : c.bg,
  color: active ? c.blueText : c.text,
  border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
});

const card: CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 12, background: c.bg, padding: 14, minWidth: 0, boxSizing: 'border-box' };

const iconBubble = (group: string, size = 36): CSSProperties => {
  const color = groupByKey(group).color;

  return {
    width: size,
    height: size,
    borderRadius: size / 2,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.5,
    background: color === 'gray' ? c.bg2 : `var(--t-color-${color}3)`,
  };
};

const Label = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</span>
);

// ---------------------------------------------------------------- page

const ExpenseTracker = () => {
  const today = todayIso();
  const scope = useOwnerScope();
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(monthStart(today));
  const [rangeFrom, setRangeFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [rangeTo, setRangeTo] = useState(monthStart(today));
  const [area, setArea] = useState<AreaFilter>('ALL');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState('');
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [owners, setOwners] = useState<Option[]>([]);
  const [properties, setProperties] = useState<Option[]>([]);
  const [repeating, setRepeating] = useState<RepeatingBill[]>([]);
  const [showAllBills, setShowAllBills] = useState(false);
  const [billBusy, setBillBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  // Viewing an expense's bills; adding bills to one; a row being dropped on.
  const [viewing, setViewing] = useState<{ files: ViewerFile[]; title: string } | null>(null);
  const [billFor, setBillFor] = useState<Expense | null>(null);
  const [dropRow, setDropRow] = useState('');
  const [rowBusy, setRowBusy] = useState('');

  const [from, to] = useMemo(() => {
    if (mode === 'month') return [monthStart(anchor), nextMonthStart(anchor)];
    if (mode === 'year') return [`${anchor.slice(0, 4)}-01-01`, `${Number(anchor.slice(0, 4)) + 1}-01-01`];

    return [monthStart(rangeFrom), nextMonthStart(rangeTo)];
  }, [mode, anchor, rangeFrom, rangeTo]);

  const reload = useCallback(async (): Promise<Expense[] | null> => {
    let fresh: Expense[] | null = null;

    setLoading(true);
    try {
      // The server reads the expenses and keeps only the caller's workspaces.
      const result = await new RestApiClient().post<{ success: boolean; data?: ExpensesData; message?: string }>('/s/pages/data', {
        page: 'expenses',
        from,
        to,
      });

      if (!result.success || !result.data) throw new Error(result.message ?? 'Could not load expenses.');
      setExpenses(result.data.expenses);
      fresh = result.data.expenses;
      setOwners(result.data.owners);
      setProperties(result.data.properties);
      setRepeating(result.data.repeating ?? []);
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not load expenses.', variant: 'error' });
    } finally {
      setLoading(false);
    }

    return fresh;
  }, [from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  // In this workspace and area (before the finer filters): drives "Where it went".
  const inArea = useMemo(
    () => expenses.filter((e) => scope.matches(e.ownerId) && (area === 'ALL' || areaOf(e.category) === area)),
    [expenses, area, scope.key],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return inArea.filter(
      (e) =>
        (!groupFilter || expenseCategory(e.category).group === groupFilter) &&
        (!propertyFilter || (propertyFilter === '__none' ? !e.propertyId : e.propertyId === propertyFilter)) &&
        (!missingOnly || (e.files === 0 && !e.noBillNeeded)) &&
        (!term || [e.name, e.paidTo, e.propertyName, e.ownerName, expenseCategory(e.category).label].some((text) => (text ?? '').toLowerCase().includes(term))),
    );
  }, [inArea, groupFilter, propertyFilter, missingOnly, search]);

  // Totals per currency (amounts in different currencies are never added together).
  const totalsOf = (rows: Expense[]) => {
    const map = new Map<string, number>();

    for (const e of rows) map.set(e.currency, (map.get(e.currency) ?? 0) + e.amount);

    return [...map.entries()].sort(([a], [b]) => (a === BASE_CURRENCY ? -1 : b === BASE_CURRENCY ? 1 : a.localeCompare(b)));
  };
  const moneyList = (rows: Expense[]) => totalsOf(rows).map(([code, value]) => formatMoney(value, code)).join(' + ') || formatMoney(0);
  const totals = totalsOf(visible);
  const mainTotal = totals[0] ?? [BASE_CURRENCY, 0];
  const missing = inArea.filter((e) => e.files === 0 && !e.noBillNeeded).length;

  // Spending by group, biggest first.
  const byGroup = useMemo(() => {
    const map = new Map<string, number>();

    for (const e of inArea) {
      if (e.currency !== BASE_CURRENCY) continue;
      const key = expenseCategory(e.category).group;

      map.set(key, (map.get(key) ?? 0) + e.amount);
    }

    return [...map.entries()].map(([key, value]) => ({ group: groupByKey(key), value })).sort((a, b) => b.value - a.value);
  }, [inArea]);
  const areaTotal = byGroup.reduce((sum, row) => sum + row.value, 0);

  const sections = useMemo(() => {
    const keyOf = (e: Expense) =>
      groupBy === 'month'
        ? (e.date ?? '').slice(0, 7)
        : groupBy === 'category'
          ? expenseCategory(e.category).group
          : groupBy === 'property'
            ? e.propertyName || 'Not for a property'
            : e.ownerName || 'No workspace';
    const map = new Map<string, Expense[]>();

    for (const e of visible) map.set(keyOf(e), [...(map.get(keyOf(e)) ?? []), e]);

    const entries = [...map.entries()].map(([key, rows]) => ({
      key,
      title:
        groupBy === 'month'
          ? key
            ? monthTitle(`${key}-01`)
            : 'No date'
          : groupBy === 'category'
            ? `${groupByKey(key).icon} ${groupByKey(key).label}`
            : key,
      rows: [...rows].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
      total: rows.filter((e) => e.currency === BASE_CURRENCY).reduce((sum, e) => sum + e.amount, 0),
      totalText: moneyList(rows),
    }));

    return groupBy === 'month' ? entries.sort((a, b) => b.key.localeCompare(a.key)) : entries.sort((a, b) => b.total - a.total);
  }, [visible, groupBy]);

  // Categories used most recently, for the quick picks in the add sheet.
  const recentCategories = useMemo(() => {
    const seen: string[] = [];

    for (const e of [...expenses].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))) {
      if (e.category && !seen.includes(e.category)) seen.push(e.category);
      if (seen.length >= 6) break;
    }

    return seen;
  }, [expenses]);

  // Repeating bills: due within 30 days first; the rest on request.
  const bills = repeating.filter((b) => scope.matches(b.ownerId));
  const billsSoon = bills.filter((b) => b.nextDate <= addDays(today, 30));
  const billsShown = showAllBills ? bills : billsSoon;
  const billAction = async (bill: RepeatingBill, action: 'add' | 'stop') => {
    setBillBusy(`${bill.id}|${action}`);
    try {
      const result = await new RestApiClient().post<{ success: boolean; id?: string; message?: string }>('/s/expenses/repeat', { expenseId: bill.id, action });

      await enqueueSnackbar({ message: result.message ?? (result.success ? 'Done.' : 'Could not save.'), variant: result.success ? 'success' : 'error' });
      if (result.success) await reload();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBillBusy('');
    }
  };

  const periodLabel = mode === 'month' ? monthTitle(anchor) : mode === 'year' ? anchor.slice(0, 4) : '';
  const step = (delta: number) => setAnchor(shiftMonth(anchor, mode === 'year' ? delta * 12 : delta));
  const anyFilter = Boolean(groupFilter || propertyFilter || search || missingOnly);
  const propertyOptions = properties.filter((p) => scope.matches(p.ownerId ?? null));

  const segmented = <T extends string>(value: T, options: Array<{ value: T; label: string }>, onChange: (value: T) => void) => (
    <div style={{ display: 'flex', background: c.bg2, borderRadius: 8, padding: 2, gap: 2 }}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{
            ...button('ghost'),
            height: 30,
            fontSize: 13,
            padding: '0 10px',
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

  return (
    // The page fills the screen-tall widget and scrolls inside itself; as a size
    // container it lets the add sheet (100cqw x 100cqh) cover exactly what you see.
    <div style={{ position: 'relative', fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', containerType: 'size', boxSizing: 'border-box' }}>
      {/* The add sheet comes first so it can stick to the top of the screen */}
      {adding && (
        <AddExpenseSheet
          owners={owners}
          properties={properties}
          defaultOwnerId={scope.ownerId}
          defaultArea={area === 'ALL' ? 'EVERYDAY' : area}
          recent={recentCategories}
          onClose={() => setAdding(false)}
          onSaved={async (id, again, withBill) => {
            await reload();
            if (!again) {
              setAdding(false);
              // Without a bill, open it so one can be attached later.
              if (!withBill) await openExpense(id);
            }
          }}
        />
      )}
      {viewing && (
        <Sheet width={900} onClose={() => setViewing(null)}>
          <FileViewer files={viewing.files} title={viewing.title} onClose={() => setViewing(null)} />
        </Sheet>
      )}
      {billFor && (
        <Sheet width={480} onClose={() => setBillFor(null)}>
          <BillSheet
            key={billFor.id}
            expense={billFor}
            onClose={() => setBillFor(null)}
            onView={(files, title) => setViewing({ files, title })}
            onChanged={async () => {
              const fresh = await reload();
              const updated = fresh?.find((x) => x.id === billFor.id);

              if (updated) setBillFor(updated);
            }}
          />
        </Sheet>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(4px, 2vw, 16px)', maxWidth: 980 }}>
        {/* Title + add */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 650 }}>Expenses</div>
            <div style={{ fontSize: 13, color: c.text3 }}>Everyday, property and business spending in one place.</div>
          </div>
          <button onClick={() => setAdding(true)} style={{ ...button('primary'), height: 40, padding: '0 16px', fontSize: 14 }}>
            ＋ Add expense
          </button>
        </div>

        {/* Workspace + period */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <OwnerSwitcher scope={scope} />
          {segmented(mode, [{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'range', label: 'Range' }], setMode)}
          {mode === 'range' ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: c.text2, flexWrap: 'wrap' }}>
              <input type="month" value={rangeFrom.slice(0, 7)} onChange={(e) => { const v = readValue(e); if (v) setRangeFrom(`${v}-01`); }} style={{ ...control, width: 'auto' }} />
              to
              <input type="month" value={rangeTo.slice(0, 7)} onChange={(e) => { const v = readValue(e); if (v) setRangeTo(`${v}-01`); }} style={{ ...control, width: 'auto' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => step(-1)} style={{ ...button(), width: 36, padding: 0 }} aria-label="Previous">‹</button>
              <span style={{ minWidth: 92, textAlign: 'center', fontWeight: 600, fontSize: 15 }}>{periodLabel}</span>
              <button onClick={() => step(1)} style={{ ...button(), width: 36, padding: 0 }} aria-label="Next">›</button>
            </div>
          )}
        </div>

        {/* Area tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: 2 }}>
          {[{ key: 'ALL' as AreaFilter, label: 'All', icon: '✦' }, ...EXPENSE_AREAS].map((option) => (
            <button
              key={option.key}
              onClick={() => {
                setArea(option.key);
                setGroupFilter(null);
              }}
              style={chip(area === option.key)}
            >
              <span>{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>

        {/* Total + where it went */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            <span style={{ fontSize: 13, color: c.text3 }}>
              {groupFilter ? `${groupByKey(groupFilter).icon} ${groupByKey(groupFilter).label}` : 'Total spent'} · {periodLabel || 'selected range'}
            </span>
            <span style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(mainTotal[1], mainTotal[0])}</span>
            {totals.slice(1).map(([code, value]) => (
              <span key={code} style={{ fontSize: 15, fontWeight: 600, color: c.text2, fontVariantNumeric: 'tabular-nums' }}>
                + {formatMoney(value, code)}
              </span>
            ))}
            <span style={{ fontSize: 13, color: c.text3 }}>
              {visible.length} expense{visible.length === 1 ? '' : 's'}
            </span>
            {missing > 0 && (
              <button
                onClick={() => setMissingOnly(!missingOnly)}
                style={{ ...chip(missingOnly), alignSelf: 'flex-start', background: missingOnly ? c.amberSoft : c.bg, color: c.amber, borderColor: 'var(--t-color-amber7)' }}
              >
                ⚠️ {missing} without a bill{missingOnly ? ' · showing' : ''}
              </button>
            )}
          </div>

          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>
                <Label>Where it went</Label>
              </span>
              {groupFilter && (
                <button onClick={() => setGroupFilter(null)} style={{ ...button('ghost'), height: 24, fontSize: 12, padding: '0 6px' }}>
                  Show all
                </button>
              )}
            </div>
            {byGroup.length === 0 && <span style={{ fontSize: 13, color: c.text3 }}>Nothing spent yet.</span>}
            {totals.length > 1 && <span style={{ fontSize: 11.5, color: c.text3 }}>In {currencySymbol(BASE_CURRENCY)} only — other currencies are listed separately.</span>}
            {byGroup.slice(0, 6).map(({ group, value }) => {
              const active = groupFilter === group.key;

              return (
                <button
                  key={group.key}
                  onClick={() => setGroupFilter(active ? null : group.key)}
                  style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '3px 4px', borderRadius: 8, background: active ? c.blueSoft : 'transparent' }}
                  title="Show only these"
                >
                  <span style={iconBubble(group.key, 28)}>{group.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.label}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{rm(value)}</span>
                    </span>
                    <span style={{ height: 5, background: c.bg2, borderRadius: 3, display: 'block' }}>
                      <span
                        style={{
                          display: 'block',
                          width: `${areaTotal ? (value / areaTotal) * 100 : 0}%`,
                          height: 5,
                          borderRadius: 3,
                          background: `var(--t-color-${group.color === 'gray' ? 'gray' : group.color}9)`,
                        }}
                      />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Repeating bills that fall due: add the next one with a tap */}
        {bills.length > 0 && (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: c.bg2, fontSize: 13, fontWeight: 600 }}>
              <span style={{ flex: 1 }}>
                🔁 Repeating bills
                <span style={{ fontWeight: 400, color: c.text3, marginLeft: 8 }}>
                  {billsSoon.length ? `${billsSoon.length} due in the next 30 days` : 'nothing due in the next 30 days'}
                </span>
              </span>
              {bills.length > billsSoon.length && (
                <button onClick={() => setShowAllBills(!showAllBills)} style={{ ...button('ghost'), height: 24, fontSize: 12, padding: '0 6px' }}>
                  {showAllBills ? 'Due soon only' : `All ${bills.length}`}
                </button>
              )}
            </div>
            {billsShown.map((bill) => {
              const category = expenseCategory(bill.category);
              const late = bill.nextDate < today;

              return (
                <div key={bill.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
                  <span style={iconBubble(category.group)}>{groupByKey(category.group).icon}</span>
                  <span style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bill.name}</span>
                    <span style={{ fontSize: 12, color: late ? c.amber : c.text3 }}>
                      {late ? 'Was due' : 'Due'} {dueDate(bill.nextDate)} · {repeatOf(bill.every).short}
                      {bill.propertyName ? ` · ${bill.propertyName}` : ''}
                    </span>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(bill.amount, bill.currency)}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => billAction(bill, 'stop')} disabled={billBusy !== ''} title="Stop repeating" style={{ ...button(), height: 32, fontSize: 12.5, color: c.text3 }}>
                      {billBusy === `${bill.id}|stop` ? '…' : 'Stop'}
                    </button>
                    <button onClick={() => billAction(bill, 'add')} disabled={billBusy !== ''} style={{ ...button('primary'), height: 32, fontSize: 12.5 }}>
                      {billBusy === `${bill.id}|add` ? 'Adding…' : 'Add'}
                    </button>
                  </span>
                </div>
              );
            })}
            {billsShown.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 12.5, color: c.text3, borderTop: `1px solid ${c.border}` }}>
                Next: {bills[0].name} on {dueDate(bills[0].nextDate)}.
              </div>
            )}
          </div>
        )}

        {/* Search + filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input placeholder="🔍  Search expenses…" value={search} onChange={(e) => setSearch(readValue(e))} style={{ ...control, flex: '1 1 200px', width: 'auto' }} />
          {propertyOptions.length > 0 && (
            <select value={propertyFilter} onChange={(e) => setPropertyFilter(readValue(e))} style={{ ...control, width: 'auto', flex: '0 1 200px' }}>
              <option value="">All properties</option>
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  🏢 {p.name}
                </option>
              ))}
              <option value="__none">Not for a property</option>
            </select>
          )}
          <select value={groupBy} onChange={(e) => setGroupBy(readValue(e) as GroupBy)} style={{ ...control, width: 'auto' }} title="Group the list by">
            <option value="month">By month</option>
            <option value="category">By category</option>
            <option value="property">By property</option>
            <option value="owner">By workspace</option>
          </select>
          {anyFilter && (
            <button
              onClick={() => {
                setGroupFilter(null);
                setPropertyFilter('');
                setSearch('');
                setMissingOnly(false);
              }}
              style={button('ghost')}
            >
              Clear
            </button>
          )}
        </div>

        {/* List */}
        {loading && <div style={{ fontSize: 13, color: c.text3 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 28 }}>🧾</span>
            <span style={{ fontSize: 14, color: c.text2 }}>{anyFilter ? 'No expenses match these filters.' : 'No expenses here yet.'}</span>
            {!anyFilter && (
              <button onClick={() => setAdding(true)} style={button('primary')}>
                ＋ Add your first expense
              </button>
            )}
          </div>
        )}

        {!loading &&
          sections.map((section) => (
            <div key={section.key} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 14px', background: c.bg2, fontSize: 13, fontWeight: 600 }}>
                <span>
                  {section.title}
                  <span style={{ fontWeight: 400, color: c.text3, marginLeft: 8 }}>{section.rows.length}</span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{section.totalText}</span>
              </div>
              {section.rows.map((e) => {
                const category = expenseCategory(e.category);
                const hasBill = e.files > 0 || e.noBillNeeded;

                const dropOn = async (files: PickedFile[]) => {
                  setRowBusy(e.id);

                  let added = 0;
                  let problem = '';

                  for (const file of files.slice(0, 5)) {
                    const result = await uploadFile(file, { expenseId: e.id });

                    if (result.success) added += 1;
                    else problem = result.message ?? 'Upload failed.';
                  }
                  setRowBusy('');
                  await enqueueSnackbar({
                    message: added ? `Attached ${added} file${added === 1 ? '' : 's'} to ${e.name || category.label}${problem ? ` — ${problem}` : ''}` : problem,
                    variant: added ? 'success' : 'error',
                  });
                  if (added) await reload();
                };

                return (
                  <div
                    key={e.id}
                    onDragOver={() => dropRow !== e.id && setDropRow(e.id)}
                    onDragEnter={() => setDropRow(e.id)}
                    onDragLeave={() => setDropRow('')}
                    onDrop={(event) => {
                      setDropRow('');

                      const files = filesFromEvent(event);

                      if (files.length) dropOn(files);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      paddingRight: 10,
                      borderTop: `1px solid ${c.border}`,
                      background: dropRow === e.id ? 'var(--t-color-blue2)' : 'transparent',
                      outline: dropRow === e.id ? '2px dashed var(--t-color-blue8)' : 'none',
                      outlineOffset: -2,
                    }}
                  >
                  <button
                    onClick={() => openExpense(e.id)}
                    style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px 10px 14px', boxSizing: 'border-box', flex: 1, minWidth: 0 }}
                  >
                    <span style={iconBubble(category.group)}>{groupByKey(category.group).icon}</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name || category.label}</span>
                      <span style={{ fontSize: 12, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.repeatEvery && e.repeatEvery !== 'NONE' ? '🔁 ' : ''}
                        {[category.label, e.propertyName, e.paidTo].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: c.text }}>{formatMoney(e.amount, e.currency)}</span>
                      <span style={{ fontSize: 12, color: hasBill ? c.text3 : c.amber }}>
                        {dropRow === e.id ? 'Drop to attach' : rowBusy === e.id ? 'Uploading…' : `${shortDate(e.date)}${e.files || e.noBillNeeded ? '' : ' · no bill'}`}
                      </span>
                    </span>
                  </button>
                  {e.files > 0 ? (
                    <button
                      onClick={() => setViewing({ files: e.fileList, title: `${e.name || category.label} · ${formatMoney(e.amount, e.currency)}` })}
                      title="View the bill"
                      style={{ ...button(), height: 30, padding: '0 8px', fontSize: 12.5, flexShrink: 0 }}
                    >
                      📎{e.files > 1 ? ` ${e.files}` : ''}
                    </button>
                  ) : !e.noBillNeeded ? (
                    <button
                      onClick={() => setBillFor(e)}
                      title="Attach the bill or receipt — or drop it on this row"
                      style={{ ...button(), height: 30, padding: '0 8px', fontSize: 12.5, flexShrink: 0, color: c.amber, borderColor: 'var(--t-color-amber7)' }}
                    >
                      ＋ Bill
                    </button>
                  ) : null}
                  </div>
                );
              })}
            </div>
          ))}

        <button onClick={() => navigate(AppPath.RecordIndexPage, { objectNamePlural: 'expenses' })} style={{ ...button('ghost'), alignSelf: 'flex-start', fontSize: 12 }}>
          Open as a table →
        </button>
      </div>

    </div>
  );
};

// ---------------------------------------------------------------- bill sheet

// Attach (more) bills to one expense, and see what's there.
const BillSheet = ({
  expense,
  onClose,
  onView,
  onChanged,
}: {
  expense: Expense;
  onClose: () => void;
  onView: (files: ViewerFile[], title: string) => void;
  onChanged: () => Promise<void>;
}) => {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const title = `${expense.name || expenseCategory(expense.category).label} · ${formatMoney(expense.amount, expense.currency)}`;

  const add = async (files: PickedFile[]) => {
    setBusy(true);
    setErrors([]);

    const problems: string[] = [];
    let added = 0;

    for (const file of files.slice(0, Math.max(0, 5 - expense.files))) {
      const result = await uploadFile(file, { expenseId: expense.id });

      if (result.success) added += 1;
      else problems.push(result.message ?? `${file.name}: upload failed`);
    }
    setErrors(problems);
    setBusy(false);
    if (added) {
      await enqueueSnackbar({ message: `Attached ${added} file${added === 1 ? '' : 's'}.`, variant: 'success' });
      await onChanged();
    }
  };

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${c.border}` }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 16, fontWeight: 650 }}>Bill / receipt</span>
          <span style={{ fontSize: 13, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </span>
        <button onClick={onClose} style={{ ...button('ghost'), width: 36, padding: 0, fontSize: 18 }} aria-label="Close">
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {expense.fileList.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {expense.fileList.map((file, index) => (
              <button
                key={`${file.url}-${index}`}
                onClick={() => onView(expense.fileList, title)}
                title={file.label}
                style={{ ...button(), height: 34, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {file.extension === 'pdf' ? '📕' : '🖼️'} {file.label}
              </button>
            ))}
          </div>
        )}
        {expense.files < 5 ? (
          <FileDrop onFiles={add} disabled={busy} title={busy ? 'Uploading…' : 'Drop the bill or receipt here'} hint="or tap to choose / take a photo — PDF or photos, up to 20 MB" />
        ) : (
          <span style={{ fontSize: 13, color: c.text3 }}>This expense already has 5 files.</span>
        )}
        {errors.map((message) => (
          <span key={message} style={{ fontSize: 12.5, color: 'var(--t-color-red11)' }}>
            {message}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- add sheet

const CURRENCY_KEY = 'rental.expenseCurrency';

const lastCurrency = () => {
  try {
    const stored = globalThis.localStorage?.getItem(CURRENCY_KEY);

    return CURRENCIES.some((x) => x.code === stored) ? (stored as string) : BASE_CURRENCY;
  } catch {
    return BASE_CURRENCY;
  }
};

const rememberCurrency = (code: string) => {
  try {
    globalThis.localStorage?.setItem(CURRENCY_KEY, code);
  } catch {
    // Storage can be unavailable; the choice lasts for this visit.
  }
};

const AddExpenseSheet = ({
  owners,
  properties,
  defaultOwnerId,
  defaultArea,
  recent,
  onClose,
  onSaved,
}: {
  owners: Option[];
  properties: Option[];
  defaultOwnerId: string;
  defaultArea: ExpenseArea;
  recent: string[];
  onClose: () => void;
  onSaved: (id: string, again: boolean, withBill: boolean) => Promise<void>;
}) => {
  // Bill / receipt picked before saving; uploaded once the expense exists.
  const [bills, setBills] = useState<PickedFile[]>([]);
  const today = todayIso();
  const personal = owners.find((o) => /^personal$/i.test(o.name))?.id ?? '';
  // The workspace picked in the sidebar is where the expense goes.
  const fixedOwner = defaultOwnerId ? owners.find((o) => o.id === defaultOwnerId) ?? null : null;
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(lastCurrency);
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [pickerArea, setPickerArea] = useState<ExpenseArea>(defaultArea);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState('CASH');
  const [ownerId, setOwnerId] = useState(fixedOwner?.id || personal || owners[0]?.id || '');
  const [linkProperty, setLinkProperty] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  const [more, setMore] = useState(false);
  const [paidTo, setPaidTo] = useState('');
  const [notes, setNotes] = useState('');
  const [repeatEvery, setRepeatEvery] = useState('NONE');
  const [busy, setBusy] = useState<'' | 'save' | 'again'>('');
  const [savedCount, setSavedCount] = useState(0);

  const chosen = category ? expenseCategory(category) : null;
  const isPropertyCost = chosen ? areaOf(chosen.value) === 'PROPERTY' : false;
  const showProperty = isPropertyCost || linkProperty;
  const workspaceProperties = properties.filter((p) => !ownerId || p.ownerId === ownerId);
  const amountValue = Number(amount.replace(/,/g, ''));
  const ready = Boolean(name.trim() && Number.isFinite(amountValue) && amountValue > 0 && category);

  const term = categorySearch.trim().toLowerCase();
  const searched = term ? EXPENSE_CATEGORIES.filter((x) => `${x.label} ${groupByKey(x.group).label}`.toLowerCase().includes(term)) : [];

  const pick = (value: string) => {
    setCategory(value);
    setCategorySearch('');
    setOpenGroup(null);
  };

  const save = async (again: boolean) => {
    if (!ready) {
      await enqueueSnackbar({ message: !(amountValue > 0) ? 'Enter the amount.' : !name.trim() ? 'Say what it was for.' : 'Pick a category.', variant: 'error' });

      return;
    }
    setBusy(again ? 'again' : 'save');
    try {
      const result = await new RestApiClient().post<{ success: boolean; id?: string; message?: string }>('/s/expenses/create', {
        name,
        expenseDate: date,
        amount: amountValue,
        currency,
        category,
        method,
        paidTo,
        notes,
        propertyId: showProperty ? propertyId || null : null,
        ownerId: ownerId || null,
        repeatEvery,
      });

      if (!result.success || !result.id) throw new Error(result.message ?? 'Could not save.');
      rememberCurrency(currency);

      let attached = 0;
      let problem = '';

      for (const file of bills.slice(0, 5)) {
        const upload = await uploadFile(file, { expenseId: result.id });

        if (upload.success) attached += 1;
        else problem = upload.message ?? 'A file could not be attached.';
      }
      await enqueueSnackbar({
        message: `Saved ${formatMoney(amountValue, currency)} · ${name.trim()}${attached ? ` · ${attached} file${attached === 1 ? '' : 's'} attached` : ''}${problem ? ` — ${problem}` : ''}`,
        variant: problem && !attached ? 'warning' : 'success',
      });
      if (again) {
        setAmount('');
        setName('');
        setPaidTo('');
        setNotes('');
        setCategory(null);
        setRepeatEvery('NONE');
        setBills([]);
        setSavedCount(savedCount + 1);
      }
      await onSaved(result.id, again, attached > 0);
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBusy('');
    }
  };

  const categoryChip = (value: string, withIcon = true) => {
    const item = expenseCategory(value);

    return (
      <button key={value} onClick={() => pick(value)} style={chip(category === value)}>
        {withIcon ? <span>{groupByKey(item.group).icon}</span> : null}
        {item.label}
      </button>
    );
  };

  const section = (title: string, children: ReactNode, extra?: ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>
          <Label>{title}</Label>
        </span>
        {extra}
      </div>
      {children}
    </div>
  );

  // Step 1: group tiles. Step 2: the group's categories.
  const categoryPicker = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {recent.length > 0 && !openGroup && !term && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: 2 }}>
          <span style={{ fontSize: 12, color: c.text3, alignSelf: 'center', flexShrink: 0 }}>Recent</span>
          {recent.map((value) => categoryChip(value))}
        </div>
      )}
      {!openGroup && <input value={categorySearch} onChange={(e) => setCategorySearch(readValue(e))} placeholder="🔍  Search, e.g. petrol, zakat, repairs" style={control} />}

      {term ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {searched.length ? searched.map((x) => categoryChip(x.value)) : <span style={{ fontSize: 13, color: c.text3 }}>No match — try “Other”.</span>}
        </div>
      ) : openGroup ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setOpenGroup(null)} style={{ ...button(), height: 32, padding: '0 10px' }}>
              ‹ Back
            </button>
            <span style={iconBubble(openGroup, 30)}>{groupByKey(openGroup).icon}</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{groupByKey(openGroup).label}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 45%), 1fr))', gap: 8 }}>
            {EXPENSE_CATEGORIES.filter((x) => x.group === openGroup).map((x) => (
              <button
                key={x.value}
                onClick={() => pick(x.value)}
                style={{ ...button(), height: 44, justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.2, ...(category === x.value ? { background: c.blueSoft, color: c.blueText } : {}) }}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: 2 }}>
            {EXPENSE_AREAS.map((option) => (
              <button key={option.key} onClick={() => setPickerArea(option.key)} style={chip(pickerArea === option.key)}>
                {option.icon} {option.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
            {EXPENSE_GROUPS.filter((g) => g.area === pickerArea).map((group) => {
              const only = EXPENSE_CATEGORIES.filter((x) => x.group === group.key);

              return (
                <button
                  key={group.key}
                  onClick={() => (only.length === 1 ? pick(only[0].value) : setOpenGroup(group.key))}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 4px',
                    borderRadius: 12,
                    border: `1px solid ${c.border}`,
                    textAlign: 'center',
                  }}
                >
                  <span style={iconBubble(group.key, 42)}>{group.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: c.text, lineHeight: 1.2 }}>{group.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <Sheet width={480} onClose={onClose}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${c.border}` }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 650 }}>
            New expense {savedCount > 0 ? <span style={{ fontSize: 12, fontWeight: 400, color: c.text3 }}>· {savedCount} saved</span> : null}
          </span>
          <button onClick={onClose} style={{ ...button('ghost'), width: 36, padding: 0, fontSize: 18 }} aria-label="Close">
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Amount first, big; tap the currency to change it */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `2px solid ${amountValue > 0 ? c.blue : c.border2}`, paddingBottom: 6 }}>
              <button
                onClick={() => setPickingCurrency(!pickingCurrency)}
                title="Change currency"
                style={{ all: 'unset', cursor: 'pointer', fontSize: 20, fontWeight: 700, color: c.text2, padding: '2px 8px', borderRadius: 8, background: c.bg2, whiteSpace: 'nowrap' }}
              >
                {currencySymbol(currency)} ▾
              </button>
              <input
                value={amount}
                inputMode="decimal"
                placeholder="0.00"
                onChange={(e) => setAmount(readValue(e).replace(/[^\d.,]/g, ''))}
                style={{ fontFamily: c.font, fontSize: 34, fontWeight: 700, color: c.text, border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, padding: 0 }}
              />
            </div>
            {pickingCurrency && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CURRENCIES.map((x) => (
                  <button
                    key={x.code}
                    onClick={() => {
                      setCurrency(x.code);
                      setPickingCurrency(false);
                    }}
                    title={x.name}
                    style={chip(currency === x.code)}
                  >
                    <b>{x.symbol}</b> {x.code}
                  </button>
                ))}
              </div>
            )}
          </div>

          <input value={name} onChange={(e) => setName(readValue(e))} placeholder="What was it for? e.g. Petrol, Aircon service" style={{ ...control, height: 42, fontSize: 15 }} />

          {/* Category */}
          {section(
            'Category',
            chosen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${c.border2}`, borderRadius: 12, padding: '8px 10px' }}>
                <span style={iconBubble(chosen.group)}>{groupByKey(chosen.group).icon}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{chosen.label}</span>
                  <span style={{ fontSize: 12, color: c.text3 }}>{groupByKey(chosen.group).label}</span>
                </span>
                <button
                  onClick={() => {
                    setCategory(null);
                    setOpenGroup(null);
                  }}
                  style={{ ...button(), height: 32, fontSize: 13 }}
                >
                  Change
                </button>
              </div>
            ) : (
              categoryPicker
            ),
          )}

          {/* When */}
          {section(
            'When',
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setDate(today)} style={chip(date === today)}>
                Today
              </button>
              <button onClick={() => setDate(addDays(today, -1))} style={chip(date === addDays(today, -1))}>
                Yesterday
              </button>
              <input type="date" value={date} onChange={(e) => { const v = readValue(e); if (v) setDate(v); }} style={{ ...control, width: 'auto', height: 32 }} />
            </div>,
          )}

          {/* Repeats: quit rent, insurance, strata, subscriptions */}
          {section(
            'Repeats',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {REPEATS.map((r) => (
                  <button key={r.value} onClick={() => setRepeatEvery(r.value)} style={chip(repeatEvery === r.value)}>
                    {r.value === 'NONE' ? 'One-off' : `🔁 ${r.label}`}
                  </button>
                ))}
              </div>
              {repeatEvery !== 'NONE' && (
                <span style={{ fontSize: 12, color: c.text3 }}>The next one shows up on Today and here when it’s due — add it with one tap.</span>
              )}
            </div>,
          )}

          {/* Paid with */}
          {section(
            'Paid with',
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {METHODS.map((m) => (
                <button key={m.value} onClick={() => setMethod(m.value)} style={chip(method === m.value)}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>,
          )}

          {/* Workspace (fixed when one is picked in the sidebar) + property */}
          {section(
            'For',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fixedOwner ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: c.bg2 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: c.bg, border: `1px solid ${c.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {fixedOwner.name.charAt(0).toUpperCase()}
                  </span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{fixedOwner.name}</span>
                    <span style={{ fontSize: 12, color: c.text3 }}>The workspace you’re in — switch it in the sidebar</span>
                  </span>
                </div>
              ) : (
                <select
                  value={ownerId}
                  onChange={(e) => {
                    setOwnerId(readValue(e));
                    setPropertyId('');
                  }}
                  style={control}
                >
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
              {showProperty ? (
                <select value={propertyId} onChange={(e) => setPropertyId(readValue(e))} style={control}>
                  <option value="">{isPropertyCost ? 'Which property? (optional)' : 'No property'}</option>
                  {workspaceProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      🏢 {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                workspaceProperties.length > 0 && (
                  <button onClick={() => setLinkProperty(true)} style={{ ...button('ghost'), alignSelf: 'flex-start', height: 28, fontSize: 13, padding: '0 4px', color: c.blueText }}>
                    ＋ Link to a property
                  </button>
                )
              )}
            </div>,
          )}

          {/* Bill / receipt: drop it or take a photo now */}
          {section(
            'Bill / receipt',
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bills.map((file, index) => (
                <div key={`${file.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 10px', borderRadius: 10, background: c.bg2 }}>
                  <span>{/\.pdf$/i.test(file.name) ? '📕' : '🖼️'}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  <button onClick={() => setBills(bills.filter((_, i) => i !== index))} style={{ ...button('ghost'), width: 28, height: 28, padding: 0 }} aria-label="Remove">
                    ×
                  </button>
                </div>
              ))}
              {bills.length < 5 && (
                <FileDrop
                  compact
                  onFiles={(files) => setBills([...bills, ...files].slice(0, 5))}
                  title={bills.length ? 'Add another page' : 'Drop the bill here'}
                  hint="or tap to choose / take a photo"
                />
              )}
            </div>,
          )}

          {/* More */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setMore(!more)} style={{ ...button('ghost'), alignSelf: 'flex-start', height: 28, fontSize: 13, padding: '0 4px' }}>
              {more ? '▾' : '▸'} More details (paid to, notes)
            </button>
            {more && (
              <>
                <input value={paidTo} onChange={(e) => setPaidTo(readValue(e))} placeholder="Paid to — shop, contractor, council…" style={control} />
                <textarea value={notes} onChange={(e) => setNotes(readValue(e))} placeholder="Notes" rows={3} style={{ ...control, height: 'auto', padding: '8px 10px', resize: 'vertical' }} />
              </>
            )}
          </div>

          {bills.length === 0 && <div style={{ fontSize: 12, color: c.text3 }}>No bill now? Save — you can drop it on the expense later.</div>}
        </div>

        {/* Actions stay at the bottom */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${c.border}`, background: c.bg }}>
          <button onClick={() => save(true)} disabled={busy !== ''} style={{ ...button(), flex: 1, height: 44 }}>
            {busy === 'again' ? 'Saving…' : 'Save & add another'}
          </button>
          <button onClick={() => save(false)} disabled={busy !== ''} style={{ ...button('primary'), flex: 1, height: 44, opacity: ready ? 1 : 0.6 }}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Sheet>
  );
};

export default defineFrontComponent({
  universalIdentifier: EXPENSE_TRACKER_FRONT_COMPONENT_ID,
  name: 'expense-tracker',
  description: 'Everyday, property and business expenses: where the money went, and quick add',
  component: ExpenseTracker,
});
