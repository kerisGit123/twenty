import type { YearData, YearExpense } from 'src/logic-functions/page-data/year-data';
import { expenseGroup } from 'src/shared/expense-categories';

// Malaysian rental income (income tax, section 4(d)): rent received less the
// expenses LHDN allows against it (Public Ruling 12/2018, "Rental Income"):
// assessment, quit rent, loan interest, fire insurance, repairs and upkeep,
// service charge / sinking fund, rent collection, and renewal fees. Renovation
// and furniture are capital — not deductible. This is a working sheet for the
// owner or tax agent, not tax advice.

export type TaxClass = {
  key: string;
  label: string; // English
  ms: string; // Malay, as on LHDN guides
  categories: string[];
  note?: string; // shown when the class has spending
};

export const TAX_CLASSES: TaxClass[] = [
  { key: 'ASSESSMENT', label: 'Assessment tax', ms: 'Cukai taksiran', categories: ['ASSESSMENT_TAX'] },
  { key: 'QUIT_RENT', label: 'Quit rent', ms: 'Cukai tanah', categories: ['QUIT_RENT'] },
  {
    key: 'INTEREST',
    label: 'Housing loan interest',
    ms: 'Faedah pinjaman',
    categories: ['LOAN_INTEREST'],
    note: 'Only the interest is deductible, not the principal. Use the bank’s yearly interest statement if you recorded full instalments.',
  },
  { key: 'INSURANCE', label: 'Fire insurance', ms: 'Insurans kebakaran', categories: ['INSURANCE'] },
  { key: 'SERVICE', label: 'Service charge & sinking fund', ms: 'Caj perkhidmatan & kumpulan wang penjelas', categories: ['MANAGEMENT_FEE', 'SINKING_FUND'] },
  {
    key: 'REPAIRS',
    label: 'Repairs & maintenance',
    ms: 'Pembaikan & penyelenggaraan',
    categories: ['REPAIRS', 'CLEANING', 'PEST_CONTROL', 'GARDENING'],
    note: 'Repairs that restore the property are deductible; upgrades and improvements are not.',
  },
  {
    key: 'COLLECTION',
    label: 'Rent collection & agent commission',
    ms: 'Kutipan sewa & komisen ejen',
    categories: ['AGENT_FEE'],
    note: 'Agent commission for finding a replacement tenant (or renewing) is deductible; for the very first tenancy it is not.',
  },
  {
    key: 'RENEWAL',
    label: 'Renewal stamp duty & legal fees',
    ms: 'Duti setem & fi guaman pembaharuan',
    categories: ['STAMP_DUTY', 'LEGAL_STAMP_DUTY'],
    note: 'Only for renewing a tenancy; the first agreement’s stamp duty and legal fees are not deductible.',
  },
];

// Property costs that aren't rental deductions.
export const CAPITAL_CATEGORIES = ['RENOVATION', 'FURNISHING'];

const CLASS_OF = new Map(TAX_CLASSES.flatMap((c) => c.categories.map((category) => [category, c.key] as const)));

export type TaxLine = { key: string; label: string; ms: string; amount: number; count: number; note?: string };

export type TaxProperty = {
  id: string;
  name: string;
  income: number;
  lines: TaxLine[];
  deductible: number;
  net: number; // income - deductible
  capital: number;
  other: number; // other property-area spending, not on LHDN's list
};

export type TaxPack = {
  year: number;
  properties: TaxProperty[];
  income: number;
  deductible: number;
  net: number; // sum of properties' net, losses included
  taxable: number; // all rentals are one source: a loss on one property offsets the others, but an overall loss can't reduce other income
  capital: number;
  other: number;
  unlinked: YearExpense[]; // deductible-type costs not linked to a property
  noBill: YearExpense[]; // deductible claims without a bill
};

const round = (value: number) => Math.round(value * 100) / 100;

export const buildTaxPack = (data: YearData, ownerId: string): TaxPack => {
  const year = String(data.year);
  const mine = (row: { ownerId: string | null }) => !ownerId || row.ownerId === ownerId;
  const rent = data.payments.filter((p) => mine(p) && p.type === 'RENT' && p.date.startsWith(year));
  const expenses = data.expenses.filter((e) => mine(e) && e.date.startsWith(year));
  const ids = new Set([...rent.map((p) => p.propertyId), ...expenses.filter((e) => e.propertyId).map((e) => e.propertyId)].filter(Boolean) as string[]);

  const properties: TaxProperty[] = [...ids].map((id) => {
    const name = data.properties.find((p) => p.id === id)?.name ?? 'Property';
    const income = round(rent.filter((p) => p.propertyId === id).reduce((s, p) => s + p.amount, 0));
    const own = expenses.filter((e) => e.propertyId === id);
    const lines: TaxLine[] = TAX_CLASSES.map((c) => {
      const rows = own.filter((e) => CLASS_OF.get(e.category) === c.key);

      return { key: c.key, label: c.label, ms: c.ms, amount: round(rows.reduce((s, e) => s + e.amount, 0)), count: rows.length, note: c.note };
    }).filter((line) => line.count > 0);
    const deductible = round(lines.reduce((s, l) => s + l.amount, 0));
    const capital = round(own.filter((e) => CAPITAL_CATEGORIES.includes(e.category)).reduce((s, e) => s + e.amount, 0));
    const other = round(
      own.filter((e) => !CLASS_OF.has(e.category) && !CAPITAL_CATEGORIES.includes(e.category)).reduce((s, e) => s + e.amount, 0),
    );

    return { id, name, income, lines, deductible, net: round(income - deductible), capital, other };
  });

  properties.sort((a, b) => b.income - a.income || a.name.localeCompare(b.name));

  const claimed = expenses.filter((e) => e.propertyId && CLASS_OF.has(e.category));

  return {
    year: data.year,
    properties,
    income: round(properties.reduce((s, p) => s + p.income, 0)),
    deductible: round(properties.reduce((s, p) => s + p.deductible, 0)),
    net: round(properties.reduce((s, p) => s + p.net, 0)),
    taxable: Math.max(0, round(properties.reduce((s, p) => s + p.net, 0))),
    capital: round(properties.reduce((s, p) => s + p.capital, 0)),
    other: round(properties.reduce((s, p) => s + p.other, 0)),
    unlinked: expenses.filter((e) => !e.propertyId && (CLASS_OF.has(e.category) || expenseGroup(e.category).area === 'PROPERTY')),
    noBill: claimed.filter((e) => !e.hasBill),
  };
};
