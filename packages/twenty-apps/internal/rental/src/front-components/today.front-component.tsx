import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { openSidePanelPage, SidePanelPages } from 'twenty-sdk/front-component';

import { TODAY_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { openList, openPage } from 'src/front-components/shared/open-page';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { dueDateInMonth, monthStart, nextMonthStart, todayIso } from 'src/logic-functions/utils/dates';
import type { Contract, TodayData } from 'src/logic-functions/page-data/today-data';
import { whatsappLink } from 'src/shared/whatsapp-link';

// ---------------------------------------------------------------- types

// Server data with paid months as a set for quick lookups.
type Data = Omit<TodayData, 'paid'> & { paid: Set<string> };

type Kind = 'overdue' | 'due' | 'ending' | 'stamp' | 'document' | 'birthday' | 'bills';

type Item = {
  key: string;
  kind: Kind;
  date: string;
  title: string;
  detail: string;
  amount?: number;
  whatsapp?: string | null;
  open?: () => void;
  openLabel?: string;
};

// ---------------------------------------------------------------- helpers

const GRACE_DAYS = 3; // same as the Rent Ledger
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const money = (value: { amountMicros?: number | null } | null | undefined) => (value?.amountMicros ?? 0) / 1_000_000;

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const relative = (today: string, iso: string) => {
  const days = daysBetween(today, iso);

  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';

  return days > 0 ? `in ${days} days` : `${-days} days ago`;
};

const personName = (name: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  [name?.firstName, name?.lastName].filter(Boolean).join(' ');

const firstName = (full: string) => full.split(' ')[0] || full;

// Next birthday on or after today (Feb 29 falls back to Feb 28).
const nextBirthday = (today: string, birthday: string) => {
  const year = Number(today.slice(0, 4));
  const monthDay = birthday.slice(5, 10) === '02-29' ? '02-28' : birthday.slice(5, 10);
  const thisYear = `${year}-${monthDay}`;

  return thisYear >= today ? thisYear : `${year + 1}-${monthDay}`;
};

const openRecord = (objectNameSingular: string, recordId: string) =>
  openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId, objectNameSingular });

// ---------------------------------------------------------------- data

