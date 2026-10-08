import { ACCENTS } from 'src/logic-functions/utils/receipt-settings';
import { byLanguage, type ContextImages, type ShowIf, type TemplateContext, type TemplateLanguage } from 'src/shared/doc-template/types';
import { type StatementSource, statementFacts } from 'src/shared/year-statement';

// Turns a receipt or a year statement into a TemplateContext in English,
// Malay or Chinese: placeholder values, conditions and the data for special
// blocks.

// Letterhead images and how tenants pay, from Receipt settings.
export type LetterheadExtras = ContextImages & { paymentDetails?: string | null };


const MONTHS: Record<TemplateLanguage, string[]> = {
  EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  MS: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
  ZH: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
};

const METHODS: Record<TemplateLanguage, Array<{ value: string; label: string }>> = {
  EN: [
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK_TRANSFER', label: 'Bank transfer' },
    { value: 'DUITNOW', label: 'DuitNow' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'OTHER', label: 'Other' },
    { value: 'FROM_DEPOSIT', label: 'From deposit' },
  ],
  MS: [
    { value: 'CASH', label: 'Tunai' },
    { value: 'BANK_TRANSFER', label: 'Pindahan bank' },
    { value: 'DUITNOW', label: 'DuitNow' },
    { value: 'CHEQUE', label: 'Cek' },
    { value: 'OTHER', label: 'Lain-lain' },
    { value: 'FROM_DEPOSIT', label: 'Daripada deposit' },
  ],
  ZH: [
    { value: 'CASH', label: '现金' },
    { value: 'BANK_TRANSFER', label: '银行转账' },
    { value: 'DUITNOW', label: 'DuitNow' },
    { value: 'CHEQUE', label: '支票' },
    { value: 'OTHER', label: '其他' },
    { value: 'FROM_DEPOSIT', label: '从按金扣除' },
  ],
};

export const money = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// '2026-10-05' -> '5 Oct 2026' / '5 Okt 2026' / '2026年10月5日'
export const formatDay = (iso: string | null | undefined, language: TemplateLanguage) => {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);

  if (language === 'ZH') return `${year}年${month}月${day}日`;
  const name = MONTHS[language][month - 1] ?? '';

  return `${day} ${language === 'MS' && name === 'Ogos' ? 'Ogo' : name.slice(0, 3)} ${year}`;
};

// A month of a year: 'October 2026' / '2026年十月'
const monthOfYear = (index: number, year: number | string, language: TemplateLanguage) =>
  language === 'ZH' ? `${year}年${MONTHS.ZH[index]}` : `${MONTHS[language][index]} ${year}`;

export const formatMonth = (iso: string | null | undefined, language: TemplateLanguage) => {
  if (!iso) return '';
  const [year, month] = iso.slice(0, 7).split('-').map(Number);

  return monthOfYear(month - 1, year, language);
};

// ---------------------------------------------------------------- amount in words

const EN_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const MS_ONES = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Lapan', 'Sembilan'];

const enUnderThousand = (n: number) => {
  const parts: string[] = [];
  const rest = n % 100;

  if (n >= 100) parts.push(`${EN_ONES[Math.floor(n / 100)]} Hundred`);
  if (rest) parts.push(rest < 20 ? EN_ONES[rest] : [EN_TENS[Math.floor(rest / 10)], EN_ONES[rest % 10]].filter(Boolean).join('-'));

  return parts.join(' ');
};

const msUnderThousand = (n: number) => {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;

  if (hundreds) parts.push(hundreds === 1 ? 'Seratus' : `${MS_ONES[hundreds]} Ratus`);
  if (rest === 10) parts.push('Sepuluh');
  else if (rest === 11) parts.push('Sebelas');
  else if (rest > 11 && rest < 20) parts.push(`${MS_ONES[rest - 10]} Belas`);
  else if (rest >= 20) parts.push([`${MS_ONES[Math.floor(rest / 10)]} Puluh`, MS_ONES[rest % 10]].filter(Boolean).join(' '));
  else if (rest) parts.push(MS_ONES[rest]);

  return parts.join(' ');
};

