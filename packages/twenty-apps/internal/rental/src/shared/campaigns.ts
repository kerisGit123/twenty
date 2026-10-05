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
] as const;

export const CAMPAIGN_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'gray' },
  { value: 'SCHEDULED', label: 'Scheduled', color: 'blue' },
  { value: 'SENDING', label: 'Sending', color: 'orange' },
  { value: 'DONE', label: 'Done', color: 'green' },
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
    icon: '🇲🇾',
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
    icon: '🇲🇾',
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
};

export const EMPTY_AUDIENCE: Audience = { tags: [], tenants: 'active', ownerIds: [], include: [], exclude: [] };

export const PERSON_TAGS = [
  { value: 'TENANT', label: 'Tenants (tag)' },
  { value: 'CLIENT', label: 'Clients' },
  { value: 'FRIEND', label: 'Friends' },
  { value: 'FAMILY', label: 'Family' },
  { value: 'BUSINESS_PARTNER', label: 'Business partners' },
];

export type Progress = { sent: Record<string, string>; skipped: Record<string, string> };

export const EMPTY_PROGRESS: Progress = { sent: {}, skipped: {} };

// A message for one person: their language when written, else English (or
// whichever version exists), with {name} filled in.
export const messageFor = (messages: Partial<Record<Language, string>>, language: Language, firstName: string) => {
  const text = messages[language]?.trim() || messages.EN?.trim() || messages.MS?.trim() || messages.ZH?.trim() || '';

  return text.replace(/\{name\}/g, firstName || '').replace(/^Hi ,/, 'Hi,').replace(/^Salam ,/, 'Salam,');
};

export type Recipient = {
  id: string;
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
  createdAt: string;
};