// Everything that needs doing, plus what's coming in the next 30 days.
const buildItems = (data: Data, today: string): Item[] => {
  const items: Item[] = [];
  const horizon = addDays(today, 30);

  for (const contract of data.contracts) {
    const active = contract.status === 'ACTIVE';
    const open = () => openRecord('rental', contract.id);

    // Rent: unpaid months from up to 6 months back to the month after next.
    if (active) {
      let month = monthStart(addDays(today, -186));

      if (contract.startDate && monthStart(contract.startDate) > month) month = monthStart(contract.startDate);

      for (; month <= monthStart(horizon); month = nextMonthStart(month)) {
        if (contract.endDate && contract.endDate < month) break;
        if (data.paid.has(`${contract.id}|${month}`)) continue;

        const due = dueDateInMonth(month, contract.dueDay);
        const overdue = today > addDays(due, GRACE_DAYS);

        if (!overdue && due > horizon) continue;

        const text = overdue
          ? `Hi ${firstName(contract.tenantName)}, a friendly reminder that the rent for ${contract.propertyName} for ${monthName(month)} (${rm(contract.rent)}) was due on ${shortDate(due)}. Please let us know once it's paid. Thank you!`
          : `Hi ${firstName(contract.tenantName)}, a reminder that the rent for ${contract.propertyName} for ${monthName(month)} (${rm(contract.rent)}) is due on ${shortDate(due)}. Thank you!`;

        items.push({
          key: `rent-${contract.id}-${month}`,
          kind: overdue ? 'overdue' : 'due',
          date: due,
          title: `${contract.propertyName} · ${monthName(month)} rent`,
          detail: `${contract.tenantName} · due ${shortDate(due)}`,
          amount: contract.rent,
          whatsapp: whatsappLink(contract.tenantPhone, text),
          open: () => openPage('Rent Ledger'),
          openLabel: 'Record',
        });
      }
    }

    // Contract ending within 60 days (or ended but still marked active).
    if (active && contract.endDate && daysBetween(today, contract.endDate) <= 60) {
      items.push({
        key: `end-${contract.id}`,
        kind: 'ending',
        date: contract.endDate,
        title: `${contract.propertyName} · contract ${contract.endDate < today ? 'ended' : 'ends'}`,
        detail: `${contract.tenantName} · ${shortDate(contract.endDate)}`,
        whatsapp: whatsappLink(
          contract.tenantPhone,
          `Hi ${firstName(contract.tenantName)}, your tenancy for ${contract.propertyName} ends on ${shortDate(contract.endDate)}. Would you like to renew? Let me know and I'll prepare the agreement.`,
        ),
        open,
        openLabel: 'Open',
      });
    }

    // Stamping: due 30 days from the start; shown from a month before until done.
    if (!contract.stampedOn && contract.startDate && daysBetween(contract.startDate, today) <= 400) {
      const due = addDays(contract.startDate, 30);

      if (daysBetween(today, due) <= 30) {
        items.push({
          key: `stamp-${contract.id}`,
          kind: 'stamp',
          date: due,
          title: `${contract.propertyName} · stamp the agreement`,
          detail: `LHDN e-Duti Setem, due ${shortDate(due)}. Set "Stamped on" when done.`,
          open,
          openLabel: 'Open',
        });
      }
    }
  }

  for (const doc of data.documents) {
    items.push({
      key: `doc-${doc.id}`,
      kind: 'document',
      date: doc.expiresOn,
      title: `${doc.name} ${doc.expiresOn < today ? 'expired' : 'expires'}`,
      detail: shortDate(doc.expiresOn),
      open: () => openRecord('document', doc.id),
      openLabel: 'Open',
    });
  }

  for (const person of data.people) {
    const next = nextBirthday(today, person.birthday);

    if (next > horizon) continue;
    items.push({
      key: `bday-${person.id}`,
      kind: 'birthday',
      date: next,
      title: `${person.name}'s birthday`,
      detail: shortDate(next),
      whatsapp: whatsappLink(person.phone, `Happy birthday ${firstName(person.name)}! 🎉 Wishing you a wonderful year ahead.`),
      open: () => openRecord('person', person.id),
      openLabel: 'Open',
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
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

const KIND: Record<Kind, { label: string; color: string; icon: string }> = {
  overdue: { label: 'Overdue', color: 'red', icon: '!' },
  due: { label: 'Rent due', color: 'amber', icon: 'RM' },
  ending: { label: 'Contract', color: 'purple', icon: '⌛' },
  stamp: { label: 'Stamping', color: 'orange', icon: '§' },
  document: { label: 'Document', color: 'blue', icon: '▤' },
  birthday: { label: 'Birthday', color: 'pink', icon: '✦' },
  bills: { label: 'Bills', color: 'amber', icon: '📎' },
};

const smallButton: CSSProperties = {
  fontFamily: c.font,
  fontSize: 12,
  fontWeight: 500,
  color: c.text2,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 26,
  padding: '0 10px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  boxSizing: 'border-box',
};

const whatsappButton: CSSProperties = {
  ...smallButton,
  color: '#fff',
  background: '#25D366',
  border: '1px solid #25D366',
};

// ---------------------------------------------------------------- parts

const Tile = ({
  label,
  value,
  hint,
  color,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  color: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    style={{
      fontFamily: c.font,
      textAlign: 'left',
      cursor: 'pointer',
      border: `1px solid ${c.border}`,
      borderRadius: c.radius,
      background: c.bg,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: 0,
      borderLeft: `3px solid var(--t-color-${color}9)`,
    }}
  >
    <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
    <span style={{ fontSize: 22, fontWeight: 600, color: c.text }}>{value}</span>
    <span style={{ fontSize: 12, color: c.text3 }}>{hint}</span>
  </button>
);

const Section = ({ title, count, children }: { title: string; count: number; children: ReactNode }) => (
  <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, overflow: 'hidden', minWidth: 0 }}>
    <div style={{ padding: '10px 14px', background: c.bg2, fontSize: 13, fontWeight: 600, display: 'flex', gap: 8 }}>
      {title}
      <span style={{ color: c.text3, fontWeight: 400 }}>{count}</span>
    </div>
    {children}
  </div>
);

const ItemRow = ({ item, today }: { item: Item; today: string }) => {
  const kind = KIND[item.kind];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderTop: `1px solid ${c.border}`,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          flexShrink: 0,
          borderRadius: 8,
          background: `var(--t-color-${kind.color}3)`,
          color: `var(--t-color-${kind.color}11)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {kind.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
        <span style={{ fontSize: 12, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.detail}{item.kind === 'bills' ? '' : ` · ${relative(today, item.date)}`}
        </span>
      </span>
      {item.amount !== undefined && (
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{rm(item.amount)}</span>
      )}
      {item.whatsapp && (
        <a href={item.whatsapp} target="_blank" rel="noopener noreferrer" style={whatsappButton}>
          WhatsApp
        </a>
      )}
      {item.open && (
        <button onClick={item.open} style={smallButton}>
          {item.openLabel ?? 'Open'}
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- page

const Today = () => {
  const today = todayIso();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const scope = useOwnerScope();

  useEffect(() => {
    // The server reads everything and keeps only the caller's workspaces.
    new RestApiClient()
      .post<{ success: boolean; data?: TodayData; message?: string }>('/s/pages/data', { page: 'today' })
      .then((result) => {
        if (!result.success || !result.data) throw new Error(result.message ?? 'Could not load Today.');
        setData({ ...result.data, paid: new Set(result.data.paid) });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [today]);

  const view = useMemo(() => {
    if (!data) return null;

    // Owner switcher: keep that owner's contracts, documents and expenses.
    // Birthdays are personal, so they always show.
    const scoped: Data = {
      ...data,
      contracts: data.contracts.filter((x) => scope.matches(x.ownerId)),
      documents: data.documents.filter((x) => scope.matches(x.ownerId)),
      expenses: data.expenses.filter((x) => scope.matches(x.ownerId)),
    };
    const items = buildItems(scoped, today);
    const week = addDays(today, 7);
    const overdue = items.filter((i) => i.kind === 'overdue');
    const dueSoon = items.filter((i) => i.kind === 'due' && i.date <= week);
    const ending = items.filter((i) => i.kind === 'ending');
    const stamping = items.filter((i) => i.kind === 'stamp');
    const documents = items.filter((i) => i.kind === 'document' && daysBetween(today, i.date) <= 30);
    const missingBills = scoped.expenses.filter((e) => !e.hasBill && !e.noBillNeeded);
    const attention = items.filter(
      (i) =>
        i.kind === 'overdue' ||
        (i.kind === 'stamp' && daysBetween(today, i.date) <= 14) ||
        (i.kind === 'due' && i.date <= week) ||
        (i.kind === 'ending' && i.date < today) ||
        (i.kind === 'document' && i.date < today),
    );

    if (missingBills.length > 0) {
      attention.push({
        key: 'bills',
        kind: 'bills',
        date: today,
        title: `${missingBills.length} expense${missingBills.length === 1 ? '' : 's'} without a bill`,
        detail: 'Attach the bill or receipt, or tick "No bill available"',
        amount: missingBills.reduce((s, e) => s + e.amount, 0),
        open: () => openPage('Expenses'),
        openLabel: 'Review',
      });
    }
    const attentionKeys = new Set(attention.map((i) => i.key));
    const upcoming = items.filter((i) => !attentionKeys.has(i.key) && i.date >= today);

    return { overdue, dueSoon, ending, stamping, documents, missingBills, attention, upcoming };
  }, [data, today, scope.key]);

  const date = new Date(`${today}T00:00:00Z`);
  const heading = `${DAYS[date.getUTCDay()]}, ${Number(today.slice(8, 10))} ${MONTHS[date.getUTCMonth()]}`;

  if (error) return <div style={{ padding: 16, fontFamily: c.font, color: 'var(--t-color-red11)' }}>{error}</div>;

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{heading}</span>
        <span style={{ fontSize: 13, color: c.text3 }}>
          {!view
            ? 'Loading…'
            : view.attention.length === 0
            ? 'All clear — nothing needs your attention.'
            : `${view.attention.length} thing${view.attention.length === 1 ? '' : 's'} need${view.attention.length === 1 ? 's' : ''} your attention.`}
        </span>
      </div>
      <OwnerSwitcher scope={scope} />
      </div>

      {view && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Tile
              label="Overdue rent"
              value={rm(view.overdue.reduce((s, i) => s + (i.amount ?? 0), 0))}
              hint={`${view.overdue.length} month${view.overdue.length === 1 ? '' : 's'} unpaid`}
              color={view.overdue.length ? 'red' : 'green'}
              onClick={() => openPage('Rent Ledger')}
            />
            <Tile
              label="Due in 7 days"
              value={rm(view.dueSoon.reduce((s, i) => s + (i.amount ?? 0), 0))}
              hint={`${view.dueSoon.length} payment${view.dueSoon.length === 1 ? '' : 's'}`}
              color="amber"
              onClick={() => openPage('Rent Ledger')}
            />
            <Tile
              label="Contracts ending"
              value={String(view.ending.length)}
              hint="within 60 days"
              color="purple"
              onClick={() => openList('rentals')}
            />
            <Tile
              label="Stamping due"
              value={String(view.stamping.length)}
              hint="agreements not stamped"
              color={view.stamping.length ? 'orange' : 'green'}
              onClick={() => openList('rentals')}
            />
            <Tile
              label="Bills missing"
              value={String(view.missingBills.length)}
              hint={view.missingBills.length ? `${rm(view.missingBills.reduce((s, e) => s + e.amount, 0))} of expenses` : 'every expense has a bill'}
              color={view.missingBills.length ? 'amber' : 'green'}
              onClick={() => openPage('Expenses')}
            />
            <Tile
              label="Documents expiring"
              value={String(view.documents.length)}
              hint="within 30 days"
              color="blue"
              onClick={() => openList('documents')}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, alignItems: 'start' }}>
            <Section title="Needs attention" count={view.attention.length}>
              {view.attention.length === 0 && (
                <div style={{ padding: '14px', fontSize: 13, color: c.text3, borderTop: `1px solid ${c.border}` }}>
                  Nothing overdue. 🎉
                </div>
              )}
              {view.attention.map((item) => (
                <ItemRow key={item.key} item={item} today={today} />
              ))}
            </Section>
            <Section title="Coming up · next 30 days" count={view.upcoming.length}>
              {view.upcoming.length === 0 && (
                <div style={{ padding: '14px', fontSize: 13, color: c.text3, borderTop: `1px solid ${c.border}` }}>
                  Nothing scheduled.
                </div>
              )}
              {view.upcoming.map((item) => (
                <ItemRow key={item.key} item={item} today={today} />
              ))}
            </Section>
          </div>
        </>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: TODAY_FRONT_COMPONENT_ID,
  name: 'today',
  description: 'What needs attention today and what is coming up in the next 30 days',
  component: Today,
});