const integerWords = (value: number, language: TemplateLanguage) => {
  if (value === 0) return language === 'MS' ? 'Kosong' : 'Zero';

  const scales = language === 'MS' ? ['', 'Ribu', 'Juta', 'Bilion'] : ['', 'Thousand', 'Million', 'Billion'];
  const groups: string[] = [];
  let remaining = Math.floor(value);
  let scale = 0;

  while (remaining > 0 && scale < scales.length) {
    const chunk = remaining % 1000;

    if (chunk) {
      groups.unshift(
        language === 'MS' && chunk === 1 && scale === 1
          ? 'Seribu'
          : [language === 'MS' ? msUnderThousand(chunk) : enUnderThousand(chunk), scales[scale]].filter(Boolean).join(' '),
      );
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }

  return groups.join(' ');
};

// Chinese receipts write amounts in financial numerals (壹贰叁…), which
// can't be altered by adding a stroke.
const ZH_DIGITS = '零壹贰叁肆伍陆柒捌玖';
const ZH_UNITS = ['', '拾', '佰', '仟'];
const ZH_BIG = ['', '万', '亿'];

const zhSection = (n: number) => {
  let out = '';
  let zero = false;

  for (let place = 3; place >= 0; place -= 1) {
    const digit = Math.floor(n / 10 ** place) % 10;

    if (!digit) {
      if (out) zero = true;
      continue;
    }
    if (zero) out += '零';
    zero = false;
    out += ZH_DIGITS[digit] + ZH_UNITS[place];
  }

  return out;
};

const zhInteger = (value: number) => {
  if (!value) return '零';

  const sections: number[] = [];

  for (let rest = Math.floor(value); rest > 0 && sections.length < ZH_BIG.length; rest = Math.floor(rest / 10000)) sections.push(rest % 10000);

  let out = '';
  let gap = false;

  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const section = sections[index];

    if (!section) {
      gap = Boolean(out);
      continue;
    }
    if (out && (gap || section < 1000)) out += '零';
    out += zhSection(section) + ZH_BIG[index];
    gap = false;
  }

  return out;
};

export const ringgitWords = (amount: number, language: TemplateLanguage) => {
  const cents = Math.round(amount * 100);

  // 整 ("exactly") only closes a whole-ringgit amount.
  if (language === 'ZH') return `马币${zhInteger(Math.floor(cents / 100))}令吉${cents % 100 ? `${zhInteger(cents % 100)}仙` : '整'}`;
  const ringgit = `Ringgit Malaysia ${integerWords(Math.floor(cents / 100), language)}`;
  const sen = cents % 100;
  const only = language === 'MS' ? 'Sahaja' : 'Only';
  const and = language === 'MS' ? 'dan' : 'and';

  return sen ? `${ringgit} ${and} Sen ${integerWords(sen, language)} ${only}` : `${ringgit} ${only}`;
};

// ---------------------------------------------------------------- receipts

// What a receipt is drawn from (saved with final receipts so they reprint the same).
export type ReceiptFacts = {
  businessName: string;
  businessDetails: string;
  footerText: string;
  titleRent: string;
  titleDeposit: string;
  receiptNumber: string;
  dateIso: string;
  paidOnIso: string;
  tenantName: string;
  amount: number;
  propertyName: string;
  propertyAddress: string;
  periodMonth: string | null; // YYYY-MM-DD, rent only
  depositKind: 'DEPOSIT' | 'UTILITY_DEPOSIT' | null;
  method: string | null;
  receivedBy: string;
  notes: string;
  accent: string;
  watermark: 'DRAFT' | 'VOID' | null;
};

