import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  copyToClipboard,
  enqueueSnackbar,
  openSidePanelPage,
  SidePanelPages,
  useRecordId,
} from 'twenty-sdk/front-component';

import { MONTHS } from 'src/shared/months';
import { PERSON_OVERVIEW_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { dueDateInMonth, monthStart, nextMonthStart, todayIso } from 'src/logic-functions/utils/dates';
import { toE164, type TenantPhone, whatsappLink } from 'src/shared/whatsapp-link';

// ---------------------------------------------------------------- types

type Contract = {
  id: string;
  status: string;
  propertyName: string;
  startDate: string | null;
  endDate: string | null;
  dueDay: number;
  rent: number;
};

type Data = {
  name: string;
  firstName: string;
  phone: TenantPhone;
  email: string;
  tags: string[];
  birthday: string | null;
  company: string;
  contracts: Contract[];
  paid: Set<string>; // `${contractId}|YYYY-MM-01`
  paidThisYear: number;
};

// ---------------------------------------------------------------- helpers

const GRACE_DAYS = 3;
const TAG_COLORS: Record<string, string> = {
  TENANT: 'blue',
  CLIENT: 'green',
  FRIEND: 'turquoise',
  FAMILY: 'pink',
  BUSINESS_PARTNER: 'purple',
};

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const money = (value: { amountMicros?: number | null } | null | undefined) => (value?.amountMicros ?? 0) / 1_000_000;
const shortDate = (iso: string | null) =>
  iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '—';
const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

const nextBirthday = (today: string, birthday: string) => {
  const year = Number(today.slice(0, 4));
  const monthDay = birthday.slice(5, 10) === '02-29' ? '02-28' : birthday.slice(5, 10);
  const thisYear = `${year}-${monthDay}`;

  return thisYear >= today ? thisYear : `${year + 1}-${monthDay}`;
};

// ---------------------------------------------------------------- data

const loadData = async (personId: string, today: string): Promise<Data | null> => {
  const client = new CoreApiClient();
  const [{ people }, { rentals }] = await Promise.all([
    client.query({
      people: {
        __args: { filter: { id: { eq: personId } }, first: 1 },
        edges: {
          node: {
            name: { firstName: true, lastName: true },
            phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
            emails: { primaryEmail: true },
            tags: true,
            birthday: true,
            company: { name: true },
          },
        },
      },
    }),
    client.query({
      rentals: {
        __args: { filter: { tenantId: { eq: personId } }, first: 50, orderBy: [{ startDate: 'DescNullsLast' }] },
        edges: {
          node: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            dueDay: true,
            monthlyRent: { amountMicros: true },
            property: { name: true },
          },
        },
      },
    }),
  ]);
  const person = people?.edges?.[0]?.node;

  if (!person) return null;

  const { rentPayments } = await client.query({
    rentPayments: {
      __args: {
        filter: { tenantId: { eq: personId }, status: { in: ['ISSUED', 'SENT'] } },
        first: 500,
      },
      edges: { node: { rentalId: true, rentPeriod: true, paymentType: true, amount: { amountMicros: true }, paidOn: true } },
    },
  });
  const payments = (rentPayments?.edges ?? []).map(({ node }) => node);
  const year = today.slice(0, 4);

  return {
    name: [person.name?.firstName, person.name?.lastName].filter(Boolean).join(' ') || 'Contact',
    firstName: person.name?.firstName ?? '',
    phone: person.phones ?? null,
    email: person.emails?.primaryEmail ?? '',
    tags: ((person.tags as unknown as string[] | null) ?? []).filter(Boolean),
    birthday: person.birthday ?? null,
    company: person.company?.name ?? '',
    contracts: (rentals?.edges ?? [])
      .filter(({ node }) => node.status !== 'DRAFT')
      .map(({ node }) => ({
        id: node.id,
        status: (node.status as string) ?? '',
        propertyName: node.property?.name ?? 'Property',
        startDate: node.startDate ?? null,
        endDate: node.endDate ?? null,
        dueDay: node.dueDay ?? 1,
        rent: money(node.monthlyRent),
      })),
    paid: new Set(
      payments
        .filter((p) => p.paymentType === 'RENT' && p.rentalId && p.rentPeriod)
        .map((p) => `${p.rentalId}|${monthStart(p.rentPeriod as string)}`),
    ),
    paidThisYear: payments
      .filter((p) => (p.paidOn ?? '').startsWith(year))
      .reduce((s, p) => s + money(p.amount), 0),
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

const action: CSSProperties = {
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
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
};

const pill = (color: string): CSSProperties => ({
  background: `var(--t-color-${color}3)`,
  color: `var(--t-color-${color}11)`,
  fontSize: 12,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
});

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</span>
    {children}
  </div>
);

// ---------------------------------------------------------------- component

const PersonOverview = () => {
  const recordId = useRecordId();
  const today = todayIso();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!recordId) return;
    loadData(recordId, today)
      .then((result) => (result ? setData(result) : setError('Contact not found.')))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [recordId, today]);

  if (error) return <div style={{ padding: 16, fontFamily: c.font, color: 'var(--t-color-red11)' }}>{error}</div>;
  if (!data) return <div style={{ padding: 16, fontFamily: c.font, color: c.text3, fontSize: 13 }}>Loading…</div>;

  const e164 = toE164(data.phone);
  const chat = whatsappLink(data.phone, data.firstName ? `Hi ${data.firstName}, ` : undefined);
  const birthdayNext = data.birthday ? nextBirthday(today, data.birthday) : null;
  const birthdayIn = birthdayNext ? daysBetween(today, birthdayNext) : null;
  const turning = data.birthday && birthdayNext ? Number(birthdayNext.slice(0, 4)) - Number(data.birthday.slice(0, 4)) : null;
  const active = data.contracts.find((x) => x.status === 'ACTIVE');

  // Last six months of rent for the active contract.
  const strip = active
    ? Array.from({ length: 6 }, (_, i) => {
        let month = monthStart(today);

        for (let k = 0; k < 5 - i; k += 1) month = monthStart(addDays(month, -1));

        const inContract =
          (!active.startDate || monthStart(active.startDate) <= month) && (!active.endDate || active.endDate >= month);
        const paid = data.paid.has(`${active.id}|${month}`);
        const overdue = !paid && inContract && today > addDays(dueDateInMonth(month, active.dueDay), GRACE_DAYS);

        return { month, state: !inContract ? 'none' : paid ? 'paid' : overdue ? 'overdue' : 'due' };
      })
    : [];
  const owing = active ? strip.filter((m) => m.state === 'overdue').length * active.rent : 0;

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* identity + quick actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{data.name}</span>
          {data.tags.map((tag) => (
            <span key={tag} style={pill(TAG_COLORS[tag] ?? 'gray')}>
              {label(tag)}
            </span>
          ))}
          {data.company && <span style={{ fontSize: 13, color: c.text3 }}>· {data.company}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chat ? (
            <a href={chat} target="_blank" rel="noopener noreferrer" style={{ ...action, background: '#25D366', border: '1px solid #25D366', color: '#fff' }}>
              WhatsApp
            </a>
          ) : (
            <span style={{ ...action, color: c.text3, cursor: 'default' }}>No phone number</span>
          )}
          {e164 && (
            <a href={`tel:${e164}`} style={action}>
              Call
            </a>
          )}
          {e164 && (
            <button
              style={action}
              onClick={async () => {
                await copyToClipboard(e164);
                await enqueueSnackbar({ message: `Copied ${e164}`, variant: 'success' });
              }}
            >
              Copy number
            </button>
          )}
          {data.email && (
            <a href={`mailto:${data.email}`} style={action}>
              Email
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <Card title="Birthday">
          {data.birthday && birthdayIn !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{shortDate(data.birthday).replace(/ \d{4}$/, '')}</span>
              <span style={{ color: c.text3 }}>
                {birthdayIn === 0 ? 'Today! 🎉' : `in ${birthdayIn} day${birthdayIn === 1 ? '' : 's'}`}
                {turning ? ` · turns ${turning}` : ''}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: c.text3 }}>Not set. Add it on the Home tab to get a reminder on Today.</span>
          )}
        </Card>

        <Card title="Rent">
          {active ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: c.text3 }}>Paid this year</span>
                <span style={{ fontWeight: 600 }}>{rm(data.paidThisYear)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: c.text3 }}>Overdue</span>
                <span style={{ fontWeight: 600, color: owing ? 'var(--t-color-red11)' : 'var(--t-color-green11)' }}>
                  {owing ? rm(owing) : 'Nothing'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                {strip.map(({ month, state }) => (
                  <span
                    key={month}
                    title={state}
                    style={{
                      textAlign: 'center',
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '5px 0',
                      borderRadius: 6,
                      ...(state === 'paid'
                        ? { background: 'var(--t-color-green3)', color: 'var(--t-color-green11)' }
                        : state === 'overdue'
                        ? { background: 'var(--t-color-red3)', color: 'var(--t-color-red11)' }
                        : state === 'due'
                        ? { background: 'var(--t-color-amber3)', color: 'var(--t-color-amber11)' }
                        : { border: `1px dashed ${c.border}`, color: c.text3 }),
                    }}
                  >
                    {MONTHS[Number(month.slice(5, 7)) - 1]}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: c.text3 }}>Not renting at the moment.</span>
          )}
        </Card>
      </div>

      {data.contracts.length > 0 && (
        <Card title={`Contracts (${data.contracts.length})`}>
          {data.contracts.map((contract) => (
            <button
              key={contract.id}
              onClick={() => openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: contract.id, objectNameSingular: 'rental' })}
              style={{
                fontFamily: c.font,
                fontSize: 13,
                color: c.text,
                background: 'transparent',
                border: 'none',
                borderTop: `1px solid ${c.border}`,
                padding: '8px 0 0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                textAlign: 'left',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{contract.propertyName}</span>
                <span style={{ color: c.text3 }}>
                  {' '}
                  · {shortDate(contract.startDate)} – {shortDate(contract.endDate)}
                </span>
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>{rm(contract.rent)}/mo</span>
              <span style={pill(contract.status === 'ACTIVE' ? 'green' : 'gray')}>{label(contract.status)}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: PERSON_OVERVIEW_FRONT_COMPONENT_ID,
  name: 'person-overview',
  description: 'Person summary: quick WhatsApp/call actions, birthday, rent status and contracts',
  component: PersonOverview,
});
