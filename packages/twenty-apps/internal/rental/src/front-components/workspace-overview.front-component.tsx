import { type CSSProperties, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useRecordId } from 'twenty-sdk/front-component';

import { WORKSPACE_OVERVIEW_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { openPage } from 'src/front-components/shared/open-page';
import { rememberOwnerScope } from 'src/front-components/shared/owner-switcher';
import { todayIso } from 'src/logic-functions/utils/dates';

// Overview tab of a workspace (Personal, Family, Company A...): this year's
// money, its properties and people, and shortcuts into the rental pages
// already switched to this workspace.

type Summary = {
  name: string;
  type: string;
  properties: number;
  occupied: number;
  rent: number;
  deposits: number;
  expenses: number;
  missingBills: number;
  documents: number;
  members: number;
};

const money = (value: { amountMicros?: number | null } | null | undefined) => (value?.amountMicros ?? 0) / 1_000_000;
const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const loadSummary = async (ownerId: string, year: string): Promise<Summary> => {
  const client = new CoreApiClient();
  const mine = { ownerId: { eq: ownerId } };
  const [{ owners }, { properties }, { rentPayments }, { expenses }, { documents }, { memberships }] = await Promise.all([
    client.query({
      owners: { __args: { filter: { id: { eq: ownerId } }, first: 1 }, edges: { node: { name: true, ownerType: true } } },
    }),
    client.query({ properties: { __args: { filter: mine, first: 500 }, edges: { node: { status: true } } } }),
    client.query({
      rentPayments: {
        __args: {
          filter: {
            ...mine,
            status: { in: ['ISSUED', 'SENT'] },
            and: [{ paidOn: { gte: `${year}-01-01` } }, { paidOn: { lt: `${Number(year) + 1}-01-01` } }],
          },
          first: 1000,
        },
        edges: { node: { paymentType: true, amount: { amountMicros: true } } },
      },
    }),
    client.query({
      expenses: {
        __args: {
          filter: { ...mine, and: [{ expenseDate: { gte: `${year}-01-01` } }, { expenseDate: { lt: `${Number(year) + 1}-01-01` } }] },
          first: 1000,
        },
        edges: { node: { amount: { amountMicros: true }, receipt: { fileId: true }, noBillNeeded: true } },
      },
    }),
    client.query({ documents: { __args: { filter: mine, first: 500 }, edges: { node: { id: true } } } }),
    client.query({ memberships: { __args: { filter: { ...mine, memberId: { is: 'NOT_NULL' } }, first: 200 }, edges: { node: { id: true } } } }),
  ]);
  const owner = owners?.edges?.[0]?.node;
  const payments = (rentPayments?.edges ?? []).map(({ node }) => node);
  const spent = (expenses?.edges ?? []).map(({ node }) => node);

  return {
    name: owner?.name ?? 'Workspace',
    type: (owner?.ownerType as string | null) ?? '',
    properties: properties?.edges?.length ?? 0,
    occupied: (properties?.edges ?? []).filter(({ node }) => node.status === 'OCCUPIED').length,
    rent: payments.filter((p) => p.paymentType === 'RENT').reduce((s, p) => s + money(p.amount), 0),
    deposits: payments.filter((p) => p.paymentType !== 'RENT').reduce((s, p) => s + money(p.amount), 0),
    expenses: spent.reduce((s, e) => s + money(e.amount), 0),
    missingBills: spent.filter((e) => !(e.receipt as unknown as unknown[] | null)?.length && !e.noBillNeeded).length,
    documents: documents?.edges?.length ?? 0,
    members: memberships?.edges?.length ?? 0,
  };
};

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
};

const card: CSSProperties = {
  border: `1px solid ${c.border}`,
  borderRadius: c.radius,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const Kpi = ({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) => (
  <div style={card}>
    <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
    <span style={{ fontSize: 20, fontWeight: 600, color: color ?? c.text }}>{value}</span>
    {hint && <span style={{ fontSize: 12, color: c.text3 }}>{hint}</span>}
  </div>
);

const shortcut: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  fontWeight: 500,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 32,
  padding: '0 12px',
  cursor: 'pointer',
};

const WorkspaceOverview = () => {
  const ownerId = useRecordId();
  const year = todayIso().slice(0, 4);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  // Opening a workspace selects it: Today, Rent Ledger and Expenses follow.
  useEffect(() => {
    if (ownerId) rememberOwnerScope(ownerId);
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    loadSummary(ownerId, year)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [ownerId, year]);

  if (error) return <div style={{ padding: 16, fontFamily: c.font, color: 'var(--t-color-red11)', fontSize: 13 }}>{error}</div>;
  if (!summary || !ownerId) return <div style={{ padding: 16, fontFamily: c.font, color: c.text3, fontSize: 13 }}>Loading…</div>;

  const net = summary.rent - summary.expenses;
  // Open a rental page already switched to this workspace.
  const go = (page: 'Today' | 'Rent Ledger' | 'Expenses') => {
    rememberOwnerScope(ownerId);
    openPage(page);
  };

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={shortcut} onClick={() => go('Today')}>Today</button>
        <button style={shortcut} onClick={() => go('Rent Ledger')}>Rent Ledger</button>
        <button style={shortcut} onClick={() => go('Expenses')}>Expenses</button>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {summary.name} · {year}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Kpi label="Rent received" value={rm(summary.rent)} hint={summary.deposits ? `+ ${rm(summary.deposits)} deposits` : undefined} />
        <Kpi label="Expenses" value={rm(summary.expenses)} hint={summary.missingBills ? `${summary.missingBills} missing a bill` : undefined} />
        <Kpi label="Net" value={rm(net)} color={net < 0 ? 'var(--t-color-red11)' : 'var(--t-color-green11)'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Kpi label="Properties" value={String(summary.properties)} hint={`${summary.occupied} occupied · ${summary.properties - summary.occupied} vacant`} />
        <Kpi label="Documents" value={String(summary.documents)} />
        <Kpi label="Members" value={String(summary.members)} hint="see the Members tab" />
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: WORKSPACE_OVERVIEW_FRONT_COMPONENT_ID,
  name: 'workspace-overview',
  description: "A workspace's year at a glance, with shortcuts into the rental pages",
  component: WorkspaceOverview,
});
