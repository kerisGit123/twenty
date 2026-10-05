import { type CSSProperties, type ReactNode, type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { copyToClipboard, enqueueSnackbar } from 'twenty-sdk/front-component';

import { YEAR_SUMMARY_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import type { YearData } from 'src/logic-functions/page-data/year-data';
import { buildTaxPack } from 'src/shared/lhdn';
import { summariseYear, yearSummaryCsv } from 'src/shared/year-summary';

// Year summary: one year of a workspace's rent and expenses — totals against
// last year, month by month, where the money went, and how each property did.
// Copy it as CSV for a spreadsheet, or open the printable report (Save as PDF).

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
  green: 'var(--t-color-green11)',
  greenBar: 'var(--t-color-green9)',
  red: 'var(--t-color-red11)',
  redBar: 'var(--t-color-red8)',
};

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
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

const card: CSSProperties = {
  background: c.bg,
  border: `1px solid ${c.border}`,
  borderRadius: c.radius,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const title: CSSProperties = { fontSize: 14, fontWeight: 600, margin: 0 };

// "+12% vs 2025", coloured by whether the change is good.
const Change = ({ now, before, year, higherIsGood }: { now: number; before: number; year: number; higherIsGood: boolean }) => {
  if (before === 0) {
    return <span style={{ fontSize: 12, color: c.text3 }}>{now === 0 ? '—' : `nothing in ${year - 1}`}</span>;
  }

  const change = ((now - before) / Math.abs(before)) * 100;
  const good = change === 0 ? null : change > 0 === higherIsGood;

  return (
    <span style={{ fontSize: 12, color: good === null ? c.text3 : good ? c.green : c.red }}>
      {change > 0 ? '▲' : change < 0 ? '▼' : ''} {Math.abs(change).toFixed(0)}% vs {year - 1}
    </span>
  );
};

const YearSummary = () => {
  const scope = useOwnerScope();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<YearData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    setData(null);
    setError('');
    new RestApiClient()
      .post<{ success: boolean; data?: YearData; message?: string }>('/s/pages/data', { page: 'year', year })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) setError(result.message ?? 'Could not load the year.');
        else setData(result.data);
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : String(reason)));

    return () => {
      cancelled = true;
    };
  }, [year]);

  const summary = useMemo(() => (data ? summariseYear(data, scope.ownerId) : null), [data, scope.key]);
  const tax = useMemo(() => (data ? buildTaxPack(data, scope.ownerId) : null), [data, scope.key]);
  const workspaceName = scope.owner?.name ?? (scope.restricted ? 'All my workspaces' : 'All workspaces');

  const copyCsv = async () => {
    if (!summary) return;
    await copyToClipboard(yearSummaryCsv(summary, workspaceName));
    await enqueueSnackbar({ message: 'Copied — paste it into Excel or Google Sheets.', variant: 'success' });
  };

  const reportUrl = new RestApiClient().resolveUrl('/s/reports/year', {
    query: { year, ...(scope.ownerId ? { owner: scope.ownerId } : {}) },
  });
  const taxUrl = new RestApiClient().resolveUrl('/s/reports/tax', {
    query: { year, ...(scope.ownerId ? { owner: scope.ownerId } : {}) },
  });

  const years = Array.from({ length: 6 }, (_, index) => thisYear - index);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>Year summary</span>
        <span style={{ fontSize: 13, color: c.text3 }}>Rent received and money spent, by month, category and property.</span>
      </div>
      <OwnerSwitcher scope={scope} />
      <select value={String(year)} onChange={(e) => setYear(Number(readValue(e)))} style={{ ...control, fontWeight: 600 }}>
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
      <button style={control} onClick={copyCsv} disabled={!summary}>
        Copy CSV
      </button>
      <a
        href={reportUrl}
        target="_blank"
        rel="noreferrer"
        style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', color: c.text }}
      >
        Printable / PDF
      </a>
    </div>
  );

  const wrap = (body: ReactNode) => (
    <div style={{ fontFamily: c.font, color: c.text, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {header}
      {body}
    </div>
  );

  if (error) return wrap(<div style={{ color: c.red, fontSize: 13 }}>{error}</div>);
  if (!summary) return wrap(<div style={{ color: c.text3, fontSize: 13 }}>Loading {year}…</div>);

  const { current, previous } = summary;
  const peak = Math.max(1, ...summary.months.flatMap((m) => [m.rent, m.expenses]));
  const biggestGroup = Math.max(1, ...summary.groups.map((g) => g.amount));
  const margin = current.rent > 0 ? (current.net / current.rent) * 100 : null;
  const isEmpty = current.rent === 0 && current.expenses === 0;

  const kpi = (label: string, value: string, extra: ReactNode, color = c.text) => (
    <div style={card}>
      <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 600, color }}>{value}</span>
      {extra}
    </div>
  );

  const cell: CSSProperties = { padding: '8px 12px', borderTop: `1px solid ${c.border}`, fontSize: 13, whiteSpace: 'nowrap' };
  const head: CSSProperties = { ...cell, borderTop: 'none', background: c.bg2, color: c.text3, fontSize: 12, fontWeight: 600, textAlign: 'left' };
  const num: CSSProperties = { ...cell, textAlign: 'right' };

  return wrap(
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        {kpi('Rent received', rm(current.rent), <Change now={current.rent} before={previous.rent} year={year} higherIsGood />)}
        {kpi('Expenses', rm(current.expenses), <Change now={current.expenses} before={previous.expenses} year={year} higherIsGood={false} />)}
        {kpi(
          'Net',
          rm(current.net),
          <span style={{ fontSize: 12, color: c.text3 }}>{margin === null ? '—' : `${margin.toFixed(0)}% of rent kept`}</span>,
          current.net < 0 ? c.red : c.green,
        )}
        {kpi(
          'Properties',
          String(summary.propertyCount),
          <span style={{ fontSize: 12, color: c.text3 }}>
            {summary.occupied} let · {summary.propertyCount - summary.occupied} vacant now
          </span>,
        )}
        {kpi(
          'Bills on file',
          `${summary.expenseCount - summary.missingBills} / ${summary.expenseCount}`,
          <span style={{ fontSize: 12, color: summary.missingBills ? c.red : c.text3 }}>
            {summary.missingBills ? `${summary.missingBills} missing a bill` : 'All bills attached'}
          </span>,
        )}
        {summary.deposits > 0 &&
          kpi('Deposits received', rm(summary.deposits), <span style={{ fontSize: 12, color: c.text3 }}>Held for tenants — not income</span>)}
      </div>

      {isEmpty ? (
        <div style={{ ...card, color: c.text3, fontSize: 13 }}>
          Nothing recorded for {workspaceName} in {year}. Pick another year or workspace.
        </div>
      ) : (
        <>
          <div style={{ ...card, gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h3 style={{ ...title, flex: 1 }}>Month by month</h3>
              <span style={{ fontSize: 12, color: c.text3, display: 'flex', gap: 12 }}>
                <span>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: c.greenBar, marginRight: 4 }} />
                  Rent
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: c.redBar, marginRight: 4 }} />
                  Expenses
                </span>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, alignItems: 'end', height: 150 }}>
              {summary.months.map((m) => (
                <div key={m.month} style={{ display: 'flex', gap: 2, alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                  <div
                    title={`Rent ${rm(m.rent)}`}
                    style={{ width: '40%', maxWidth: 14, height: `${(m.rent / peak) * 100}%`, minHeight: m.rent ? 2 : 0, background: c.greenBar, borderRadius: '3px 3px 0 0' }}
                  />
                  <div
                    title={`Expenses ${rm(m.expenses)}`}
                    style={{ width: '40%', maxWidth: 14, height: `${(m.expenses / peak) * 100}%`, minHeight: m.expenses ? 2 : 0, background: c.redBar, borderRadius: '3px 3px 0 0' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, fontSize: 11, color: c.text3, textAlign: 'center' }}>
              {summary.months.map((m) => (
                <div key={m.month} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>{m.month}</span>
                  <span style={{ color: m.net < 0 ? c.red : m.net > 0 ? c.text2 : c.text3 }}>
                    {m.net === 0 ? '·' : `${m.net < 0 ? '−' : ''}${Math.abs(Math.round(m.net)).toLocaleString('en-MY')}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, alignItems: 'start' }}>
            <div style={{ ...card, gap: 10 }}>
              <h3 style={title}>Where the money went</h3>
              {summary.groups.length === 0 && <span style={{ fontSize: 13, color: c.text3 }}>No expenses this year.</span>}
              {summary.groups.map((group) => (
                <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', fontSize: 13 }}>
                    <span style={{ flex: 1, fontWeight: 500 }}>{group.label}</span>
                    <span>{rm(group.amount)}</span>
                    <span style={{ width: 44, textAlign: 'right', color: c.text3 }}>
                      {current.expenses ? `${Math.round((group.amount / current.expenses) * 100)}%` : ''}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: c.bg2 }}>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        width: `${(group.amount / biggestGroup) * 100}%`,
                        background: group.color === 'gray' ? c.border2 : `var(--t-color-${group.color}9)`,
                      }}
                    />
                  </div>
                  {group.categories.length > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 10 }}>
                      {group.categories.map((category) => (
                        <div key={category.value} style={{ display: 'flex', fontSize: 12, color: c.text2 }}>
                          <span style={{ flex: 1 }}>{category.label}</span>
                          <span style={{ paddingRight: 44 }}>{rm(category.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <h3 style={{ ...title, padding: '14px 14px 10px' }}>By property</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: c.font }}>
                  <thead>
                    <tr>
                      <th style={head}>Property</th>
                      <th style={{ ...head, textAlign: 'right' }}>Rent</th>
                      <th style={{ ...head, textAlign: 'right' }}>Expenses</th>
                      <th style={{ ...head, textAlign: 'right' }}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.properties.map((property) => (
                      <tr key={property.id || 'none'}>
                        <td style={{ ...cell, color: property.id ? c.text : c.text3, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {property.name}
                        </td>
                        <td style={num}>{rm(property.rent)}</td>
                        <td style={num}>{rm(property.expenses)}</td>
                        <td style={{ ...num, fontWeight: 600, color: property.net < 0 ? c.red : c.green }}>{rm(property.net)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...cell, fontWeight: 600 }}>Total</td>
                      <td style={{ ...num, fontWeight: 600 }}>{rm(current.rent)}</td>
                      <td style={{ ...num, fontWeight: 600 }}>{rm(current.expenses)}</td>
                      <td style={{ ...num, fontWeight: 700, color: current.net < 0 ? c.red : c.green }}>{rm(current.net)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* For the tax return: rent less what LHDN allows (Public Ruling 12/2018) */}
          {tax && (tax.income > 0 || tax.deductible > 0) && (
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ ...title, flex: 1 }}>For your tax return (LHDN)</h3>
                <a href={taxUrl} target="_blank" rel="noreferrer" style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', color: c.text }}>
                  Tax working sheet / PDF
                </a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 10 }}>
                {[
                  ['Rent received', rm(tax.income), c.text],
                  ['Allowable expenses', rm(tax.deductible), c.text],
                  ['Net rental income · 4(d)', rm(tax.taxable), c.green],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color }}>{value}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 12.5, color: c.text3, lineHeight: 1.5 }}>
                Counts assessment, quit rent, loan interest, fire insurance, repairs, service charge, rent collection and renewal fees.
                {tax.capital > 0 ? ` Renovation & furniture (${rm(tax.capital)}) isn’t deductible.` : ''}
                {tax.noBill.length > 0 ? ` ${tax.noBill.length} claim${tax.noBill.length === 1 ? ' has' : 's have'} no bill.` : ''}
                {tax.unlinked.length > 0 ? ` ${tax.unlinked.length} property cost${tax.unlinked.length === 1 ? ' isn’t' : 's aren’t'} linked to a property.` : ''}
              </span>
            </div>
          )}
        </>
      )}
    </>,
  );
};

export default defineFrontComponent({
  universalIdentifier: YEAR_SUMMARY_FRONT_COMPONENT_ID,
  name: 'year-summary',
  description: "A year's rent and expenses by month, category and property, with CSV and printable report",
  component: YearSummary,
});
