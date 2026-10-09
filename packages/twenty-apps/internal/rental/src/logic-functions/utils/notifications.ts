import { type CoreApiClient } from 'twenty-client-sdk/core';

import { loadTodayData, type TodayData } from 'src/logic-functions/page-data/today-data';
import { todayIso } from 'src/logic-functions/utils/dates';
import { resolveScope, SYSTEM } from 'src/logic-functions/utils/scope';
import { sendWhatsappMessage, toE164, whatsappConfig } from 'src/logic-functions/utils/whatsapp';
import { addDays, type AgendaItem, agendaItems, daysBetween } from 'src/shared/agenda';
import { chaseKey, loadChases, recordChase } from 'src/logic-functions/utils/rent-chase';
import { type ChaseChannel, type ChaseInfo, isRecentChase } from 'src/shared/rent-chase';
import { languageFor, reminderMonths, rentReminderText } from 'src/shared/rent-reminder';

// The assistant: a WhatsApp summary for you each morning, and rent reminders
// for tenants (before the due day, on it, and when overdue). Runs every hour;
// a message goes out once its hour has come and it hasn't been sent yet, so a
// PC that was asleep catches up instead of missing the day.

export type NotificationSettings = {
  id: string | null;
  summaryEnabled: boolean;
  summaryPhone: string;
  summaryHour: number;
  remindersEnabled: boolean;
  reminderHour: number;
  remindDaysBefore: number;
  remindOnDueDay: boolean;
  remindDaysAfter: number;
  tenantLanguage: 'EN' | 'MS';
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  id: null,
  summaryEnabled: false,
  summaryPhone: '',
  summaryHour: 8,
  remindersEnabled: false,
  reminderHour: 10,
  remindDaysBefore: 3,
  remindOnDueDay: true,
  remindDaysAfter: 3,
  tenantLanguage: 'EN',
};

type Kind = 'SUMMARY' | 'RENT_UPCOMING' | 'RENT_DUE' | 'RENT_OVERDUE' | 'TEST';

export type Outgoing = {
  kind: Kind;
  dedupKey: string;
  title: string;
  to: string | null; // E.164, null when the person has no usable number
  body: string;
  templateSid?: string;
  templateVariables?: Record<string, string>;
};

const clampHour = (value: unknown, fallback: number) => {
  const hour = Number(value);

  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
};

const nonNegative = (value: unknown, fallback: number) => {
  const days = Number(value);

  return Number.isFinite(days) && days >= 0 ? Math.round(days) : fallback;
};

export const loadNotificationSettings = async (client: CoreApiClient): Promise<NotificationSettings> => {
  const { notificationSettings } = await client.query({
    notificationSettings: {
      __args: { first: 1, orderBy: [{ createdAt: 'AscNullsLast' }] },
      edges: {
        node: {
          id: true,
          summaryEnabled: true,
          summaryPhone: true,
          summaryHour: true,
          remindersEnabled: true,
          reminderHour: true,
          remindDaysBefore: true,
          remindOnDueDay: true,
          remindDaysAfter: true,
          tenantLanguage: true,
        },
      },
    },
  });
  const node = notificationSettings?.edges?.[0]?.node;

  if (!node) return DEFAULT_SETTINGS;

  return {
    id: node.id,
    summaryEnabled: Boolean(node.summaryEnabled),
    summaryPhone: node.summaryPhone ?? '',
    summaryHour: clampHour(node.summaryHour, 8),
    remindersEnabled: Boolean(node.remindersEnabled),
    reminderHour: clampHour(node.reminderHour, 10),
    remindDaysBefore: nonNegative(node.remindDaysBefore, 3),
    remindOnDueDay: node.remindOnDueDay !== false,
    remindDaysAfter: nonNegative(node.remindDaysAfter, 3),
    tenantLanguage: (node.tenantLanguage as string | null) === 'MS' ? 'MS' : 'EN',
  };
};

