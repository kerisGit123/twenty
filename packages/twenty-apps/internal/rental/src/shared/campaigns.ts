// Greetings, newsletters and announcements: occasions with their Malaysian
// dates, ready-made wording in English / Malay / Chinese, the newsletter
// layout for WhatsApp, and who a campaign goes to.

export type Language = 'EN' | 'MS' | 'ZH';

export const LANGUAGES: Array<{ value: Language; label: string; short: string }> = [
  { value: 'EN', label: 'English', short: 'EN' },
  { value: 'MS', label: 'Bahasa Melayu', short: 'BM' },
  { value: 'ZH', label: '中文', short: '中文' },
];

export const CAMPAIGN_KINDS = [
  { value: 'GREETING', label: 'Greeting', color: 'pink', icon: '🎉' },
  { value: 'NEWSLETTER', label: 'Newsletter', color: 'blue', icon: '📰' },
  { value: 'ANNOUNCEMENT', label: 'Announcement', color: 'orange', icon: '📣' },
  { value: 'RENTAL', label: 'Rent & receipts', color: 'green', icon: '🏠' },
] as const;

export const CAMPAIGN_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'gray' },
  { value: 'SCHEDULED', label: 'Scheduled', color: 'blue' },
  { value: 'SENDING', label: 'Sending', color: 'orange' },
  { value: 'DONE', label: 'Done', color: 'green' },
  { value: 'TEMPLATE', label: 'Template', color: 'purple' },
] as const;

export const kindOf = (value: string | null | undefined) => CAMPAIGN_KINDS.find((k) => k.value === value) ?? CAMPAIGN_KINDS[0];

// ---------------------------------------------------------------- occasions

type Occasion = {
  value: string;
  label: string;
  color: string;
  icon: string;
  // Dates by year (YYYY-MM-DD). Lunar / Islamic dates are the expected ones —
  // they can move by a day when officially announced.
  dates: Record<number, string>;
  approx?: boolean;
  messages: Record<Language, string>;
};

const fixed = (monthDay: string) => Object.fromEntries([2025, 2026, 2027, 2028].map((y) => [y, `${y}-${monthDay}`]));

