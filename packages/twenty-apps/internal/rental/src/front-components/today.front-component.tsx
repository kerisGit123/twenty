import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { openSidePanelPage, SidePanelPages } from 'twenty-sdk/front-component';

import { TODAY_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { openList, openPage } from 'src/front-components/shared/open-page';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { ReminderList } from 'src/front-components/shared/reminder-list';
import { todayIso } from 'src/logic-functions/utils/dates';
import type { Contract, TodayData } from 'src/logic-functions/page-data/today-data';
import { whatsappLink } from 'src/shared/whatsapp-link';
import { type AgendaItem, agendaItems } from 'src/shared/agenda';
import { occasionOf, upcomingOccasions } from 'src/shared/campaigns';

// ---------------------------------------------------------------- types

// Server data with paid months as a set for quick lookups.
type Data = Omit<TodayData, 'paid'> & { paid: Set<string> };

type Kind = 'overdue' | 'due' | 'rentChange' | 'ending' | 'stamp' | 'document' | 'birthday' | 'bills' | 'repeat' | 'campaign';

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

// "Feb – Sep 2026", "Nov 2025 – Feb 2026", or "Mar, May 2026" when not in a row.
const monthSpan = (months: string[]) => {
  const sorted = [...months].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const index = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));
  const inARow = index(last) - index(first) === sorted.length - 1;

  if (sorted.length === 1) return monthName(first);
  if (!inARow) {
    return first.slice(0, 4) === last.slice(0, 4)
      ? `${sorted.map((m) => MONTHS[Number(m.slice(5, 7)) - 1]).join(', ')} ${first.slice(0, 4)}`
      : sorted.map(monthName).join(', ');
  }

  return first.slice(0, 4) === last.slice(0, 4)
    ? `${MONTHS[Number(first.slice(5, 7)) - 1]} – ${monthName(last)}`
    : `${monthName(first)} – ${monthName(last)}`;
};

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

const openRecord = (objectNameSingular: string, recordId: string) =>
  openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId, objectNameSingular });

// ---------------------------------------------------------------- data

// Several overdue months for one contract become one row: one total and one
// WhatsApp message listing the months.
const overdueGroup = (entries: AgendaItem[]): Item => {
  const c = entries[0].contract as NonNullable<AgendaItem['contract']>;
  const months = entries.map((e) => e.month as string);
  const total = entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const part = entries.some((e) => e.received);
  const text = `Hi ${firstName(c.tenantName)}, a friendly reminder that the rent for ${c.propertyName} for ${monthSpan(months)} (${entries.length} months, ${rm(total)} in total) hasn't been received yet. Please let us know once it's paid. Thank you!`;

  return {
    key: `overdue-${c.id}`,
    kind: 'overdue',
    date: entries[0].date,
    title: `${c.propertyName} · ${entries.length} months overdue`,
    detail: `${c.tenantName} · ${monthSpan(months)}${part ? ' (some part-paid)' : ''} · oldest due ${shortDate(entries[0].date)}`,
    amount: total,
    whatsapp: whatsappLink(c.tenantPhone, text),
    open: () => openPage('Rent Ledger'),
    openLabel: 'Catch up',
  };
};

// Everything that needs doing (rules in src/shared/agenda.ts), with the text,
// WhatsApp message and link for each.
const buildItems = (data: Data, today: string): Item[] => {
  const entries = agendaItems(data, today);
  const overdueBy = new Map<string, AgendaItem[]>();

  for (const entry of entries) {
    if (entry.kind === 'overdue' && entry.contract) overdueBy.set(entry.contract.id, [...(overdueBy.get(entry.contract.id) ?? []), entry]);
  }

  const items: Item[] = [];

  for (const entry of entries) {
    const group = entry.kind === 'overdue' && entry.contract ? overdueBy.get(entry.contract.id) : undefined;

    if (group && group.length > 1) {
      // One row per contract, placed where its oldest month would be.
      if (group[0] === entry) items.push(overdueGroup(group));
      continue;
    }
    items.push(buildItem(entry, today));
  }

  return items;
};

