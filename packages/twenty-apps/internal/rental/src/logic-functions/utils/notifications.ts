import { type CoreApiClient } from 'twenty-client-sdk/core';

import { loadTodayData, type TodayData } from 'src/logic-functions/page-data/today-data';
import { todayIso } from 'src/logic-functions/utils/dates';
import { resolveScope, SYSTEM } from 'src/logic-functions/utils/scope';
import { sendWhatsappMessage, toE164, whatsappConfig } from 'src/logic-functions/utils/whatsapp';
import { addDays, type AgendaItem, agendaItems, daysBetween } from 'src/shared/agenda';

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

const reminderText = (kind: 'RENT_UPCOMING' | 'RENT_DUE' | 'RENT_OVERDUE', item: AgendaItem, language: 'EN' | 'MS') => {
  const c = item.contract as NonNullable<AgendaItem['contract']>;
  const name = firstName(c.tenantName);
  const m = month(item.month ?? item.date, language);
  const amount = rm(item.amount ?? c.rent);
  const due = day(item.date, language);

  if (language === 'MS') {
    if (kind === 'RENT_UPCOMING') return `Salam ${name}, peringatan mesra bahawa sewa ${c.propertyName} bagi ${m} (${amount}) perlu dibayar pada ${due}. Terima kasih!`;
    if (kind === 'RENT_DUE') return `Salam ${name}, sewa ${c.propertyName} bagi ${m} (${amount}) perlu dibayar hari ini. Sila maklumkan selepas pembayaran dibuat. Terima kasih!`;

    return `Salam ${name}, rekod kami menunjukkan sewa ${c.propertyName} bagi ${m} (${amount}) yang perlu dibayar pada ${due} belum diterima. Jika sudah dibayar, sila hantar slip pembayaran. Terima kasih!`;
  }
  if (kind === 'RENT_UPCOMING') return `Hi ${name}, a friendly reminder that the rent for ${c.propertyName} for ${m} (${amount}) is due on ${due}. Thank you!`;
  if (kind === 'RENT_DUE') return `Hi ${name}, the rent for ${c.propertyName} for ${m} (${amount}) is due today. Please let us know once it's paid. Thank you!`;

  return `Hi ${name}, our records show the rent for ${c.propertyName} for ${m} (${amount}), due on ${due}, hasn't been received yet. If you've already paid, please send the payment slip. Thank you!`;
};

export const buildReminders = (data: Data, today: string, settings: NotificationSettings): Outgoing[] => {
  const out: Outgoing[] = [];

  for (const item of agendaItems(data, today)) {
    if ((item.kind !== 'due' && item.kind !== 'overdue') || !item.contract || !item.month) continue;

    const due = item.date;
    const ref = `${item.contract.id}:${item.month.slice(0, 7)}`;
    let kind: 'RENT_UPCOMING' | 'RENT_DUE' | 'RENT_OVERDUE' | null = null;

    if (settings.remindDaysBefore > 0 && today >= addDays(due, -settings.remindDaysBefore) && today < due) kind = 'RENT_UPCOMING';
    else if (settings.remindOnDueDay && today === due) kind = 'RENT_DUE';
    // Overdue reminder once, and only for rent that fell due in the last 45 days.
    else if (settings.remindDaysAfter > 0 && today >= addDays(due, settings.remindDaysAfter) && daysBetween(due, today) <= 45) kind = 'RENT_OVERDUE';

    if (!kind) continue;

    const c = item.contract;
    const template =
      kind === 'RENT_OVERDUE' ? process.env.TWILIO_OVERDUE_TEMPLATE_SID?.trim() : process.env.TWILIO_REMINDER_TEMPLATE_SID?.trim();

    out.push({
      kind,
      dedupKey: `${kind}:${ref}`,
      title: `${c.propertyName} · ${month(item.month)} · ${c.tenantName}`,
      to: toE164(c.tenantPhone),
      body: reminderText(kind, item, settings.tenantLanguage),
      templateSid: template || undefined,
      templateVariables: {
        '1': firstName(c.tenantName),
        '2': c.propertyName,
        '3': month(item.month, settings.tenantLanguage),
        '4': rm(item.amount ?? c.rent),
        '5': day(due, settings.tenantLanguage),
      },
    });
  }

  return out;
};