export const OCCASIONS: Occasion[] = [
  {
    value: 'CNY',
    label: 'Chinese New Year',
    color: 'red',
    icon: '🧧',
    approx: true,
    dates: { 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26' },
    messages: {
      EN: 'Hi {name}, wishing you and your family a happy and prosperous Chinese New Year! May the new year bring good health, joy and abundance. 🧧🍊',
      MS: 'Salam {name}, Selamat Tahun Baru Cina! Semoga tahun baharu membawa kesihatan, kegembiraan dan kemakmuran kepada anda sekeluarga. 🧧🍊',
      ZH: '{name}，恭祝您和家人新春快乐，万事如意，身体健康，财源广进！🧧🍊',
    },
  },
  {
    value: 'HARI_RAYA',
    label: 'Hari Raya Aidilfitri',
    color: 'green',
    icon: '🌙',
    approx: true,
    dates: { 2025: '2025-03-31', 2026: '2026-03-20', 2027: '2027-03-10', 2028: '2028-02-27' },
    messages: {
      EN: 'Hi {name}, Selamat Hari Raya Aidilfitri! Wishing you and your family joy, peace and blessings. Maaf zahir dan batin. 🌙',
      MS: 'Salam {name}, Selamat Hari Raya Aidilfitri, maaf zahir dan batin. Semoga Syawal ini membawa kegembiraan dan keberkatan buat anda sekeluarga. 🌙',
      ZH: '{name}，祝您开斋节快乐（Selamat Hari Raya）！愿您和家人平安喜乐，福气满满。🌙',
    },
  },
  {
    value: 'HARI_RAYA_HAJI',
    label: 'Hari Raya Haji',
    color: 'turquoise',
    icon: '🕌',
    approx: true,
    dates: { 2025: '2025-06-07', 2026: '2026-05-27', 2027: '2027-05-17', 2028: '2028-05-05' },
    messages: {
      EN: 'Hi {name}, Selamat Hari Raya Aidiladha to you and your family. Wishing you a blessed celebration. 🕌',
      MS: 'Salam {name}, Selamat Hari Raya Aidiladha. Semoga hari yang mulia ini membawa keberkatan kepada anda sekeluarga. 🕌',
      ZH: '{name}，祝您哈芝节快乐（Selamat Hari Raya Aidiladha），阖家幸福安康。🕌',
    },
  },
  {
    value: 'DEEPAVALI',
    label: 'Deepavali',
    color: 'orange',
    icon: '🪔',
    approx: true,
    dates: { 2025: '2025-10-20', 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17' },
    messages: {
      EN: 'Hi {name}, Happy Deepavali! May the festival of lights bring you and your family happiness, health and prosperity. 🪔',
      MS: 'Salam {name}, Selamat Hari Deepavali! Semoga pesta cahaya ini membawa kebahagiaan, kesihatan dan kemakmuran kepada anda sekeluarga. 🪔',
      ZH: '{name}，祝您屠妖节快乐（Happy Deepavali）！愿光明为您和家人带来幸福、健康与繁荣。🪔',
    },
  },
  {
    value: 'CHRISTMAS',
    label: 'Christmas',
    color: 'green',
    icon: '🎄',
    dates: fixed('12-25'),
    messages: {
      EN: 'Hi {name}, Merry Christmas! Wishing you and your loved ones a joyful season and a wonderful year ahead. 🎄',
      MS: 'Salam {name}, Selamat Hari Krismas! Semoga anda dan orang tersayang menikmati musim perayaan yang menggembirakan. 🎄',
      ZH: '{name}，圣诞快乐！祝您和家人佳节愉快，来年一切顺利。🎄',
    },
  },
  {
    value: 'NEW_YEAR',
    label: 'New Year',
    color: 'purple',
    icon: '🎆',
    dates: fixed('01-01'),
    messages: {
      EN: 'Hi {name}, Happy New Year! Thank you for a great year — wishing you health and success in the year ahead. 🎆',
      MS: 'Salam {name}, Selamat Tahun Baru! Terima kasih atas tahun yang baik — semoga tahun ini membawa kesihatan dan kejayaan. 🎆',
      ZH: '{name}，新年快乐！感谢您过去一年的支持，祝您新的一年身体健康，事业顺利。🎆',
    },
  },
  {
    value: 'MERDEKA',
    label: 'Merdeka (National Day)',
    color: 'blue',
    icon: '🎇',
    dates: fixed('08-31'),
    messages: {
      EN: 'Hi {name}, Selamat Hari Merdeka! Happy National Day — wishing you a wonderful holiday. 🇲🇾',
      MS: 'Salam {name}, Selamat Hari Kebangsaan! Merdeka! Semoga cuti anda menyeronokkan. 🇲🇾',
      ZH: '{name}，国庆日快乐（Selamat Hari Merdeka）！祝您假期愉快。🇲🇾',
    },
  },
  {
    value: 'MALAYSIA_DAY',
    label: 'Malaysia Day',
    color: 'sky',
    icon: '🌺',
    dates: fixed('09-16'),
    messages: {
      EN: 'Hi {name}, Happy Malaysia Day! Enjoy the holiday. 🇲🇾',
      MS: 'Salam {name}, Selamat Hari Malaysia! Selamat bercuti. 🇲🇾',
      ZH: '{name}，马来西亚日快乐！祝您假期愉快。🇲🇾',
    },
  },
  {
    value: 'WESAK',
    label: 'Wesak Day',
    color: 'yellow',
    icon: '🪷',
    approx: true,
    dates: { 2025: '2025-05-12', 2026: '2026-05-31', 2027: '2027-05-20', 2028: '2028-05-09' },
    messages: {
      EN: 'Hi {name}, Happy Wesak Day! Wishing you peace, kindness and blessings. 🪷',
      MS: 'Salam {name}, Selamat Hari Wesak! Semoga anda dikurniakan kedamaian dan kebahagiaan. 🪷',
      ZH: '{name}，卫塞节快乐！祝您平安喜乐，福慧增长。🪷',
    },
  },
  {
    value: 'MID_AUTUMN',
    label: 'Mid-Autumn Festival',
    color: 'amber',
    icon: '🥮',
    approx: true,
    dates: { 2025: '2025-10-06', 2026: '2026-09-25', 2027: '2027-09-15', 2028: '2028-10-03' },
    messages: {
      EN: 'Hi {name}, Happy Mid-Autumn Festival! Wishing you a joyful reunion with your loved ones. 🥮🏮',
      MS: 'Salam {name}, Selamat Menyambut Pesta Kuih Bulan! Semoga anda menikmati saat indah bersama keluarga. 🥮🏮',
      ZH: '{name}，中秋节快乐！月圆人团圆，祝您和家人幸福美满。🥮🏮',
    },
  },
  {
    value: 'CUSTOM',
    label: 'Other',
    color: 'gray',
    icon: '✨',
    dates: {},
    messages: { EN: 'Hi {name}, ', MS: 'Salam {name}, ', ZH: '{name}，' },
  },
];

export const occasionOf = (value: string | null | undefined) => OCCASIONS.find((o) => o.value === value) ?? OCCASIONS[OCCASIONS.length - 1];

// The next date of each occasion from today, soonest first.
export const upcomingOccasions = (today: string, withinDays = 400) => {
  const year = Number(today.slice(0, 4));

  return OCCASIONS.filter((o) => o.value !== 'CUSTOM')
    .map((o) => {
      const date = [year, year + 1].map((y) => o.dates[y]).find((d) => d && d >= today);

      return date ? { occasion: o, date } : null;
    })
    .filter((x): x is { occasion: Occasion; date: string } => x !== null)
    .filter((x) => (Date.parse(x.date) - Date.parse(today)) / 86_400_000 <= withinDays)
    .sort((a, b) => a.date.localeCompare(b.date));
};

// ---------------------------------------------------------------- newsletters

export type NewsletterItem = { headline: string; text: string; link: string };

export type NewsletterContent = {
  title: string;
  intro: string;
  items: NewsletterItem[];
  closing: string;
  optOut: boolean; // add "reply STOP" at the end
};

export const EMPTY_NEWSLETTER: NewsletterContent = { title: '', intro: '', items: [{ headline: '', text: '', link: '' }], closing: '', optOut: true };

const OPT_OUT: Record<Language, string> = {
  EN: 'Reply STOP if you’d rather not get these updates.',
  MS: 'Balas STOP jika anda tidak mahu menerima kemas kini ini.',
  ZH: '如不希望再收到此类信息，请回复 STOP。',
};

// WhatsApp formatting: *bold*, _italic_; links stay as plain URLs.
export const newsletterText = (content: NewsletterContent, language: Language = 'EN') => {
  const parts: string[] = [];

  if (content.title.trim()) parts.push(`*${content.title.trim()}*`);
  if (content.intro.trim()) parts.push(content.intro.trim());
  content.items
    .filter((item) => item.headline.trim() || item.text.trim() || item.link.trim())
    .forEach((item, index, list) => {
      const lines = [
        item.headline.trim() ? `*${list.length > 1 ? `${index + 1}. ` : ''}${item.headline.trim()}*` : '',
        item.text.trim(),
        item.link.trim(),
      ].filter(Boolean);

      parts.push(lines.join('\n'));
    });
  if (content.closing.trim()) parts.push(content.closing.trim());
  if (content.optOut) parts.push(`_${OPT_OUT[language]}_`);

  return parts.join('\n\n');
};

// ---------------------------------------------------------------- audience

export type Audience = {
  tags: string[]; // people with any of these tags (TENANT, CLIENT, FRIEND...)
  tenants: 'none' | 'active' | 'all'; // tenants of contracts
  ownerIds: string[]; // limit tenants to these workspaces (empty = all yours)
  include: string[]; // people added by hand
  exclude: string[]; // people left out by hand
  fromReplies?: { campaignId: string; outcomes: string[] }; // people who answered an earlier campaign this way
};

export type SavedAudienceRow = { id: string; name: string; audience: Audience; ownerId: string | null };

export const EMPTY_AUDIENCE: Audience = { tags: [], tenants: 'active', ownerIds: [], include: [], exclude: [] };

export const PERSON_TAGS = [
  { value: 'TENANT', label: 'Tenants (tag)' },
  { value: 'CLIENT', label: 'Clients' },
  { value: 'FRIEND', label: 'Friends' },
  { value: 'FAMILY', label: 'Family' },
  { value: 'BUSINESS_PARTNER', label: 'Business partners' },
];

export type Progress = {
  sent: Record<string, string>;
  skipped: Record<string, string>;
  cycle?: string; // the round these ticks belong to (repeating campaigns)
  rolledTo?: string; // greetings: next year's draft was made for this date
};

export const EMPTY_PROGRESS: Progress = { sent: {}, skipped: {} };

// A message for one person: their language when written, else English (or
// whichever version exists), with {name} filled in.
export const messageFor = (messages: Partial<Record<Language, string>>, language: Language, firstName: string, values: Record<string, string> = {}) => {
  const text = messages[language]?.trim() || messages.EN?.trim() || messages.MS?.trim() || messages.ZH?.trim() || '';
  const named = text.replace(/\{name\}/g, firstName || '').replace(/^Hi ,/, 'Hi,').replace(/^Salam ,/, 'Salam,');

  // Other {fields} from rental data, when the campaign has them.
  return named.replace(/\{([a-z_]+)\}/g, (match, key: string) => (values[key] ? values[key] : match));
};

export type Recipient = {
  id: string; // what's ticked off: the person, or "person|thing" for rent & receipts
  personId: string;
  values: Record<string, string>; // {fields} for this message
  attachment?: { kind: 'receipt'; paymentId: string } | { kind: 'statement'; rentalId: string; year: number };
  name: string;
  firstName: string;
  phone: string | null; // E.164
  language: Language;
  reasons: string[]; // why they're in it: "Tenant · Block A-3-2", "Friend"
  status: 'pending' | 'sent' | 'skipped';
};

export type CampaignRow = {
  id: string;
  name: string;
  kind: string;
  occasion: string;
  status: string;
  sendOn: string | null;
  ownerId: string | null;
  audience: Audience;
  messages: Record<Language, string>;
  content: NewsletterContent | null;
  progress: Progress;
  media: CampaignMedia[];
  source: string; // NONE, or RENT_DUE, RECEIPTS…
  sourceOptions: SourceOptions;
  repeat: Repeat;
  createdAt: string;
};

// ---------------------------------------------------------------- media

export type CampaignMedia = { fileId: string; label: string; url: string; extension: string };

export const MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', '3gp', 'pdf'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', '3gp'];
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024; // WhatsApp's video limit
export const MAX_MEDIA_FILES = 4;

export const isVideo = (extension: string | null | undefined) => VIDEO_EXTENSIONS.includes((extension ?? '').toLowerCase());

// ---------------------------------------------------------------- from your data

// Rent & receipts campaigns: who gets it and the {fields} in the message come
// from the ledger and contracts, worked out fresh each time it's opened.

export type SourceField = { key: string; label: string; example: string };

const F = {
  name: { key: 'name', label: 'First name', example: 'Ahmad' },
  property: { key: 'property', label: 'Property', example: 'Block A-3-2' },
  payTo: { key: 'pay_to', label: 'How to pay you', example: 'Maybank 1234 5678 9012 / DuitNow 012-345 6789' },
  rent: { key: 'rent', label: 'Monthly rent', example: 'RM 1,500' },
  amountOwed: { key: 'amount_owed', label: 'Amount owed', example: 'RM 3,000' },
  months: { key: 'months', label: 'Months owed', example: 'Sep, Oct 2026' },
  dueDate: { key: 'due_date', label: 'Due date', example: '1 Sep 2026' },
  daysLate: { key: 'days_late', label: 'Days late', example: '35' },
  receiptNo: { key: 'receipt_no', label: 'Receipt no.', example: 'RCP-2026-0012' },
  amount: { key: 'amount', label: 'Amount', example: 'RM 1,500' },
  month: { key: 'month', label: 'Rent month', example: 'October 2026' },
  paidOn: { key: 'paid_on', label: 'Paid on', example: '3 Oct 2026' },
  year: { key: 'year', label: 'Year', example: '2026' },
  totalPaid: { key: 'total_paid', label: 'Total paid in the year', example: 'RM 18,000' },
  contractEnd: { key: 'contract_end', label: 'Contract ends', example: '31 Dec 2026' },
  daysLeft: { key: 'days_left', label: 'Days left', example: '86' },
  newRent: { key: 'new_rent', label: 'New rent', example: 'RM 1,600' },
  oldRent: { key: 'old_rent', label: 'Current rent', example: 'RM 1,500' },
  fromMonth: { key: 'from_month', label: 'New rent from', example: 'January 2027' },
  deposit: { key: 'deposit', label: 'Deposit held', example: 'RM 3,000' },
} satisfies Record<string, SourceField>;

export type Repeat = { every: 'NONE' | 'DAILY' | 'MONTHLY' | 'YEARLY'; day?: number; month?: number };

export const NO_REPEAT: Repeat = { every: 'NONE' };

export type SourceOptions = {
  ownerIds: string[]; // only these workspaces (empty = all yours)
  status?: 'overdue' | 'due'; // rent due: only overdue, or due this week too
  days?: number; // receipts / thank-you: look back; renewals: look ahead
  year?: number; // statements
};

export const DEFAULT_SOURCE_OPTIONS: SourceOptions = { ownerIds: [], status: 'overdue', days: 60 };

export type CampaignSource = {
  value: string;
  label: string;
  icon: string;
  description: string;
  fields: SourceField[];
  messages: Record<Language, string>;
  repeat: Repeat;
  attachment?: 'receipt' | 'statement';
};

export const CAMPAIGN_SOURCES: CampaignSource[] = [
  { value: 'NONE', label: 'People you pick', icon: '👥', description: 'Choose the audience yourself.', fields: [], messages: { EN: '', MS: '', ZH: '' }, repeat: NO_REPEAT },
  {
    value: 'RENT_DUE',
    label: 'Rent due',
    icon: '🔔',
    description: 'Tenants who owe rent — one message each, listing every month they owe.',
    fields: [F.name, F.property, F.amountOwed, F.months, F.dueDate, F.daysLate, F.rent, F.payTo],
    messages: {
      EN: 'Hi {name}, a friendly reminder that the rent for {property} for {months} ({amount_owed}) was due on {due_date}. You can pay to {pay_to}. Please let me know once it’s paid — thank you!',
      MS: 'Salam {name}, peringatan mesra: sewa {property} bagi {months} ({amount_owed}) perlu dibayar pada {due_date}. Bayaran boleh dibuat ke {pay_to}. Sila maklumkan selepas pembayaran dibuat. Terima kasih!',
      ZH: '{name}，您好！温馨提醒：{property} {months} 的租金（{amount_owed}）已于 {due_date} 到期。付款方式：{pay_to}。付款后请告知，谢谢！',
    },
    repeat: { every: 'MONTHLY', day: 5 },
  },
  {
    value: 'RECEIPTS',
    label: 'Receipts to send',
    icon: '🧾',
    description: 'Receipts issued but not sent yet — the PDF goes with the message, and it’s marked sent.',
    fields: [F.name, F.property, F.receiptNo, F.amount, F.month, F.paidOn],
    messages: {
      EN: 'Hi {name}, thank you! Here is your receipt {receipt_no} for {property} – {month} ({amount}).',
      MS: 'Salam {name}, terima kasih! Berikut resit {receipt_no} untuk {property} – {month} ({amount}).',
      ZH: '{name}，谢谢！这是 {property} {month} 的收据 {receipt_no}（{amount}）。',
    },
    repeat: { every: 'DAILY' },
    attachment: 'receipt',
  },
  {
    value: 'STATEMENTS',
    label: 'Year statements',
    icon: '📄',
    description: 'Each tenant’s rent statement for the year, as a PDF.',
    fields: [F.name, F.property, F.year, F.totalPaid],
    messages: {
      EN: 'Hi {name}, attached is your rent statement for {property} for {year} (total paid {total_paid}). Thank you for the year!',
      MS: 'Salam {name}, dilampirkan penyata sewa {property} bagi tahun {year} (jumlah dibayar {total_paid}). Terima kasih!',
      ZH: '{name}，附上 {property} {year} 年度租金结单（共付 {total_paid}）。感谢您这一年的支持！',
    },
    repeat: { every: 'YEARLY', month: 1, day: 5 },
    attachment: 'statement',
  },
  {
    value: 'RENEWALS',
    label: 'Renewal offers',
    icon: '🔁',
    description: 'Contracts ending soon — offer to renew, with the new rent.',
    fields: [F.name, F.property, F.contractEnd, F.daysLeft, F.newRent, F.rent, F.deposit],
    messages: {
      EN: 'Hi {name}, your tenancy for {property} ends on {contract_end}. Would you like to renew for another year? The rent would be {new_rent}. Reply YES and I’ll prepare the agreement.',
      MS: 'Salam {name}, perjanjian sewa {property} tamat pada {contract_end}. Adakah anda ingin menyambung untuk setahun lagi? Sewa baharu {new_rent}. Balas YA dan saya akan sediakan perjanjian.',
      ZH: '{name}，您好！{property} 的租约将于 {contract_end} 到期。请问您是否续租一年？新租金为 {new_rent}。回复 YES，我会准备合约。',
    },
    repeat: { every: 'MONTHLY', day: 1 },
  },
  {
    value: 'RENT_CHANGE',
    label: 'Rent change notice',
    icon: '📈',
    description: 'Tenants whose rent changes soon — the new amount and when.',
    fields: [F.name, F.property, F.oldRent, F.newRent, F.fromMonth],
    messages: {
      EN: 'Hi {name}, a reminder that from {from_month} the monthly rent for {property} will be {new_rent} (now {old_rent}), as agreed. Thank you!',
      MS: 'Salam {name}, peringatan: mulai {from_month} sewa bulanan {property} ialah {new_rent} (kini {old_rent}), seperti yang dipersetujui. Terima kasih!',
      ZH: '{name}，提醒您：自 {from_month} 起，{property} 的月租将调整为 {new_rent}（现为 {old_rent}），如之前约定。谢谢！',
    },
    repeat: NO_REPEAT,
  },
  {
    value: 'THANK_YOU',
    label: 'Thank you for paying',
    icon: '🙏',
    description: 'Tenants who paid recently.',
    fields: [F.name, F.property, F.amount, F.month, F.paidOn],
    messages: {
      EN: 'Hi {name}, thank you for paying the rent for {property} – {month} ({amount}). Much appreciated!',
      MS: 'Salam {name}, terima kasih kerana membayar sewa {property} – {month} ({amount}). Dihargai!',
      ZH: '{name}，感谢您按时缴付 {property} {month} 的租金（{amount}）！',
    },
    repeat: NO_REPEAT,
  },
  {
    value: 'BIRTHDAYS',
    label: 'Birthdays today',
    icon: '🎂',
    description: 'People whose birthday is today.',
    fields: [F.name],
    messages: {
      EN: 'Happy birthday {name}! 🎉 Wishing you a wonderful year ahead.',
      MS: 'Selamat hari jadi {name}! 🎉 Semoga tahun ini penuh kegembiraan.',
      ZH: '{name}，生日快乐！🎉 祝您新的一岁万事如意。',
    },
    repeat: { every: 'DAILY' },
  },
];

export const sourceOf = (value: string | null | undefined) => CAMPAIGN_SOURCES.find((x) => x.value === value) ?? CAMPAIGN_SOURCES[0];

// Fill {fields}; ones without a value stay as {field} so they're easy to spot.
export const fillFields = (text: string, values: Record<string, string>) =>
  text.replace(/\{([a-z_]+)\}/g, (match, key: string) => (values[key] !== undefined && values[key] !== '' ? values[key] : match));

export const missingFields = (text: string, values: Record<string, string>) =>
  [...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))].filter((key) => key !== 'name' && !values[key]);

// The period a repeating campaign is in, e.g. '2026-10' for monthly.
export const repeatCycle = (repeat: Repeat | null | undefined, today: string) =>
  !repeat || repeat.every === 'NONE' ? '' : repeat.every === 'DAILY' ? today : repeat.every === 'MONTHLY' ? today.slice(0, 7) : today.slice(0, 4);

// The day the current cycle is ready to send.
export const cycleStart = (repeat: Repeat, today: string) => {
  const pad = (n: number) => String(n).padStart(2, '0');

  if (repeat.every === 'MONTHLY') return `${today.slice(0, 7)}-${pad(Math.min(28, Math.max(1, repeat.day ?? 1)))}`;
  if (repeat.every === 'YEARLY') return `${today.slice(0, 4)}-${pad(repeat.month ?? 1)}-${pad(Math.min(28, Math.max(1, repeat.day ?? 1)))}`;

  return today;
};