export const receiptContext = (facts: ReceiptFacts, language: TemplateLanguage, extras: LetterheadExtras = {}): TemplateContext => {
  const isDeposit = facts.depositKind !== null;
  const depositLabel =
    facts.depositKind === 'UTILITY_DEPOSIT'
      ? byLanguage(language, 'Utility deposit', 'Deposit utiliti', '水电按金')
      : byLanguage(language, 'Security deposit', 'Deposit sekuriti', '租赁按金');
  const period = facts.periodMonth;
  const lastDay = period ? new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate() : 0;
  const periodFrom = period ? formatDay(`${period.slice(0, 7)}-01`, language) : '';
  const periodTo = period ? formatDay(`${period.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`, language) : '';
  const purpose = isDeposit
    ? depositLabel
    : language === 'ZH'
      ? `${period ? formatMonth(period, language) : ''}租金`
      : `${language === 'MS' ? 'Sewa' : 'Rent'}${period ? ` ${language === 'MS' ? 'bagi' : 'for'} ${formatMonth(period, language)}` : ''}`;
  const method = METHODS[language].find((m) => m.value === facts.method)?.label ?? '-';
  const flags: ShowIf[] = [isDeposit ? 'deposit' : 'rent'];

  if (facts.notes.trim()) flags.push('hasNotes');

  return {
    values: {
      'business.name': facts.businessName,
      'business.details': facts.businessDetails,
      'receipt.title': isDeposit ? facts.titleDeposit : facts.titleRent,
      'receipt.number': facts.receiptNumber,
      'receipt.date': formatDay(facts.dateIso, language),
      'tenant.name': facts.tenantName,
      amount: money(facts.amount),
      'amount.words': ringgitWords(facts.amount, language),
      property: [facts.propertyName, facts.propertyAddress].filter(Boolean).join(' - '),
      'property.name': facts.propertyName,
      'period.from': periodFrom,
      'period.to': periodTo,
      period: period ? `${periodFrom} - ${periodTo}` : '',
      'rent.month': period ? formatMonth(period, language) : '',
      purpose,
      method,
      'paid.on': formatDay(facts.paidOnIso, language),
      'received.by': facts.receivedBy,
      notes: facts.notes,
      footer: facts.footerText,
      'pay.to': extras.paymentDetails?.trim() ?? '',
    },
    flags,
    amount: { text: money(facts.amount), words: ringgitWords(facts.amount, language) },
    methods: METHODS[language].map((m) => ({ label: m.label, selected: m.value === facts.method })),
    months: [],
    total: money(facts.amount),
    notes: [],
    watermark: facts.watermark,
    accent: ACCENTS[facts.accent as keyof typeof ACCENTS] ?? ACCENTS.TEAL,
    signatureUrl: extras.signatureUrl ?? null,
    logoUrl: extras.logoUrl ?? null,
    paymentQrUrl: extras.paymentQrUrl ?? null,
  };
};

// ---------------------------------------------------------------- statements