// ---------------------------------------------------------------- sending + log

type LogRow = { dedupKey: string; status: string };

const loadLog = async (client: CoreApiClient, keys: string[]): Promise<LogRow[]> => {
  if (keys.length === 0) return [];
  const { notificationLogs } = await client.query({
    notificationLogs: {
      __args: { filter: { dedupKey: { in: keys } }, first: 1000 },
      edges: { node: { dedupKey: true, status: true } },
    },
  });

  return (notificationLogs?.edges ?? []).map(({ node }) => ({ dedupKey: node.dedupKey ?? '', status: (node.status as string | null) ?? '' }));
};

const writeLog = async (client: CoreApiClient, message: Outgoing, status: 'SENT' | 'FAILED' | 'SKIPPED', error = '') => {
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
const deliver = async (client: CoreApiClient, messages: Outgoing[]) => {
  const log = await loadLog(client, messages.map((m) => m.dedupKey));
  const result = { sent: 0, failed: 0, skipped: 0, already: 0 };

  for (const message of messages) {
    const rows = log.filter((row) => row.dedupKey === message.dedupKey);

    if (rows.some((row) => row.status === 'SENT' || row.status === 'SKIPPED') || rows.filter((row) => row.status === 'FAILED').length >= 3) {
      result.already += 1;
      continue;
    }
    if (!message.to) {
      await writeLog(client, message, 'SKIPPED', 'No WhatsApp number on file.');
      result.skipped += 1;
      continue;
    }
    try {
      await sendWhatsappMessage({ to: message.to, body: message.body, templateSid: message.templateSid, templateVariables: message.templateVariables });
      await writeLog(client, message, 'SENT');
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
  if (wantReminders) messages.push(...buildReminders(data, today, settings));

  const result = await deliver(client, messages);

  return {
    configured: true,
    summary: `${result.sent} sent, ${result.failed} failed, ${result.skipped} without a number, ${result.already} already done.`,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
  };
};

// Today's summary text, without sending (for the preview).
export const previewSummary = async (client: CoreApiClient) => buildSummary(await loadData(client), todayIso(), null).body;

// Reminders that would go out today with the given settings (for the preview).
export const previewReminders = async (client: CoreApiClient, settings: NotificationSettings) =>
  buildReminders(await loadData(client), todayIso(), settings).map((m) => ({ title: m.title, kind: m.kind, to: m.to, body: m.body }));

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

// Reminders due today that you haven't sent or skipped yet (you send them
// yourself from WhatsApp, one tap each).
export const pendingReminders = async (client: CoreApiClient): Promise<{ enabled: boolean; reminders: PendingReminder[] }> => {
  const settings = await loadNotificationSettings(client);

  if (!settings.remindersEnabled) return { enabled: false, reminders: [] };

  const messages = buildReminders(await loadData(client), todayIso(), settings);
  const done = new Set(
    (await loadLog(client, messages.map((m) => m.dedupKey)))
      .filter((row) => row.status === 'SENT' || row.status === 'SKIPPED')
      .map((row) => row.dedupKey),
  );

  return {
    enabled: true,
    reminders: messages
      .filter((m) => !done.has(m.dedupKey))
      .map((m) => ({
        dedupKey: m.dedupKey,
        kind: m.kind,
        title: m.title,
        to: m.to,
        body: m.body,
        link: m.to ? `https://wa.me/${m.to.replace('+', '')}?text=${encodeURIComponent(m.body)}` : null,
      })),
  };
};

// Records a reminder you sent yourself (or chose to skip), so it isn't
// suggested again.
export const recordManual = async (client: CoreApiClient, reminder: Omit<PendingReminder, 'link'>, status: 'SENT' | 'SKIPPED') => {
  const existing = await loadLog(client, [reminder.dedupKey]);

  if (existing.some((row) => row.status === 'SENT' || row.status === 'SKIPPED')) return;
  await writeLog(
    client,
    { kind: reminder.kind, dedupKey: reminder.dedupKey, title: `${status === 'SENT' ? 'You sent' : 'Skipped'} · ${reminder.title}`, to: reminder.to, body: reminder.body },
    status,
  );
};
