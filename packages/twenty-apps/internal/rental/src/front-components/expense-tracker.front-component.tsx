import { type CSSProperties, type ReactNode, type SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  AppPath,
  enqueueSnackbar,
  navigate,
  openSidePanelPage,
  SidePanelPages,
} from 'twenty-sdk/front-component';

import { EXPENSE_TRACKER_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { monthStart, nextMonthStart, todayIso } from 'src/logic-functions/utils/dates';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_GROUPS,
  expenseCategory,
  expenseGroup,
} from 'src/shared/expense-categories';

// ---------------------------------------------------------------- types

type Expense = {
  id: string;
  name: string;
  date: string | null;
  amount: number;
  category: string;
  paidTo: string;
  propertyId: string | null;
  propertyName: string;
  ownerId: string | null;
  ownerName: string;
  files: number;
  noBillNeeded: boolean;
};

type Option = { id: string; name: string; ownerId?: string | null };
type Mode = 'month' | 'year' | 'range';
type GroupBy = 'month' | 'property' | 'owner' | 'category';
type FilterKey = 'owner' | 'property' | 'category';

// ---------------------------------------------------------------- constants

const NONE = '__none';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'DUITNOW', label: 'DuitNow' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
];

// ---------------------------------------------------------------- helpers

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shiftMonth = (iso: string, delta: number) => {
  const [year, month] = iso.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
};

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const [, month, day] = iso.slice(0, 10).split('-').map(Number);

  return `${day} ${MONTHS[month - 1]}`;
};

const monthTitle = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

// remote-dom serialises events; the value may sit on detail or target.
const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const openExpense = (id: string) =>
  openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: id, objectNameSingular: 'expense' });

// ---------------------------------------------------------------- data

const loadExpenses = async (client: CoreApiClient, from: string, to: string): Promise<Expense[]> => {
  const rows: Expense[] = [];
  let after: string | undefined;

  for (;;) {
    const { expenses: page } = await client.query({
      expenses: {
        __args: {
          filter: { and: [{ expenseDate: { gte: from } }, { expenseDate: { lt: to } }] },
          orderBy: [{ expenseDate: 'DescNullsLast' }],
          first: 200,
          ...(after ? { after } : {}),
        },
        edges: {
          node: {
            id: true,
            name: true,
            expenseDate: true,
            amount: { amountMicros: true },
            category: true,
            paidTo: true,
            receipt: true,
            noBillNeeded: true,
            propertyId: true,
            ownerId: true,
            property: { name: true },
            owner: { name: true },
          },
        },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const { node } of page?.edges ?? []) {
      const files = (node.receipt as unknown as Array<{ isDeleted?: boolean }> | null) ?? [];

      rows.push({
        id: node.id,
        name: node.name ?? '',
        date: node.expenseDate ?? null,
        amount: (node.amount?.amountMicros ?? 0) / 1_000_000,
        category: (node.category as string | null) ?? 'OTHER',
        paidTo: node.paidTo ?? '',
        propertyId: node.propertyId ?? null,
        propertyName: node.property?.name ?? '',
        ownerId: node.ownerId ?? null,
        ownerName: node.owner?.name ?? '',
        files: files.filter((file) => !file?.isDeleted).length,
        noBillNeeded: Boolean(node.noBillNeeded),
      });
    }

    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return rows;
};

const loadOptions = async (client: CoreApiClient) => {
  const [{ owners }, { properties }] = await Promise.all([
    client.query({
      owners: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true } } },
    }),
    client.query({
      properties: {
        __args: { first: 500, orderBy: [{ name: 'AscNullsLast' }] },
        edges: { node: { id: true, name: true, ownerId: true } },
      },
    }),
  ]);

  return {
    owners: (owners?.edges ?? []).map(({ node }) => ({ id: node.id, name: node.name ?? 'Owner' })),
    properties: (properties?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? 'Property',
      ownerId: node.ownerId ?? null,
    })),
  };
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
  whiteSpace: 'nowrap',
  ...(primary ? { background: c.accent, color: '#fff', border: `1px solid ${c.accent}` } : {}),
});

const pill = (color: string): CSSProperties => ({
  background: color === 'gray' ? c.bg2 : `var(--t-color-${color}3)`,
  color: color === 'gray' ? c.text2 : `var(--t-color-${color}11)`,
  fontSize: 12,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
});

