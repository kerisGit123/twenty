import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, navigate, useRecordId } from 'twenty-sdk/front-component';

import { MONTHS } from 'src/shared/months';
import { PROPERTY_OVERVIEW_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { dueDateInMonth, monthStart, todayIso } from 'src/logic-functions/utils/dates';

// ---------------------------------------------------------------- types

type Money = { amountMicros?: number | null } | null | undefined;

type Contract = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  dueDay: number;
  rent: number;
  deposit: number;
  utilityDeposit: number;
  depositStatus: string | null;
  depositRefunded: number;
  tenantName: string;
  tenantPhone: string;
};

type Payment = { status: string; type: string; amount: number; paidOn: string | null; month: string | null };
type Expense = { id: string; name: string; date: string | null; amount: number; category: string | null };
type Doc = { id: string; name: string; type: string | null; expiresOn: string | null };

type Data = {
  name: string;
  address: string;
  propertyType: string | null;
  status: string | null;
  ownerName: string;
  contracts: Contract[];
  payments: Payment[];
  expenses: Expense[];
  documents: Doc[];
};

// ---------------------------------------------------------------- helpers

const TYPE_LABEL: Record<string, string> = { CONDO: 'Condo / Apartment', LANDED: 'Landed house', SHOP: 'Shop / Office', ROOM: 'Room' };
const DEPOSIT_LABEL: Record<string, string> = {
  NOT_RECEIVED: 'Not received',
  HELD: 'Held',
  PARTLY_REFUNDED: 'Partly refunded',
  REFUNDED: 'Refunded',
  FORFEITED: 'Forfeited',
};
const CATEGORY_LABEL: Record<string, string> = {
  REPAIRS: 'Repairs',
  ASSESSMENT_TAX: 'Assessment tax',
  QUIT_RENT: 'Quit rent',
  MANAGEMENT_FEE: 'Maintenance fee',
  WATER: 'Water',
  ELECTRICITY: 'Electricity',
  SEWERAGE: 'Sewerage',
  INSURANCE: 'Insurance',
  LOAN_INTEREST: 'Loan interest',
  AGENT_FEE: 'Agent fee',
  LEGAL_STAMP_DUTY: 'Legal / stamp duty',
  FURNISHING: 'Furnishing',
  OTHER: 'Other',
};
const EXPIRY_WARNING_DAYS = 60;

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const money = (value: Money) => (value?.amountMicros ?? 0) / 1_000_000;
const isPaid = (status: string) => status === 'ISSUED' || status === 'SENT';

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);

  return `${day} ${MONTHS[month - 1]} ${year}`;
};

const phoneText = (phones: { primaryPhoneNumber?: string | null; primaryPhoneCallingCode?: string | null } | null | undefined) =>
  phones?.primaryPhoneNumber ? `${phones.primaryPhoneCallingCode ?? ''} ${phones.primaryPhoneNumber}`.trim() : '';