export const statementContext = (
  source: StatementSource,
  language: TemplateLanguage,
  accent = 'BLACK',
  extras: LetterheadExtras = {},
): TemplateContext => {
  const facts = statementFacts(source);
  const t = (en: string, ms: string, zh: string) => byLanguage(language, en, ms, zh);
  const premises = facts.isShop ? t('shop', 'kedai', '店铺') : t('premises', 'premis', '单位');
  const unpaid = facts.unpaidMonths.map((index) => MONTHS[language][index]).join(language === 'ZH' ? '、' : ', ');
  const notes: string[] = [];

  if (source.rental.stampedOn) {
    const day = formatDay(source.rental.stampedOn, language);

    notes.push(t(`The tenancy agreement was stamped on ${day}.`, `Perjanjian sewa disetemkan pada ${day}.`, `租约已于${day}盖印。`));
  }
  if (facts.startedBy) {
    const month = formatMonth(facts.startedBy, language);

    notes.push(t(`Rent officially started in ${month}.`, `Sewa mula dikira secara rasmi pada ${month}.`, `租金正式由${month}起计算。`));
  }
  if (facts.endedBy) {
    const day = formatDay(facts.endedBy, language);

    notes.push(t(`The tenancy ended on ${day}.`, `Perjanjian sewa tamat pada ${day}.`, `租约于${day}结束。`));
  }
  for (const index of facts.fromDepositMonths) {
    const month = monthOfYear(index, source.year, language);

    notes.push(t(`Rent for ${month} was taken from the deposit.`, `Bagi bulan ${month}, sewa telah dipotong daripada deposit.`, `${month}的租金已从按金中扣除。`));
  }
  for (const index of facts.waivedMonths) {
    const month = monthOfYear(index, source.year, language);

    notes.push(t(`Rent for ${month} was waived.`, `Sewa bagi bulan ${month} dikecualikan.`, `${month}的租金已豁免。`));
  }
  for (const part of facts.partMonths) {
    const month = monthOfYear(part.index, source.year, language);

    notes.push(
      t(
        `For ${month}, ${money(part.received)} was received; ${money(part.remaining)} is still owed.`,
        `Bagi bulan ${month}, sebanyak ${money(part.received)} telah diterima; baki ${money(part.remaining)} masih tertunggak.`,
        `${month}已收${money(part.received)}，尚欠${money(part.remaining)}。`,
      ),
    );
  }
  notes.push(...facts.extraNotes);

  const flags: ShowIf[] = [facts.unpaidMonths.length ? 'arrears' : 'settled'];

  if (notes.length) flags.push('hasNotes');

  const [y, m, d] = source.today.split('-');

  return {
    values: {
      'landlord.name': source.landlordName,
      'landlord.details': source.landlordDetails,
      'tenant.name': facts.tenantName,
      'tenant.details': facts.tenantLines.join('\n'),
      'tenant.address': facts.tenantLines.slice(1).join('\n'),
      date: language === 'ZH' ? `${y}年${Number(m)}月${Number(d)}日` : `${d}/${m}/${y}`,
      year: String(source.year),
      'last.year': String(source.year - 1),
      premises,
      total: money(facts.total),
      'months.count': String(facts.rows.length),
      'arrears.months': unpaid,
      'pay.to': extras.paymentDetails?.trim() ?? '',
    },
    flags,
    amount: { text: money(facts.total), words: ringgitWords(facts.total, language) },
    methods: [],
    months: facts.rows.map((row) => ({ month: MONTHS[language][row.index].toUpperCase(), amount: money(row.amount) })),
    total: money(facts.total),
    notes,
    watermark: null,
    accent: ACCENTS[accent as keyof typeof ACCENTS] ?? ACCENTS.BLACK,
    signatureUrl: extras.signatureUrl ?? null,
    logoUrl: extras.logoUrl ?? null,
    paymentQrUrl: extras.paymentQrUrl ?? null,
  };
};

// ---------------------------------------------------------------- placeholder lists (for the editor)

export const PLACEHOLDERS: Record<'RECEIPT' | 'STATEMENT', Array<{ key: string; label: string }>> = {
  RECEIPT: [
    { key: 'business.name', label: 'Your name / business' },
    { key: 'business.details', label: 'Your address & contact' },
    { key: 'receipt.title', label: 'Receipt title' },
    { key: 'receipt.number', label: 'Receipt no.' },
    { key: 'receipt.date', label: 'Receipt date' },
    { key: 'tenant.name', label: 'Tenant' },
    { key: 'amount', label: 'Amount' },
    { key: 'amount.words', label: 'Amount in words' },
    { key: 'property', label: 'Property & address' },
    { key: 'property.name', label: 'Property name' },
    { key: 'period', label: 'Rent period' },
    { key: 'period.from', label: 'Period from' },
    { key: 'period.to', label: 'Period to' },
    { key: 'rent.month', label: 'Rent month' },
    { key: 'purpose', label: 'Payment for' },
    { key: 'method', label: 'Payment method' },
    { key: 'paid.on', label: 'Paid on' },
    { key: 'received.by', label: 'Received by' },
    { key: 'notes', label: 'Notes' },
    { key: 'footer', label: 'Footer text' },
    { key: 'pay.to', label: 'How tenants pay you' },
  ],
  STATEMENT: [
    { key: 'landlord.name', label: 'Your name / business' },
    { key: 'landlord.details', label: 'Your address' },
    { key: 'tenant.name', label: 'Tenant' },
    { key: 'tenant.details', label: 'Tenant details (all lines)' },
    { key: 'tenant.address', label: 'Tenant details after the name' },
    { key: 'date', label: "Today's date" },
    { key: 'year', label: 'Year' },
    { key: 'last.year', label: 'Year before' },
    { key: 'premises', label: 'kedai / premis' },
    { key: 'total', label: 'Total received' },
    { key: 'months.count', label: 'Months paid' },
    { key: 'arrears.months', label: 'Months owed' },
    { key: 'pay.to', label: 'How tenants pay you' },
  ],
};