const card: CSSProperties = {
  border: `1px solid ${c.border}`,
  borderRadius: c.radius,
  background: c.bg,
  padding: 14,
  minWidth: 0,
};

const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 };

// ---------------------------------------------------------------- small parts

const MultiFilter = ({
  label,
  options,
  selected,
  open,
  onToggleOpen,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string; section?: string }>;
  selected: string[];
  open: boolean;
  onToggleOpen: () => void;
  onChange: (next: string[]) => void;
}) => (
  <div style={{ position: 'relative' }}>
    <button
      onClick={onToggleOpen}
      style={{
        ...button(),
        ...(selected.length > 0 ? { borderColor: c.accent, color: 'var(--t-color-blue11)' } : {}),
      }}
    >
      {label}
      {selected.length > 0 ? ` · ${selected.length}` : ''} ▾
    </button>
    {open && (
      <div
        style={{
          position: 'absolute',
          top: 34,
          left: 0,
          zIndex: 10,
          minWidth: 220,
          maxHeight: 300,
          overflow: 'auto',
          background: c.bg,
          border: `1px solid ${c.border2}`,
          borderRadius: c.radius,
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {options.map((option, index) => {
          const checked = selected.includes(option.value);
          const sectionValues = options.filter((o) => o.section && o.section === option.section).map((o) => o.value);
          const sectionAll = sectionValues.every((v) => selected.includes(v));
          const header =
            option.section && option.section !== options[index - 1]?.section ? (
              <button
                key={`section-${option.section}`}
                onClick={() =>
                  onChange(
                    sectionAll
                      ? selected.filter((v) => !sectionValues.includes(v))
                      : [...new Set([...selected, ...sectionValues])],
                  )
                }
                style={{
                  ...control,
                  border: 'none',
                  height: 26,
                  marginTop: index === 0 ? 0 : 6,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  color: c.text3,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {option.section}
              </button>
            ) : null;

          return [
            header,
            <button
              key={option.value}
              onClick={() => onChange(checked ? selected.filter((v) => v !== option.value) : [...selected, option.value])}
              style={{
                ...control,
                border: 'none',
                height: 28,
                textAlign: 'left',
                cursor: 'pointer',
                background: checked ? 'var(--t-color-blue3)' : c.bg,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span style={{ width: 14, color: 'var(--t-color-blue11)', fontWeight: 700 }}>{checked ? '✓' : ''}</span>
              {option.label}
            </button>,
          ];
        })}
        <div style={{ display: 'flex', gap: 4, borderTop: `1px solid ${c.border}`, paddingTop: 4, marginTop: 2 }}>
          <button onClick={() => onChange([])} disabled={selected.length === 0} style={{ ...control, border: 'none', height: 28, cursor: 'pointer', color: c.text3, flex: 1 }}>
            Clear
          </button>
          <button onClick={onToggleOpen} style={{ ...button(true), height: 28, flex: 1 }}>
            Done
          </button>
        </div>
      </div>
    )}
  </div>
);

const Bars = ({ title, rows }: { title: string; rows: Array<{ label: string; value: number; color?: string }> }) => {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</span>
      {rows.length === 0 && <span style={{ fontSize: 13, color: c.text3 }}>Nothing yet.</span>}
      {rows.slice(0, 6).map((row) => (
        <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
            <span style={{ color: c.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{rm(row.value)}</span>
          </div>
          <div style={{ height: 6, background: c.bg2, borderRadius: 3 }}>
            <div
              style={{
                width: `${(row.value / max) * 100}%`,
                height: 6,
                borderRadius: 3,
                background: `var(--t-color-${row.color && row.color !== 'gray' ? row.color : 'blue'}9)`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) => (
  <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
    <span style={{ fontSize: 20, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    {hint && <span style={{ fontSize: 12, color: c.text3 }}>{hint}</span>}
  </div>
);

// ---------------------------------------------------------------- page

const ExpenseTracker = () => {
  const today = todayIso();
  const [mode, setMode] = useState<Mode>('year');
  const [anchor, setAnchor] = useState(monthStart(today));
  const [rangeFrom, setRangeFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [rangeTo, setRangeTo] = useState(monthStart(today));
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>({ owner: [], property: [], category: [] });
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [missingOnly, setMissingOnly] = useState(false);
  const scope = useOwnerScope();
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [owners, setOwners] = useState<Option[]>([]);
  const [properties, setProperties] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [from, to] = useMemo(() => {
    if (mode === 'month') return [monthStart(anchor), nextMonthStart(anchor)];
    if (mode === 'year') return [`${anchor.slice(0, 4)}-01-01`, `${Number(anchor.slice(0, 4)) + 1}-01-01`];

    return [monthStart(rangeFrom), nextMonthStart(rangeTo)];
  }, [mode, anchor, rangeFrom, rangeTo]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const client = new CoreApiClient();
      const [rows, options] = await Promise.all([loadExpenses(client, from, to), loadOptions(client)]);

      setExpenses(rows);
      setOwners(options.owners);
      setProperties(options.properties);
    } catch (error) {
      await enqueueSnackbar({
        message: error instanceof Error ? error.message : 'Could not load expenses.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = (selected: string[], value: string | null) =>
      selected.length === 0 || selected.includes(value ?? NONE);

    return expenses.filter(
      (e) =>
        scope.matches(e.ownerId) &&
        matches(filters.owner, e.ownerId) &&
        matches(filters.property, e.propertyId) &&
        matches(filters.category, e.category) &&
        (!missingOnly || (e.files === 0 && !e.noBillNeeded)) &&
        (!term || [e.name, e.paidTo, e.propertyName, e.ownerName, expenseCategory(e.category).label].some((text) => text.toLowerCase().includes(term))),
    );
  }, [expenses, filters, search, missingOnly, scope.ownerId]);

  const stats = useMemo(() => {
    const total = visible.reduce((s, e) => s + e.amount, 0);
    const sumBy = (key: (e: Expense) => string, color?: (k: string) => string) => {
      const map = new Map<string, number>();

      for (const e of visible) map.set(key(e), (map.get(key(e)) ?? 0) + e.amount);

      return [...map.entries()]
        .map(([label, value]) => ({ label, value, color: color?.(label) }))
        .sort((a, b) => b.value - a.value);
    };
    const byGroup = sumBy(
      (e) => expenseGroup(e.category).label,
      (label) => EXPENSE_GROUPS.find((x) => x.label === label)?.color ?? 'blue',
    );

    return {
      total,
      withFiles: visible.filter((e) => e.files > 0 || e.noBillNeeded).length,
      missing: expenses.filter((e) => scope.matches(e.ownerId) && e.files === 0 && !e.noBillNeeded).length,
      byGroup,
      byOwner: sumBy((e) => e.ownerName || 'No owner'),
      byProperty: sumBy((e) => e.propertyName || 'No property'),
    };
  }, [visible]);

  const groups = useMemo(() => {
    const keyOf = (e: Expense) =>
      groupBy === 'month'
        ? (e.date ?? '').slice(0, 7)
        : groupBy === 'property'
        ? e.propertyName || 'No property'
        : groupBy === 'owner'
        ? e.ownerName || 'No owner'
        : expenseGroup(e.category).label;
    const map = new Map<string, Expense[]>();

    for (const e of visible) map.set(keyOf(e), [...(map.get(keyOf(e)) ?? []), e]);

    const entries = [...map.entries()].map(([key, rows]) => ({
      key,
      title: groupBy === 'month' ? (key ? monthTitle(`${key}-01`) : 'No date') : key,
      rows,
      total: rows.reduce((s, e) => s + e.amount, 0),
    }));

    return groupBy === 'month'
      ? entries.sort((a, b) => b.key.localeCompare(a.key))
      : entries.sort((a, b) => b.total - a.total);
  }, [visible, groupBy]);

  const filterOptions: Record<FilterKey, Array<{ value: string; label: string }>> = {
    owner: [...owners.map((o) => ({ value: o.id, label: o.name })), { value: NONE, label: 'No owner' }],
    property: [...properties.map((p) => ({ value: p.id, label: p.name })), { value: NONE, label: 'No property' }],
    category: EXPENSE_CATEGORIES.map((x) => ({ value: x.value, label: x.label, section: expenseGroup(x.value).label })),
  };
  const anyFilter = filters.owner.length + filters.property.length + filters.category.length > 0;
  const periodLabel = mode === 'month' ? monthTitle(anchor) : mode === 'year' ? anchor.slice(0, 4) : '';
  const step = (delta: number) => setAnchor(shiftMonth(anchor, mode === 'year' ? delta * 12 : delta));

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', display: 'flex', boxSizing: 'border-box' }}>
      <div
        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: 16, gap: 14, overflow: 'auto' }}
      >
        {/* period + actions */}
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
              <button onClick={() => step(-1)} style={{ ...button(), width: 30, padding: 0 }}>‹</button>
              <span style={{ minWidth: 88, textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{periodLabel}</span>
              <button onClick={() => step(1)} style={{ ...button(), width: 30, padding: 0 }}>›</button>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => navigate(AppPath.RecordIndexPage, { objectNamePlural: 'expenses' })} style={{ ...button(), color: c.text2 }}>
            Table view
          </button>
          <button onClick={() => setAdding(true)} style={button(true)}>+ Add expense</button>
        </div>

        {/* filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input placeholder="Search description, paid to…" value={search} onChange={(e) => setSearch(readValue(e))} style={{ ...control, width: 220 }} />
          {(['owner', 'property', 'category'] as FilterKey[]).map((key) => (
            <MultiFilter
              key={key}
              label={key === 'owner' ? 'Owner' : key === 'property' ? 'Property' : 'Category'}
              options={filterOptions[key]}
              selected={filters[key]}
              open={openFilter === key}
              onToggleOpen={() => setOpenFilter(openFilter === key ? null : key)}
              onChange={(next) => setFilters({ ...filters, [key]: next })}
            />
          ))}
          <button
            onClick={() => setMissingOnly(!missingOnly)}
            style={{
              ...button(),
              ...(missingOnly
                ? { background: 'var(--t-color-amber3)', color: 'var(--t-color-amber11)', borderColor: 'var(--t-color-amber9)' }
                : {}),
            }}
          >
            Missing bill{stats.missing ? ` · ${stats.missing}` : ''}
          </button>
          {anyFilter && (
            <button onClick={() => setFilters({ owner: [], property: [], category: [] })} style={{ ...button(), border: 'none', color: c.text3 }}>
              Clear filters
            </button>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <Kpi label="Total spent" value={rm(stats.total)} hint={`${visible.length} expense${visible.length === 1 ? '' : 's'}`} />
          <Kpi label="Biggest cost" value={stats.byGroup[0]?.label ?? '—'} hint={stats.byGroup[0] ? rm(stats.byGroup[0].value) : undefined} />
          <Kpi
            label="Bills attached"
            value={`${stats.withFiles} / ${visible.length}`}
            hint={visible.length - stats.withFiles > 0 ? `${visible.length - stats.withFiles} missing — click "Missing bill" to see them` : 'Nothing missing'}
          />
        </div>

        {/* breakdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <Bars title="By type" rows={stats.byGroup} />
          <Bars title="By owner" rows={stats.byOwner} />
          <Bars title="By property" rows={stats.byProperty} />
        </div>

        {/* list */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: c.text3 }}>Group by</span>
          <div style={{ display: 'flex', border: `1px solid ${c.border2}`, borderRadius: c.radius, overflow: 'hidden' }}>
            {(['month', 'property', 'owner', 'category'] as GroupBy[]).map((option) => (
              <button
                key={option}
                onClick={() => setGroupBy(option)}
                style={{
                  ...control,
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  background: groupBy === option ? c.bg2 : c.bg,
                  fontWeight: groupBy === option ? 600 : 400,
                }}
              >
                {option === 'category' ? 'Type' : option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading && <div style={{ fontSize: 13, color: c.text3 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ ...card, fontSize: 13, color: c.text3 }}>
            No expenses {anyFilter || search ? 'match these filters' : 'in this period'}.
          </div>
        )}

        {!loading &&
          groups.map((group) => (
            <div key={group.key} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: c.bg2,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>
                  {group.title}
                  <span style={{ fontWeight: 400, color: c.text3, marginLeft: 8 }}>{group.rows.length}</span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{rm(group.total)}</span>
              </div>
              {group.rows.map((e) => (
                <div
                  key={e.id}
                  onClick={() => openExpense(e.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px minmax(120px, 2fr) minmax(90px, 1.3fr) minmax(90px, 1.2fr) 52px 100px',
                    gap: 10,
                    alignItems: 'center',
                    padding: '9px 14px',
                    borderTop: `1px solid ${c.border}`,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: c.text3 }}>{formatDate(e.date)}</span>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name || 'Expense'}</span>
                    {e.paidTo && <span style={{ fontSize: 12, color: c.text3 }}>{e.paidTo}</span>}
                  </span>
                  <span style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ ...pill(expenseGroup(e.category).color), display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' }}>{expenseCategory(e.category).label}</span>
                  </span>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', fontSize: 12 }}>
                    <span style={{ color: c.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.propertyName || '—'}</span>
                    <span style={{ color: c.text3 }}>{e.ownerName}</span>
                  </span>
                  <span
                    title={e.files ? `${e.files} file(s)` : e.noBillNeeded ? 'Marked as no bill available' : 'No bill attached'}
                    style={{ color: e.files || e.noBillNeeded ? c.text3 : 'var(--t-color-amber11)', fontSize: 12 }}
                  >
                    {e.files ? `📎 ${e.files}` : e.noBillNeeded ? '—' : 'No bill'}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{rm(e.amount)}</span>
                </div>
              ))}
            </div>
          ))}
      </div>

      {adding && (
        <AddExpensePanel
          owners={owners}
          properties={properties}
          onClose={() => setAdding(false)}
          onSaved={async (id) => {
            setAdding(false);
            await reload();
            await openExpense(id);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------- add panel

const AddExpensePanel = ({
  owners,
  properties,
  onClose,
  onSaved,
}: {
  owners: Option[];
  properties: Option[];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) => {
  const [date, setDate] = useState(todayIso());
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('REPAIRS');
  const [propertyId, setPropertyId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const pickProperty = (id: string) => {
    setPropertyId(id);
    const owner = properties.find((p) => p.id === id)?.ownerId;

    if (owner) setOwnerId(owner);
  };

  const save = async () => {
    const value = Number(amount.replace(/,/g, ''));

    if (!name.trim() || !Number.isFinite(value) || value <= 0) {
      await enqueueSnackbar({ message: 'Add a description and an amount.', variant: 'error' });

      return;
    }
    setBusy(true);
    try {
      const { createExpense } = await new CoreApiClient().mutation({
        createExpense: {
          __args: {
            data: {
              name: name.trim(),
              expenseDate: date,
              amount: { amountMicros: Math.round(value * 1_000_000), currencyCode: 'MYR' },
              category,
              method,
              paidTo: paidTo.trim(),
              notes: notes.trim(),
              propertyId: propertyId || null,
              ownerId: ownerId || null,
            },
          },
          id: true,
        },
      });

      await enqueueSnackbar({ message: 'Expense added. Attach the bill in the panel.', variant: 'success' });
      if (createExpense?.id) await onSaved(createExpense.id);
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        width: 340,
        flexShrink: 0,
        borderLeft: `1px solid ${c.border}`,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>New expense</span>
        <button onClick={onClose} style={{ ...button(), border: 'none' }}>✕</button>
      </div>
      <label style={field}>
        Description
        <input value={name} onChange={(e) => setName(readValue(e))} placeholder="e.g. Aircon service" style={control} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={field}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(readValue(e) || date)} style={control} />
        </label>
        <label style={field}>
          Amount (RM)
          <input value={amount} onChange={(e) => setAmount(readValue(e))} placeholder="0.00" style={control} />
        </label>
      </div>
      <label style={field}>
        Category
        <select value={category} onChange={(e) => setCategory(readValue(e))} style={control}>
          {EXPENSE_CATEGORIES.map((x) => <option key={x.value} value={x.value}>{`${expenseGroup(x.value).label} · ${x.label}`}</option>)}
        </select>
      </label>
      <label style={field}>
        Property
        <select value={propertyId} onChange={(e) => pickProperty(readValue(e))} style={control}>
          <option value="">— None —</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label style={field}>
        Owner
        <select value={ownerId} onChange={(e) => setOwnerId(readValue(e))} style={control}>
          <option value="">— None —</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={field}>
          Paid to
          <input value={paidTo} onChange={(e) => setPaidTo(readValue(e))} placeholder="Contractor, council…" style={control} />
        </label>
        <label style={field}>
          Paid by
          <select value={method} onChange={(e) => setMethod(readValue(e))} style={control}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <label style={field}>
        Notes
        <input value={notes} onChange={(e) => setNotes(readValue(e))} style={control} />
      </label>
      <button onClick={save} disabled={busy} style={{ ...button(true), height: 34 }}>
        {busy ? 'Saving…' : 'Save expense'}
      </button>
      <span style={{ fontSize: 12, color: c.text3 }}>
        After saving, the expense opens on the right so you can attach the bill or receipt (photo or PDF).
      </span>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: EXPENSE_TRACKER_FRONT_COMPONENT_ID,
  name: 'expense-tracker',
  description: 'Expenses by period with multi-select filters, breakdowns and quick add',
  component: ExpenseTracker,
});