const personName = (name: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  [name?.firstName, name?.lastName].filter(Boolean).join(' ');

const open = (objectNameSingular: string, objectRecordId: string) =>
  navigate(AppPath.RecordShowPage, { objectNameSingular, objectRecordId });

// ---------------------------------------------------------------- data

const loadData = async (propertyId: string): Promise<Data> => {
  const client = new CoreApiClient();
  const byProperty = { propertyId: { eq: propertyId } };

  const [{ properties }, { rentals }, { rentPayments }, { expenses }, { documents }] = await Promise.all([
    client.query({
      properties: {
        __args: { filter: { id: { eq: propertyId } }, first: 1 },
        edges: {
          node: {
            name: true,
            propertyType: true,
            status: true,
            propertyAddress: { addressStreet1: true, addressStreet2: true, addressCity: true, addressPostcode: true },
            owner: { name: true },
          },
        },
      },
    }),
    client.query({
      rentals: {
        __args: { filter: byProperty, first: 50, orderBy: [{ startDate: 'DescNullsLast' }] },
        edges: {
          node: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            dueDay: true,
            monthlyRent: { amountMicros: true },
            depositAmount: { amountMicros: true },
            utilityDeposit: { amountMicros: true },
            depositStatus: true,
            depositRefunded: { amountMicros: true },
            tenant: {
              name: { firstName: true, lastName: true },
              phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
            },
          },
        },
      },
    }),
    client.query({
      rentPayments: {
        __args: { filter: byProperty, first: 500 },
        edges: {
          node: {
            status: true,
            paymentType: true,
            amount: { amountMicros: true },
            paidOn: true,
            rentPeriod: true,
          },
        },
      },
    }),
    client.query({
      expenses: {
        __args: { filter: byProperty, first: 500, orderBy: [{ expenseDate: 'DescNullsLast' }] },
        edges: { node: { id: true, name: true, expenseDate: true, amount: { amountMicros: true }, category: true } },
      },
    }),
    client.query({
      documents: {
        __args: { filter: byProperty, first: 200, orderBy: [{ expiresOn: 'AscNullsLast' }] },
        edges: { node: { id: true, name: true, documentType: true, expiresOn: true } },
      },
    }),
  ]);

  const property = properties?.edges?.[0]?.node;
  const address = property?.propertyAddress;

  return {
    name: property?.name ?? 'Property',
    address: [address?.addressStreet1, address?.addressStreet2, address?.addressPostcode, address?.addressCity]
      .filter(Boolean)
      .join(', '),
    propertyType: (property?.propertyType as string | null) ?? null,
    status: (property?.status as string | null) ?? null,
    ownerName: property?.owner?.name ?? '',
    contracts: (rentals?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? '',
      status: (node.status as string) ?? '',
      startDate: node.startDate ?? null,
      endDate: node.endDate ?? null,
      dueDay: node.dueDay ?? 1,
      rent: money(node.monthlyRent),
      deposit: money(node.depositAmount),
      utilityDeposit: money(node.utilityDeposit),
      depositStatus: (node.depositStatus as string | null) ?? null,
      depositRefunded: money(node.depositRefunded),
      tenantName: personName(node.tenant?.name),
      tenantPhone: phoneText(node.tenant?.phones),
    })),
    payments: (rentPayments?.edges ?? []).map(({ node }) => ({
      status: (node.status as string) ?? '',
      type: (node.paymentType as string) ?? '',
      amount: money(node.amount),
      paidOn: node.paidOn ?? null,
      month: node.rentPeriod ? monthStart(node.rentPeriod) : null,
    })),
    expenses: (expenses?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? '',
      date: node.expenseDate ?? null,
      amount: money(node.amount),
      category: (node.category as string | null) ?? null,
    })),
    documents: (documents?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? '',
      type: (node.documentType as string | null) ?? null,
      expiresOn: node.expiresOn ?? null,
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
  radius: 'var(--t-border-radius-md)',
};

const tone = (name: 'green' | 'amber' | 'red' | 'blue' | 'gray'): CSSProperties =>
  name === 'gray'
    ? { background: c.bg2, color: c.text3 }
    : { background: `var(--t-color-${name}3)`, color: `var(--t-color-${name}11)` };

const pill = (name: Parameters<typeof tone>[0]): CSSProperties => ({
  ...tone(name),
  display: 'inline-block',
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
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
};

const linkButton: CSSProperties = {
  fontFamily: c.font,
  fontSize: 12,
  color: 'var(--t-color-blue11)',
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
};

const smallButton: CSSProperties = {
  fontFamily: c.font,
  fontSize: 12,
  color: c.text2,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 24,
  minWidth: 24,
  cursor: 'pointer',
};

const Card = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <div style={card}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {title}
      </span>
      {action}
    </div>
    {children}
  </div>
);

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
    <span style={{ color: c.text3 }}>{label}</span>
    <span style={{ color: c.text, textAlign: 'right' }}>{value}</span>
  </div>
);

const Kpi = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
    <span style={{ fontSize: 18, fontWeight: 600, color: color ?? c.text }}>{value}</span>
  </div>
);

// ---------------------------------------------------------------- component

type MonthState = 'paid' | 'due' | 'overdue' | 'upcoming' | 'none';
const MONTH_TONE: Record<MonthState, Parameters<typeof tone>[0]> = {
  paid: 'green',
  due: 'amber',
  overdue: 'red',
  upcoming: 'gray',
  none: 'gray',
};

