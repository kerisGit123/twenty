import { ACCENTS } from 'src/logic-functions/utils/receipt-settings';
import { type ShowIf, type TemplateContext, type TemplateLanguage } from 'src/shared/doc-template/types';
import { type StatementSource, statementFacts } from 'src/shared/year-statement';

// Turns a receipt or a year statement into a TemplateContext in English or
// Malay: placeholder values, conditions and the data for special blocks.


const MONTHS: Record<TemplateLanguage, string[]> = {
  EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  MS: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
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
};

export const money = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// '2026-10-05' -> '5 Oct 2026' / '5 Okt 2026'
export const formatDay = (iso: string | null | undefined, language: TemplateLanguage) => {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const name = MONTHS[language][month - 1] ?? '';

  return `${day} ${language === 'MS' && name === 'Ogos' ? 'Ogo' : name.slice(0, 3)} ${year}`;
};

export const formatMonth = (iso: string | null | undefined, language: TemplateLanguage) => {
  if (!iso) return '';
  const [year, month] = iso.slice(0, 7).split('-').map(Number);

  return `${MONTHS[language][month - 1]} ${year}`;
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

export const ringgitWords = (amount: number, language: TemplateLanguage) => {
  const cents = Math.round(amount * 100);
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

export const receiptContext = (facts: ReceiptFacts, language: TemplateLanguage, signatureUrl?: string | null): TemplateContext => {
  const isDeposit = facts.depositKind !== null;
  const depositLabel =
    facts.depositKind === 'UTILITY_DEPOSIT'
      ? language === 'MS' ? 'Deposit utiliti' : 'Utility deposit'
      : language === 'MS' ? 'Deposit sekuriti' : 'Security deposit';
  const period = facts.periodMonth;
  const lastDay = period ? new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate() : 0;
  const periodFrom = period ? formatDay(`${period.slice(0, 7)}-01`, language) : '';
  const periodTo = period ? formatDay(`${period.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`, language) : '';
  const purpose = isDeposit
    ? depositLabel
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
    },
    flags,
    amount: { text: money(facts.amount), words: ringgitWords(facts.amount, language) },
    methods: METHODS[language].map((m) => ({ label: m.label, selected: m.value === facts.method })),
    months: [],
    total: money(facts.amount),
    notes: [],
    watermark: facts.watermark,
    accent: ACCENTS[facts.accent as keyof typeof ACCENTS] ?? ACCENTS.TEAL,
    signatureUrl: signatureUrl ?? null,
  };
};

// ---------------------------------------------------------------- statements

export const statementContext = (
  source: StatementSource,
  language: TemplateLanguage,
  accent = 'BLACK',
  signatureUrl?: string | null,
): TemplateContext => {
  const facts = statementFacts(source);
  const ms = language === 'MS';
  const premises = facts.isShop ? (ms ? 'kedai' : 'shop') : ms ? 'premis' : 'premises';
  const unpaid = facts.unpaidMonths.map((index) => MONTHS[language][index]).join(', ');
  const notes: string[] = [];

  if (source.rental.stampedOn) {
    notes.push(ms ? `Perjanjian sewa disetemkan pada ${formatDay(source.rental.stampedOn, 'MS')}.` : `The tenancy agreement was stamped on ${formatDay(source.rental.stampedOn, 'EN')}.`);
  }
  if (facts.startedBy) {
    notes.push(ms ? `Sewa mula dikira secara rasmi pada ${formatMonth(facts.startedBy, 'MS')}.` : `Rent officially started in ${formatMonth(facts.startedBy, 'EN')}.`);
  }
  if (facts.endedBy) {
    notes.push(ms ? `Perjanjian sewa tamat pada ${formatDay(facts.endedBy, 'MS')}.` : `The tenancy ended on ${formatDay(facts.endedBy, 'EN')}.`);
  }
  for (const index of facts.fromDepositMonths) {
    const month = `${MONTHS[language][index]} ${source.year}`;

    notes.push(ms ? `Bagi bulan ${month}, sewa telah dipotong daripada deposit.` : `Rent for ${month} was taken from the deposit.`);
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
      date: `${d}/${m}/${y}`,
      year: String(source.year),
      'last.year': String(source.year - 1),
      premises,
      total: money(facts.total),
      'months.count': String(facts.rows.length),
      'arrears.months': unpaid,
    },
    flags,
    amount: { text: money(facts.total), words: ringgitWords(facts.total, language) },
    methods: [],
    months: facts.rows.map((row) => ({ month: MONTHS[language][row.index].toUpperCase(), amount: money(row.amount) })),
    total: money(facts.total),
    notes,
    watermark: null,
    accent: ACCENTS[accent as keyof typeof ACCENTS] ?? ACCENTS.BLACK,
    signatureUrl: signatureUrl ?? null,
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
  ],
};
