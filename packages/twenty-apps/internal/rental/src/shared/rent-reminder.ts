// Rent reminder wording, in the tenant's language: used by the automatic
// reminders, the reminder list and the Today page's WhatsApp button, so a
// tenant gets the same message whichever way it goes.

export type ReminderLanguage = 'EN' | 'MS' | 'ZH';
export type ReminderKind = 'RENT_UPCOMING' | 'RENT_DUE' | 'RENT_OVERDUE';

const MONTHS: Record<ReminderLanguage, string[]> = {
  EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  MS: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
  ZH: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
};

export const rmText = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// '2026-10-05' -> '5 Oct' / '5 Okt' / '10月5日'
export const reminderDay = (iso: string, language: ReminderLanguage = 'EN') =>
  language === 'ZH'
    ? `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`
    : `${Number(iso.slice(8, 10))} ${MONTHS[language][Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;

// '2026-10-01' -> 'October 2026' / 'Oktober 2026' / '2026年10月'
export const reminderMonth = (iso: string, language: ReminderLanguage = 'EN') =>
  language === 'ZH' ? `${iso.slice(0, 4)}年${MONTHS.ZH[Number(iso.slice(5, 7)) - 1]}` : `${MONTHS[language][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export const reminderMonths = (months: string[], language: ReminderLanguage) => {
  const names = [...months].sort().map((m) => reminderMonth(m, language));

  if (names.length <= 1) return names.join('');
  if (language === 'ZH') return names.join('、');

  return `${names.slice(0, -1).join(', ')} ${language === 'MS' ? 'dan' : 'and'} ${names[names.length - 1]}`;
};

// The tenant's language when they've chosen Malay or Chinese (everyone
// starts as English, so English means "not chosen"), else the fallback.
export const languageFor = (tenantLanguage: string | null | undefined, fallback: ReminderLanguage = 'EN'): ReminderLanguage =>
  tenantLanguage === 'MS' || tenantLanguage === 'ZH' ? tenantLanguage : fallback;

export type ReminderItem = { month: string; amount: number; received?: number; date: string };

export const rentReminderText = (
  kind: ReminderKind,
  items: ReminderItem[],
  contract: { tenantName: string; propertyName: string },
  language: ReminderLanguage,
) => {
  const name = contract.tenantName.trim().split(/\s+/)[0] || contract.tenantName;
  const sorted = [...items].sort((a, b) => a.month.localeCompare(b.month));
  const m = reminderMonths(sorted.map((i) => i.month), language);
  const total = rmText(sorted.reduce((sum, i) => sum + i.amount, 0));
  const many = sorted.length > 1;
  const part = sorted.some((i) => i.received);
  const due = reminderDay(sorted[0]?.date ?? '', language);
  const p = contract.propertyName;

  if (language === 'ZH') {
    const amount = `${many ? '共' : ''}${total}${part ? '，部分付款后的余额' : ''}`;

    if (kind === 'RENT_UPCOMING') return `${name}您好，温馨提醒：${p} ${m}的租金（${amount}）将于${due}到期。谢谢！`;
    if (kind === 'RENT_DUE') return `${name}您好，${p} ${m}的租金（${amount}）今天到期，付款后请告知我们。谢谢！`;

    return `${name}您好，我们的记录显示 ${p} ${m}的租金（${amount}）尚未收到。如已付款，请发送付款单据。谢谢！`;
  }

  const amount = `${total}${many ? (language === 'MS' ? ' kesemuanya' : ' in total') : ''}${part ? (language === 'MS' ? ', baki selepas bayaran separa' : ', the balance after part-payment') : ''}`;

  if (language === 'MS') {
    if (kind === 'RENT_UPCOMING') return `Salam ${name}, peringatan mesra bahawa sewa ${p} bagi ${m} (${amount}) perlu dibayar pada ${due}. Terima kasih!`;
    if (kind === 'RENT_DUE') return `Salam ${name}, sewa ${p} bagi ${m} (${amount}) perlu dibayar hari ini. Sila maklumkan selepas pembayaran dibuat. Terima kasih!`;

    return `Salam ${name}, rekod kami menunjukkan sewa ${p} bagi ${m} (${amount}) belum diterima. Jika sudah dibayar, sila hantar slip pembayaran. Terima kasih!`;
  }
  if (kind === 'RENT_UPCOMING') return `Hi ${name}, a friendly reminder that the rent for ${p} for ${m} (${amount}) is due on ${due}. Thank you!`;
  if (kind === 'RENT_DUE') return `Hi ${name}, the rent for ${p} for ${m} (${amount}) is due today. Please let us know once it's paid. Thank you!`;

  return `Hi ${name}, our records show the rent for ${p} for ${m} (${amount}) hasn't been received yet. If you've already paid, please send the payment slip. Thank you!`;
};