const PropertyOverview = () => {
  const recordId = useRecordId();
  const today = todayIso();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!recordId) return;
    loadData(recordId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [recordId]);

  const view = useMemo(() => {
    if (!data) return null;

    const contract =
      data.contracts.find((x) => x.status === 'ACTIVE') ??
      data.contracts.find((x) => x.status !== 'DRAFT') ??
      null;
    const inYear = (iso: string | null) => Boolean(iso && iso.startsWith(String(year)));
    const received = data.payments.filter((p) => isPaid(p.status) && inYear(p.paidOn));
    const rent = received.filter((p) => p.type === 'RENT').reduce((s, p) => s + p.amount, 0);
    const deposits = received.filter((p) => p.type !== 'RENT').reduce((s, p) => s + p.amount, 0);
    const spent = data.expenses.filter((e) => inYear(e.date)).reduce((s, e) => s + e.amount, 0);

    const paidMonths = new Set(
      data.payments.filter((p) => p.type === 'RENT' && isPaid(p.status) && p.month).map((p) => p.month as string),
    );
    const months = MONTHS.map((label, index) => {
      const month = `${year}-${String(index + 1).padStart(2, '0')}-01`;
      const active = data.contracts.filter(
        (x) =>
          x.status !== 'DRAFT' &&
          (!x.startDate || monthStart(x.startDate) <= month) &&
          (!x.endDate || x.endDate >= month),
      );
      let state: MonthState = 'none';

      if (paidMonths.has(month)) state = 'paid';
      else if (active.length === 0) state = 'none';
      else if (month > monthStart(today)) state = 'upcoming';
      else state = today > dueDateInMonth(month, active[0].dueDay) ? 'overdue' : 'due';

      return { label, state };
    });

    const expiring = data.documents.filter(
      (d) => d.expiresOn && daysBetween(today, d.expiresOn) <= EXPIRY_WARNING_DAYS,
    );

    return { contract, rent, deposits, spent, months, expiring };
  }, [data, year, today]);

  if (error) return <div style={{ padding: 16, color: 'var(--t-color-red11)', fontFamily: c.font }}>{error}</div>;
  if (!data || !view) return <div style={{ padding: 16, color: c.text3, fontFamily: c.font, fontSize: 13 }}>Loading…</div>;

  const { contract } = view;
  const daysLeft = contract?.endDate ? daysBetween(today, contract.endDate) : null;
  const net = view.rent + view.deposits - view.spent;

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{data.name}</span>
        {data.status && (
          <span style={pill(data.status === 'OCCUPIED' ? 'green' : 'amber')}>
            {data.status === 'OCCUPIED' ? 'Occupied' : 'Vacant'}
          </span>
        )}
        {data.propertyType && <span style={pill('gray')}>{TYPE_LABEL[data.propertyType] ?? data.propertyType}</span>}
        {data.ownerName && <span style={pill('blue')}>Workspace: {data.ownerName}</span>}
      </div>
      {data.address && <div style={{ fontSize: 13, color: c.text3, marginTop: -6 }}>{data.address}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {/* current contract */}
        <Card
          title={contract?.status === 'ACTIVE' ? 'Current contract' : 'Last contract'}
          action={
            contract && (
              <button style={linkButton} onClick={() => open('rental', contract.id)}>
                Open
              </button>
            )
          }
        >
          {contract ? (
            <>
              <Row label="Tenant" value={contract.tenantName || '—'} />
              {contract.tenantPhone && <Row label="Phone" value={contract.tenantPhone} />}
              <Row label="Rent" value={`${rm(contract.rent)} / month, due day ${contract.dueDay}`} />
              <Row label="Period" value={`${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`} />
              {daysLeft !== null && (
                <Row
                  label="Ends"
                  value={
                    <span style={pill(daysLeft < 0 ? 'gray' : daysLeft <= 60 ? 'amber' : 'green')}>
                      {daysLeft < 0 ? 'Ended' : `in ${daysLeft} days`}
                    </span>
                  }
                />
              )}
            </>
          ) : (
            <span style={{ fontSize: 13, color: c.text3 }}>No contract yet. Add one in the Contracts tab.</span>
          )}
        </Card>

        {/* deposits */}
        <Card title="Deposits">
          {contract ? (
            <>
              <Row label="Security deposit" value={rm(contract.deposit)} />
              <Row label="Utility deposit" value={rm(contract.utilityDeposit)} />
              <Row
                label="Status"
                value={
                  <span
                    style={pill(
                      contract.depositStatus === 'HELD'
                        ? 'green'
                        : contract.depositStatus === 'NOT_RECEIVED' || !contract.depositStatus
                        ? 'amber'
                        : 'gray',
                    )}
                  >
                    {DEPOSIT_LABEL[contract.depositStatus ?? 'NOT_RECEIVED'] ?? contract.depositStatus}
                  </span>
                }
              />
              {contract.depositRefunded > 0 && <Row label="Refunded" value={rm(contract.depositRefunded)} />}
            </>
          ) : (
            <span style={{ fontSize: 13, color: c.text3 }}>—</span>
          )}
        </Card>
      </div>

      {/* year */}
      <Card
        title={`Year ${year}`}
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={smallButton} onClick={() => setYear(year - 1)}>
              ‹
            </button>
            <button style={smallButton} onClick={() => setYear(year + 1)}>
              ›
            </button>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          <Kpi label="Rent received" value={rm(view.rent)} />
          <Kpi label="Deposits received" value={rm(view.deposits)} />
          <Kpi label="Expenses" value={rm(view.spent)} />
          <Kpi label="Net" value={rm(net)} color={net < 0 ? 'var(--t-color-red11)' : 'var(--t-color-green11)'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 4 }}>
          {view.months.map(({ label, state }) => (
            <div
              key={label}
              title={state}
              style={{
                ...tone(MONTH_TONE[state]),
                ...(state === 'none' ? { background: 'transparent', border: `1px dashed ${c.border}` } : {}),
                borderRadius: 6,
                padding: '6px 0',
                textAlign: 'center',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: c.text3, flexWrap: 'wrap' }}>
          <span><span style={pill('green')}>Paid</span></span>
          <span><span style={pill('amber')}>Due</span></span>
          <span><span style={pill('red')}>Overdue</span></span>
          <span><span style={pill('gray')}>Upcoming</span></span>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {/* recent expenses */}
        <Card title="Recent expenses">
          {data.expenses.length === 0 ? (
            <span style={{ fontSize: 13, color: c.text3 }}>None yet. Add them in the Expenses tab.</span>
          ) : (
            data.expenses.slice(0, 5).map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <button style={{ ...linkButton, fontSize: 13, textAlign: 'left' }} onClick={() => open('expense', e.id)}>
                  {e.name || CATEGORY_LABEL[e.category ?? ''] || 'Expense'}
                </button>
                <span style={{ color: c.text3, whiteSpace: 'nowrap' }}>
                  {formatDate(e.date)} · {rm(e.amount)}
                </span>
              </div>
            ))
          )}
        </Card>

        {/* documents */}
        <Card title={`Documents (${data.documents.length})`}>
          {view.expiring.length === 0 ? (
            <span style={{ fontSize: 13, color: c.text3 }}>
              {data.documents.length === 0 ? 'None yet. Add them in the Documents tab.' : 'Nothing expiring in the next 60 days.'}
            </span>
          ) : (
            view.expiring.map((d) => {
              const days = daysBetween(today, d.expiresOn as string);

              return (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                  <button style={{ ...linkButton, fontSize: 13, textAlign: 'left' }} onClick={() => open('document', d.id)}>
                    {d.name || 'Document'}
                  </button>
                  <span style={pill(days < 0 ? 'red' : 'amber')}>
                    {days < 0 ? `Expired ${formatDate(d.expiresOn)}` : `Expires in ${days} days`}
                  </span>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: PROPERTY_OVERVIEW_FRONT_COMPONENT_ID,
  name: 'property-overview',
  description: 'Property summary: contract, deposits, yearly money in and out, documents',
  component: PropertyOverview,
});
