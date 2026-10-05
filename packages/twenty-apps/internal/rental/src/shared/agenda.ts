import { dueDateInMonth, monthStart, nextMonthStart } from 'src/logic-functions/utils/dates';
import type { Contract, TodayData } from 'src/logic-functions/page-data/today-data';
import { ARREARS_MONTHS, rentForMonth } from 'src/shared/rent-month';

// What needs doing, from the same data as the Today page: unpaid rent (due
// or overdue), rent changes, contracts ending, agreements to stamp, documents
// expiring and birthdays. Used by the Today page and by the WhatsApp morning summary and
// tenant reminders, so they always agree.

export const GRACE_DAYS = 3; // rent is overdue this many days after the due day

export type AgendaKind = 'overdue' | 'due' | 'rentChange' | 'ending' | 'stamp' | 'document' | 'birthday';

export type AgendaItem = {
  key: string;
  kind: AgendaKind;
  date: string; // YYYY-MM-DD (due date, end date, expiry, birthday)
  contract?: Contract;
  month?: string; // rent month, YYYY-MM-01
  amount?: number; // rent still owed for the month
  received?: number; // already received for the month (part-paid)
  documentId?: string;
  documentName?: string;
  personId?: string;
  personName?: string;
  personPhone?: Contract['tenantPhone'];
};

export const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

// Next birthday on or after today (Feb 29 falls back to Feb 28).
export const nextBirthday = (today: string, birthday: string) => {
  const year = Number(today.slice(0, 4));
  const monthDay = birthday.slice(5, 10) === '02-29' ? '02-28' : birthday.slice(5, 10);
  const thisYear = `${year}-${monthDay}`;

  return thisYear >= today ? thisYear : `${year + 1}-${monthDay}`;
};

// Everything that needs doing, plus what's coming in the next 30 days.
export const agendaItems = (data: Omit<TodayData, 'paid'> & { paid: Set<string> }, today: string): AgendaItem[] => {
  const items: AgendaItem[] = [];
  const horizon = addDays(today, 30);

  for (const contract of data.contracts) {
    const active = contract.status === 'ACTIVE';

    // Rent: unpaid and part-paid months, from up to ARREARS_MONTHS back to
    // the month after next.
    if (active) {
      let month = monthStart(`${Number(today.slice(0, 4)) - Math.floor(ARREARS_MONTHS / 12)}${today.slice(4, 10)}`);

      if (contract.startDate && monthStart(contract.startDate) > month) month = monthStart(contract.startDate);

      for (; month <= monthStart(horizon); month = nextMonthStart(month)) {
        if (contract.endDate && contract.endDate < month) break;
        if (data.paid.has(`${contract.id}|${month}`)) continue;

        const due = dueDateInMonth(month, contract.dueDay);
        const overdue = today > addDays(due, GRACE_DAYS);

        if (!overdue && due > horizon) continue;

        const rent = rentForMonth(contract, month);
        const received = data.partial[`${contract.id}|${month}`] ?? 0;

        items.push({
          key: `rent-${contract.id}-${month}`,
          kind: overdue ? 'overdue' : 'due',
          date: due,
          contract,
          month,
          amount: Math.max(0, rent - received),
          ...(received ? { received } : {}),
        });
      }
    }

    // A rent change coming up in the next 60 days.
    if (active && contract.newRent && contract.newRentFrom) {
      const from = dueDateInMonth(monthStart(contract.newRentFrom), contract.dueDay);
      const away = daysBetween(today, from);

      if (away >= 0 && away <= 60) {
        items.push({ key: `rentChange-${contract.id}`, kind: 'rentChange', date: from, contract, month: monthStart(from), amount: contract.newRent });
      }
    }

    // Contract ending within 60 days (or ended but still marked active).
    if (active && contract.endDate && daysBetween(today, contract.endDate) <= 60) {
      items.push({ key: `end-${contract.id}`, kind: 'ending', date: contract.endDate, contract });
    }

    // Stamping: due 30 days from the start; shown from a month before until done.
    if (!contract.stampedOn && contract.startDate && daysBetween(contract.startDate, today) <= 400) {
      const due = addDays(contract.startDate, 30);

      if (daysBetween(today, due) <= 30) items.push({ key: `stamp-${contract.id}`, kind: 'stamp', date: due, contract });
    }
  }

  for (const doc of data.documents) {
    items.push({ key: `doc-${doc.id}`, kind: 'document', date: doc.expiresOn, documentId: doc.id, documentName: doc.name });
  }

  for (const person of data.people) {
    const next = nextBirthday(today, person.birthday);

    if (next > horizon) continue;
    items.push({ key: `bday-${person.id}`, kind: 'birthday', date: next, personId: person.id, personName: person.name, personPhone: person.phone });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
};