const buildItem = (entry: AgendaItem, today: string): Item => {
    const contract = entry.contract;

    switch (entry.kind) {
      case 'overdue':
      case 'due': {
        const c = contract as NonNullable<typeof contract>;
        const month = entry.month as string;
        const owed = entry.amount ?? c.rent;
        const what = entry.received ? `the rest of the rent (${rm(owed)})` : `the rent`;
        const text =
          entry.kind === 'overdue'
            ? `Hi ${firstName(c.tenantName)}, a friendly reminder that ${what} for ${c.propertyName} for ${monthName(month)}${entry.received ? '' : ` (${rm(owed)})`} was due on ${shortDate(entry.date)}. Please let us know once it's paid. Thank you!`
            : `Hi ${firstName(c.tenantName)}, a reminder that ${what} for ${c.propertyName} for ${monthName(month)}${entry.received ? '' : ` (${rm(owed)})`} is due on ${shortDate(entry.date)}. Thank you!`;

        return {
          key: entry.key,
          kind: entry.kind,
          date: entry.date,
          title: `${c.propertyName} · ${monthName(month)} rent${entry.received ? ' (part-paid)' : ''}`,
          detail: entry.received
            ? `${c.tenantName} · ${rm(entry.received)} received, rest due ${shortDate(entry.date)}`
            : `${c.tenantName} · due ${shortDate(entry.date)}`,
          amount: owed,
          whatsapp: whatsappLink(c.tenantPhone, text),
          open: () => openPage('Rent Ledger'),
          openLabel: 'Record',
        };
      }
      case 'rentChange': {
        const c = contract as NonNullable<typeof contract>;
        const month = entry.month as string;
        const up = (entry.amount ?? 0) >= c.rent;

        return {
          key: entry.key,
          kind: 'rentChange',
          date: entry.date,
          title: `${c.propertyName} · rent ${up ? 'goes up' : 'changes'} to ${rm(entry.amount ?? 0)}`,
          detail: `${c.tenantName} · from ${monthName(month)} (now ${rm(c.rent)})`,
          whatsapp: whatsappLink(
            c.tenantPhone,
            `Hi ${firstName(c.tenantName)}, a reminder that from ${monthName(month)} the monthly rent for ${c.propertyName} will be ${rm(entry.amount ?? 0)}, as agreed. Thank you!`,
          ),
          open: () => openRecord('rental', c.id),
          openLabel: 'Open',
        };
      }
      case 'ending': {
        const c = contract as NonNullable<typeof contract>;

        return {
          key: entry.key,
          kind: 'ending',
          date: entry.date,
          title: `${c.propertyName} · contract ${entry.date < today ? 'ended' : 'ends'}`,
          detail: `${c.tenantName} · ${shortDate(entry.date)}`,
          whatsapp: whatsappLink(
            c.tenantPhone,
            `Hi ${firstName(c.tenantName)}, your tenancy for ${c.propertyName} ends on ${shortDate(entry.date)}. Would you like to renew? Let me know and I'll prepare the agreement.`,
          ),
          open: () => openPage('Contracts'),
          openLabel: 'Renew',
        };
      }
      case 'stamp': {
        const c = contract as NonNullable<typeof contract>;

        return {
          key: entry.key,
          kind: 'stamp',
          date: entry.date,
          title: `${c.propertyName} · stamp the agreement`,
          detail: `LHDN e-Duti Setem, due ${shortDate(entry.date)}. Set "Stamped on" when done.`,
          open: () => openRecord('rental', c.id),
          openLabel: 'Open',
        };
      }
      case 'document':
        return {
          key: entry.key,
          kind: 'document',
          date: entry.date,
          title: `${entry.documentName} ${entry.date < today ? 'expired' : 'expires'}`,
          detail: shortDate(entry.date),
          open: () => openRecord('document', entry.documentId as string),
          openLabel: 'Open',
        };
      case 'birthday':
        return {
          key: entry.key,
          kind: 'birthday',
          date: entry.date,
          title: `${entry.personName}'s birthday`,
          detail: shortDate(entry.date),
          whatsapp: whatsappLink(entry.personPhone ?? null, `Happy birthday ${firstName(entry.personName ?? '')}! 🎉 Wishing you a wonderful year ahead.`),
          open: () => openRecord('person', entry.personId as string),
          openLabel: 'Open',
        };
    }
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
  rentChange: { label: 'Rent change', color: 'iris', icon: '↗' },
  ending: { label: 'Contract', color: 'purple', icon: '⌛' },
  stamp: { label: 'Stamping', color: 'orange', icon: '§' },
  document: { label: 'Document', color: 'blue', icon: '▤' },
  birthday: { label: 'Birthday', color: 'pink', icon: '✦' },
  bills: { label: 'Bills', color: 'amber', icon: '📎' },
  repeat: { label: 'Bill', color: 'iris', icon: '🔁' },
  campaign: { label: 'Campaign', color: 'pink', icon: '🎉' },
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
      bills: (data.bills ?? []).filter((x) => scope.matches(x.ownerId)),
      campaigns: (data.campaigns ?? []).filter((x) => scope.matches(x.ownerId)),
    };
    // Repeating bills due in the next 30 days.
    const repeatItems: Item[] = scoped.bills
      .filter((bill) => bill.nextDate <= addDays(today, 30))
      .map((bill) => ({
        key: `repeat-${bill.id}`,
        kind: 'repeat',
        date: bill.nextDate,
        title: `${bill.name} bill`,
        detail: `Repeating · due ${shortDate(bill.nextDate)}${bill.propertyName ? ` · ${bill.propertyName}` : ''}`,
        amount: bill.currency === 'MYR' ? bill.amount : undefined,
        open: () => openPage('Expenses'),
        openLabel: 'Add',
      }));
    // Campaigns due (ready to send) or coming up; holidays with nothing planned.
    const campaignItems: Item[] = scoped.campaigns.map((x) => ({
      key: `campaign-${x.id}`,
      kind: 'campaign',
      date: x.sendOn,
      title: x.sendOn <= today ? `${x.name} — ready to send` : x.name,
      detail: x.sent ? `${x.sent} sent so far` : x.kind === 'GREETING' ? `${occasionOf(x.occasion).icon} Greeting on WhatsApp` : 'On WhatsApp',
      open: () => openPage('Campaigns'),
      openLabel: x.sendOn <= today ? 'Send' : 'Open',
    }));
    const planned = new Set(scoped.campaigns.map((x) => `${x.occasion}|${x.sendOn.slice(0, 4)}`));
    const holidayItems: Item[] = upcomingOccasions(today, 14)
      .filter(({ occasion, date }) => !planned.has(`${occasion.value}|${date.slice(0, 4)}`))
      .map(({ occasion, date }) => ({
        key: `holiday-${occasion.value}-${date}`,
        kind: 'campaign',
        date,
        title: `${occasion.icon} ${occasion.label}`,
        detail: 'No greeting planned yet',
        open: () => openPage('Campaigns'),
        openLabel: 'Plan',
      }));
    const items = [...buildItems(scoped, today), ...repeatItems, ...campaignItems, ...holidayItems].sort((a, b) => a.date.localeCompare(b.date));
    const scopedEntries = agendaItems(scoped, today);
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
        (i.kind === 'repeat' && i.date <= week) ||
        (i.kind === 'campaign' && i.date <= today && i.key.startsWith('campaign-')) ||
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

    // Grouped rows stand for several months.
    const overdueMonths = scopedEntries.filter((e) => e.kind === 'overdue').length;

    return { overdue, overdueMonths, dueSoon, ending, stamping, documents, missingBills, attention, upcoming };
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
              hint={`${view.overdueMonths} month${view.overdueMonths === 1 ? '' : 's'} unpaid`}
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
              hint="within 90 days"
              color="purple"
              onClick={() => openPage('Contracts')}
            />
            <Tile
              label="Stamping due"
              value={String(view.stamping.length)}
              hint="agreements not stamped"
              color={view.stamping.length ? 'orange' : 'green'}
              onClick={() => openPage('Contracts')}
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

          <ReminderList title="📱 Reminders to send" hideWhenEmpty />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 12, alignItems: 'start' }}>
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
