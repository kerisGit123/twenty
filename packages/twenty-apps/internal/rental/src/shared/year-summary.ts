import { EXPENSE_GROUPS, expenseCategory } from 'src/shared/expense-categories';
import type { YearData } from 'src/logic-functions/page-data/year-data';

// Adds up a year of receipts and expenses for one workspace (or all of them):
// totals against last year, month by month, by expense category and by
// property. Used by the Year summary page and its printable report.

export type YearTotals = { rent: number; expenses: number; net: number };

export type CategoryLine = { value: string; label: string; amount: number };

export type GroupLine = { key: string; label: string; color: string; amount: number; categories: CategoryLine[] };

export type PropertyLine = { id: string; name: string; rent: number; expenses: number; net: number };

export type YearSummary = {
  year: number;
  current: YearTotals;
  previous: YearTotals;
  deposits: number; // deposits received this year (held, not income)
  months: Array<YearTotals & { month: string }>; // Jan..Dec
  groups: GroupLine[];
  properties: PropertyLine[];
  propertyCount: number;
  occupied: number;
  missingBills: number;
  expenseCount: number;
};

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const totals = (rent: number, expenses: number): YearTotals => ({ rent, expenses, net: rent - expenses });

export const summariseYear = (data: YearData, ownerId: string): YearSummary => {
  const year = String(data.year);
  const last = String(data.year - 1);
  const mine = (row: { ownerId: string | null }) => !ownerId || row.ownerId === ownerId;
  const payments = data.payments.filter(mine);
  const expenses = data.expenses.filter(mine);
  const properties = data.properties.filter(mine);
  const inYear = (date: string, y: string) => date.startsWith(y);
  const sum = (rows: Array<{ amount: number }>) => rows.reduce((total, row) => total + row.amount, 0);

  const rentThis = payments.filter((p) => p.type === 'RENT' && inYear(p.date, year));
  const rentLast = payments.filter((p) => p.type === 'RENT' && inYear(p.date, last));
  const expThis = expenses.filter((e) => inYear(e.date, year));
  const expLast = expenses.filter((e) => inYear(e.date, last));

  const months = MONTH_LABELS.map((month, index) => {
    const prefix = `${year}-${String(index + 1).padStart(2, '0')}`;

    return {
      month,
      ...totals(sum(rentThis.filter((p) => p.date.startsWith(prefix))), sum(expThis.filter((e) => e.date.startsWith(prefix)))),
    };
  });

  const groups: GroupLine[] = EXPENSE_GROUPS.map((group) => {
    const byCategory = new Map<string, CategoryLine>();

    for (const expense of expThis) {
      const category = expenseCategory(expense.category);

      if (category.group !== group.key) continue;

      const line = byCategory.get(category.value) ?? { value: category.value, label: category.label, amount: 0 };

      line.amount += expense.amount;
      byCategory.set(category.value, line);
    }

    const categories = [...byCategory.values()].sort((a, b) => b.amount - a.amount);

    return { ...group, amount: sum(categories), categories };
  })
    .filter((group) => group.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const propertyLines: PropertyLine[] = properties.map((property) => {
    const rent = sum(rentThis.filter((p) => p.propertyId === property.id));
    const spent = sum(expThis.filter((e) => e.propertyId === property.id));

    return { id: property.id, name: property.name, ...totals(rent, spent) };
  });
  const unassigned = expThis.filter((e) => !e.propertyId || !properties.some((p) => p.id === e.propertyId));

  if (unassigned.length > 0) {
    propertyLines.push({ id: '', name: 'Not tied to a property', ...totals(0, sum(unassigned)) });
  }

  return {
    year: data.year,
    current: totals(sum(rentThis), sum(expThis)),
    previous: totals(sum(rentLast), sum(expLast)),
    deposits: sum(payments.filter((p) => p.type !== 'RENT' && inYear(p.date, year))),
    months,
    groups,
    properties: propertyLines.sort((a, b) => b.net - a.net),
    propertyCount: properties.length,
    occupied: properties.filter((p) => p.status === 'OCCUPIED').length,
    missingBills: expThis.filter((e) => !e.hasBill).length,
    expenseCount: expThis.length,
  };
};

const csvCell = (value: string | number) => {
  const text = typeof value === 'number' ? value.toFixed(2) : value;

  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Plain CSV for a spreadsheet: totals, months, categories, properties.
export const yearSummaryCsv = (summary: YearSummary, workspace: string) => {
  const rows: Array<Array<string | number>> = [
    [`Year summary ${summary.year}`, workspace],
    [],
    ['', 'Rent received (RM)', 'Expenses (RM)', 'Net (RM)'],
    [String(summary.year), summary.current.rent, summary.current.expenses, summary.current.net],
    [String(summary.year - 1), summary.previous.rent, summary.previous.expenses, summary.previous.net],
    [],
    ['Month', 'Rent received (RM)', 'Expenses (RM)', 'Net (RM)'],
    ...summary.months.map((m) => [m.month, m.rent, m.expenses, m.net]),
    [],
    ['Expense group', 'Category', 'Amount (RM)'],
    ...summary.groups.flatMap((g) => g.categories.map((c) => [g.label, c.label, c.amount])),
    [],
    ['Property', 'Rent received (RM)', 'Expenses (RM)', 'Net (RM)'],
    ...summary.properties.map((p) => [p.name, p.rent, p.expenses, p.net]),
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
};