// Current hour in Malaysia (0-23).
export const malaysiaHour = (now = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', hourCycle: 'h23' }).format(now));

// ---------------------------------------------------------------- wording

const MONTHS = {
  EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  MS: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (iso: string, language: 'EN' | 'MS' = 'EN') => `${Number(iso.slice(8, 10))} ${MONTHS[language][Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
const month = (iso: string, language: 'EN' | 'MS' = 'EN') => `${MONTHS[language][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
// Your number: international (+60…) or Malaysian (012…).
export const ownNumber = (phone: string) => toE164({ primaryPhoneNumber: phone, primaryPhoneCallingCode: '+60' });

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

type Data = Omit<TodayData, 'paid'> & { paid: Set<string> };

const loadData = async (client: CoreApiClient): Promise<Data> => {
  // No person behind the assistant: every workspace.
  const raw = await loadTodayData(client, await resolveScope(client, SYSTEM));

  return { ...raw, paid: new Set(raw.paid) };
};

// ---------------------------------------------------------------- morning summary

export const buildSummary = (data: Data, today: string, to: string | null): Outgoing => {
  const items = agendaItems(data, today);
  const week = addDays(today, 7);
  const overdue = items.filter((i) => i.kind === 'overdue');
  const dueSoon = items.filter((i) => i.kind === 'due' && i.date <= week);
  const ending = items.filter((i) => i.kind === 'ending');
  const stamping = items.filter((i) => i.kind === 'stamp' && daysBetween(today, i.date) <= 14);
  const documents = items.filter((i) => i.kind === 'document' && daysBetween(today, i.date) <= 30);
  const birthdays = items.filter((i) => i.kind === 'birthday' && i.date <= week);
  const missingBills = data.expenses.filter((e) => !e.hasBill && !e.noBillNeeded);
  const repeatBills = (data.bills ?? []).filter((b) => b.nextDate <= week);
  const campaignsDue = (data.campaigns ?? []).filter((x) => x.sendOn <= today);
  const followUpsDue = (data.followUps ?? []).filter((x) => x.followUpOn <= today);
  const overdueAmount = overdue.reduce((sum, i) => sum + (i.amount ?? i.contract?.rent ?? 0), 0);
  const date = new Date(`${today}T00:00:00Z`);
  const heading = `${DAYS[date.getUTCDay()]}, ${day(today)}`;

  const list = (title: string, entries: AgendaItem[], line: (i: AgendaItem) => string) =>
    entries.length
      ? [title, ...entries.slice(0, 5).map((i) => `• ${line(i)}`), ...(entries.length > 5 ? [`  …and ${entries.length - 5} more`] : [])]
      : [];

  const lines = [
    `☀️ Good morning! ${heading}`,
    '',
    ...list(`⚠️ Overdue rent (${overdue.length} · ${rm(overdueAmount)})`, overdue, (i) => {
      const late = daysBetween(i.date, today);

      return `${i.contract?.propertyName} – ${month(i.month ?? i.date)}, ${i.contract?.tenantName} (${late} day${late === 1 ? '' : 's'} late)`;
    }),
    ...list(`📅 Rent due this week (${dueSoon.length})`, dueSoon, (i) => `${i.contract?.propertyName} – ${rm(i.amount ?? i.contract?.rent ?? 0)}, due ${day(i.date)}`),
    ...list(`📝 Contracts ending (${ending.length})`, ending, (i) => `${i.contract?.propertyName} – ${i.date < today ? 'ended' : 'ends'} ${day(i.date)}`),
    ...list(`🖋️ Agreements to stamp (${stamping.length})`, stamping, (i) => `${i.contract?.propertyName} – by ${day(i.date)}`),
    ...list(`📄 Documents expiring (${documents.length})`, documents, (i) => `${i.documentName} – ${day(i.date)}`),
    ...list(`🎂 Birthdays this week`, birthdays, (i) => `${i.personName} – ${day(i.date)}`),
    ...list(`🔁 Bills due (${repeatBills.length})`, repeatBills as never[], (i) => {
      const bill = i as unknown as (typeof repeatBills)[number];

      return `${bill.name} – ${bill.currency === 'MYR' ? rm(bill.amount) : `${bill.currency} ${bill.amount}`}, ${day(bill.nextDate)}`;
    }),
    ...list(`🎉 Campaigns to send (${campaignsDue.length})`, campaignsDue as never[], (i) => (i as unknown as (typeof campaignsDue)[number]).name),
    ...list(`⏰ Follow-ups (${followUpsDue.length})`, followUpsDue as never[], (i) => {
      const f = i as unknown as (typeof followUpsDue)[number];

      return `${f.personName}${f.note ? ` – ${f.note.slice(0, 60)}` : ''}`;
    }),
    ...(missingBills.length ? [`🧾 ${missingBills.length} expense${missingBills.length === 1 ? '' : 's'} without a bill`] : []),
  ].filter((line, index, all) => !(line === '' && all[index - 1] === ''));

  const nothing = overdue.length + dueSoon.length + ending.length + stamping.length + documents.length + birthdays.length + missingBills.length + repeatBills.length + campaignsDue.length + followUpsDue.length === 0;
  const body = (nothing ? [`☀️ Good morning! ${heading}`, '', '✅ Nothing needs your attention today.'] : lines).join('\n').slice(0, 1500);
  const others = ending.length + stamping.length + documents.length + birthdays.length + missingBills.length;

  return {
    kind: 'SUMMARY',
    dedupKey: `summary:${today}`,
    title: `Morning summary ${today}`,
    to,
    body,
    templateSid: process.env.TWILIO_SUMMARY_TEMPLATE_SID?.trim() || undefined,
    templateVariables: {
      '1': heading,
      '2': String(overdue.length),
      '3': rm(overdueAmount),
      '4': String(dueSoon.length),
      '5': String(others),
    },
  };
};

// ---------------------------------------------------------------- tenant reminders

type RentKind = 'RENT_UPCOMING' | 'RENT_DUE' | 'RENT_OVERDUE';

// One contract-month that today's settings would remind about.
type Candidate = { kind: RentKind; item: AgendaItem; key: string };

// Every contract-month today's settings would remind about, before checking
// what was already sent.
const candidates = (data: Data, today: string, settings: NotificationSettings): Candidate[] => {
  const out: Candidate[] = [];

  for (const item of agendaItems(data, today)) {
    if ((item.kind !== 'due' && item.kind !== 'overdue') || !item.contract || !item.month) continue;

    const due = item.date;
    let kind: RentKind | null = null;

    if (settings.remindDaysBefore > 0 && today >= addDays(due, -settings.remindDaysBefore) && today < due) kind = 'RENT_UPCOMING';
    else if (settings.remindOnDueDay && today === due) kind = 'RENT_DUE';
    // Overdue reminder once, and only for rent that fell due in the last 45 days.
    else if (settings.remindDaysAfter > 0 && today >= addDays(due, settings.remindDaysAfter) && daysBetween(due, today) <= 45) kind = 'RENT_OVERDUE';

    if (kind) out.push({ kind, item, key: chaseKey(kind, item.contract.id, item.month) });
  }

  return out;
};

// Reminder keys: one month "RENT_DUE:<contract>:2026-10", several
// "RENT_OVERDUE:<contract>:2026-08,2026-09" — so a reminder sent by hand can be
// recorded against each month from its key alone.
const parseKey = (key: string) => {
  const [kind, contractId, months] = key.split(':');

  return { kind: kind as RentKind, contractId, months: (months ?? '').split(',').filter(Boolean).map((m) => `${m}-01`) };
};

// Today's reminders: months not reminded yet, tenants not chased in the last
// few days by any channel, one message per tenant listing every month.
const groupReminders = (list: Candidate[], done: Set<string>, chases: Record<string, ChaseInfo>, today: string, settings: NotificationSettings): Outgoing[] => {
  const groups = new Map<string, Candidate[]>();

  for (const candidate of list) {
    const contractId = (candidate.item.contract as NonNullable<AgendaItem['contract']>).id;

    if (done.has(candidate.key) || isRecentChase(chases[contractId], today)) continue;
    groups.set(contractId, [...(groups.get(contractId) ?? []), candidate]);
  }

  const out: Outgoing[] = [];

  for (const [contractId, group] of groups) {
    // The most pressing kind speaks for the whole message.
    const kind: RentKind = group.some((g) => g.kind === 'RENT_OVERDUE') ? 'RENT_OVERDUE' : group.some((g) => g.kind === 'RENT_DUE') ? 'RENT_DUE' : 'RENT_UPCOMING';
    const items = group.map((g) => g.item).sort((a, b) => (a.month ?? '').localeCompare(b.month ?? ''));
    const c = items[0].contract as NonNullable<AgendaItem['contract']>;
    const months = items.map((i) => (i.month as string).slice(0, 7));
    const total = items.reduce((sum, i) => sum + (i.amount ?? c.rent), 0);
    const template = kind === 'RENT_OVERDUE' ? process.env.TWILIO_OVERDUE_TEMPLATE_SID?.trim() : process.env.TWILIO_REMINDER_TEMPLATE_SID?.trim();

    out.push({
      kind,
      dedupKey: `${kind}:${contractId}:${months.join(',')}`,
      title: `${c.propertyName} · ${reminderMonths(items.map((i) => i.month as string), 'EN')} · ${c.tenantName}`,
      to: toE164(c.tenantPhone),
      // The tenant's language if they chose Malay or Chinese, else the setting's.
      body: rentReminderText(
        kind,
        items.map((i) => ({ month: i.month as string, amount: i.amount ?? c.rent, received: i.received, date: i.date })),
        c,
        languageFor((c as { tenantLanguage?: string | null }).tenantLanguage, settings.tenantLanguage),
      ),
      templateSid: template || undefined,
      templateVariables: {
        '1': firstName(c.tenantName),
        '2': c.propertyName,
        '3': reminderMonths(items.map((i) => i.month as string), 'EN'),
        '4': rm(total),
        '5': day(items[0].date, 'EN'),
      },
    });
  }

  return out;
};

// ---------------------------------------------------------------- sending + log

type LogRow = { dedupKey: string; status: string };

const loadLog = async (client: CoreApiClient, keys: string[]): Promise<LogRow[]> => {
  if (keys.length === 0) return [];
  const rows: LogRow[] = [];

  // In chunks: an "in" list of thousands would be one huge query.
  for (let start = 0; start < keys.length; start += 200) {
    const { notificationLogs } = await client.query({
      notificationLogs: {
        __args: { filter: { dedupKey: { in: keys.slice(start, start + 200) } }, first: 1000 },
        edges: { node: { dedupKey: true, status: true } },
      },
    });

    rows.push(...(notificationLogs?.edges ?? []).map(({ node }) => ({ dedupKey: node.dedupKey ?? '', status: (node.status as string | null) ?? '' })));
  }

  return rows;
};

// Months already reminded (sent or deliberately skipped), by key.
const doneKeys = async (client: CoreApiClient, list: Candidate[]) =>
  new Set(
    (await loadLog(client, list.map((c) => c.key)))
      .filter((row) => row.status === 'SENT' || row.status === 'SKIPPED')
      .map((row) => row.dedupKey),
  );

// Today's reminders, after what every channel already did.
const todaysReminders = async (client: CoreApiClient, data: Data, settings: NotificationSettings) => {
  const today = todayIso();
  const list = candidates(data, today, settings);

  return groupReminders(list, await doneKeys(client, list), await loadChases(client), today, settings);
};

const writeLog = async (client: CoreApiClient, message: Outgoing, status: 'SENT' | 'FAILED' | 'SKIPPED', error = '', channel: ChaseChannel = 'AUTO') => {
  // Rent reminders go into the shared chase record, one row per month.
  if (message.kind === 'RENT_UPCOMING' || message.kind === 'RENT_DUE' || message.kind === 'RENT_OVERDUE') {
    const { contractId, months } = parseKey(message.dedupKey);

    await recordChase(client, { contractId, months, channel, status, kind: message.kind, title: message.title, to: message.to, body: message.body, error });

    return;
  }
  await client.mutation({
    createNotificationLog: {
      __args: {
        data: {
          name: message.title,
          kind: message.kind,
          recipient: message.to ?? '',
          body: message.body,
          status,
          error: error.slice(0, 500),
          dedupKey: message.dedupKey,
        } as never,
      },
      id: true,
    },
  });
};

// Sends unless it already went (or was skipped), and stops after 3 failures.
// Rent reminders only go out automatically with an approved WhatsApp
// template: WhatsApp drops a plain message to someone who hasn't written in
// the last 24 hours even though Twilio accepts it, so without a template
// they stay on your one-tap reminder list instead of being logged as sent.
const deliver = async (client: CoreApiClient, messages: Outgoing[]) => {
  const log = await loadLog(client, messages.map((m) => m.dedupKey));
  const result = { sent: 0, failed: 0, skipped: 0, already: 0, manual: 0 };

  for (const message of messages) {
    const rows = log.filter((row) => row.dedupKey === message.dedupKey);
    const isRent = message.kind === 'RENT_UPCOMING' || message.kind === 'RENT_DUE' || message.kind === 'RENT_OVERDUE';

    if (rows.some((row) => row.status === 'SENT' || row.status === 'SKIPPED') || rows.filter((row) => row.status === 'FAILED').length >= 3) {
      result.already += 1;
      continue;
    }
    if (isRent && !message.templateSid) {
      result.manual += 1;
      continue;
    }
    if (!message.to) {
      await writeLog(client, message, 'SKIPPED', 'No WhatsApp number on file.');
      result.skipped += 1;
      continue;
    }
    try {
      await sendWhatsappMessage({ to: message.to, body: message.body, templateSid: message.templateSid, templateVariables: message.templateVariables });
      await writeLog(
        client,
        message,
        'SENT',
        message.templateSid ? '' : 'Sent without a template: WhatsApp only delivers it if this number wrote to you in the last 24 hours.',
      );
      result.sent += 1;
    } catch (error) {
      await writeLog(client, message, 'FAILED', error instanceof Error ? error.message : String(error));
      result.failed += 1;
    }
  }

  return result;
};

export type RunResult = {
  configured: boolean;
  summary: string; // what happened, in a sentence
  sent: number;
  failed: number;
  skipped: number;
};

// The hourly job. `force` sends now instead of waiting for the hour.
export const runNotifications = async (client: CoreApiClient, force: { summary?: boolean; reminders?: boolean } = {}): Promise<RunResult> => {
  if (!whatsappConfig()) return { configured: false, summary: 'WhatsApp (Twilio) is not set up yet.', sent: 0, failed: 0, skipped: 0 };

  const settings = await loadNotificationSettings(client);
  const hour = malaysiaHour();
  const today = todayIso();
  const wantSummary = settings.summaryEnabled && (force.summary || hour >= settings.summaryHour);
  const wantReminders = settings.remindersEnabled && (force.reminders || hour >= settings.reminderHour);

  if (!wantSummary && !wantReminders) return { configured: true, summary: 'Nothing to send at this hour.', sent: 0, failed: 0, skipped: 0 };

  const data = await loadData(client);
  const messages: Outgoing[] = [];

  if (wantSummary) messages.push(buildSummary(data, today, ownNumber(settings.summaryPhone)));
  if (wantReminders) messages.push(...(await todaysReminders(client, data, settings)));

  const result = await deliver(client, messages);

  return {
    configured: true,
    summary:
      `${result.sent} sent, ${result.failed} failed, ${result.skipped} without a number, ${result.already} already done` +
      (result.manual ? `, ${result.manual} waiting on your reminder list (no approved WhatsApp template yet).` : '.'),
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
  };
};

// Today's summary text, without sending (for the preview).
export const previewSummary = async (client: CoreApiClient) => buildSummary(await loadData(client), todayIso(), null).body;

// Reminders that would go out today with the given settings (for the preview).
export const previewReminders = async (client: CoreApiClient, settings: NotificationSettings) =>
  (await todaysReminders(client, await loadData(client), settings)).map((m) => ({ title: m.title, kind: m.kind, to: m.to, body: m.body }));

// A test message to a number, logged as TEST.
export const sendTest = async (client: CoreApiClient, to: string) => {
  const message: Outgoing = {
    kind: 'TEST',
    dedupKey: `test:${Date.now()}`,
    title: 'Test message',
    to,
    body: '👋 Hello from your Rental assistant. WhatsApp is working — you will get your morning summary here.',
  };

  await sendWhatsappMessage({ to, body: message.body });
  await writeLog(client, message, 'SENT');
};

// ---------------------------------------------------------------- one-tap reminders

export type PendingReminder = {
  dedupKey: string;
  kind: Outgoing['kind'];
  title: string;
  to: string | null;
  body: string;
  link: string | null; // wa.me link with the message typed in
};

// Reminders due today that nobody has sent or skipped yet, by any channel
// (you send them yourself from WhatsApp, one tap each).
export const pendingReminders = async (client: CoreApiClient): Promise<{ enabled: boolean; reminders: PendingReminder[] }> => {
  const settings = await loadNotificationSettings(client);

  if (!settings.remindersEnabled) return { enabled: false, reminders: [] };

  const messages = await todaysReminders(client, await loadData(client), settings);

  return {
    enabled: true,
    reminders: messages.map((m) => ({
      dedupKey: m.dedupKey,
      kind: m.kind,
      title: m.title,
      to: m.to,
      body: m.body,
      link: m.to ? `https://wa.me/${m.to.replace('+', '')}?text=${encodeURIComponent(m.body)}` : null,
    })),
  };
};

// Records a reminder you sent yourself (or chose to skip), against each of
// its months, so no channel suggests it again.
export const recordManual = async (client: CoreApiClient, reminder: Omit<PendingReminder, 'link'>, status: 'SENT' | 'SKIPPED') => {
  const { kind, contractId, months } = parseKey(reminder.dedupKey);

  if (!contractId || !months.length) return;
  const done = await loadLog(client, months.map((m) => chaseKey(kind, contractId, m)));
  const open = months.filter((m) => !done.some((row) => row.dedupKey === chaseKey(kind, contractId, m) && (row.status === 'SENT' || row.status === 'SKIPPED')));

  if (!open.length) return;
  await recordChase(client, {
    contractId,
    months: open,
    channel: 'LIST',
    status,
    kind,
    title: `${status === 'SENT' ? 'You sent' : 'Skipped'} · ${reminder.title}`,
    to: reminder.to,
    body: reminder.body,
  });
};
