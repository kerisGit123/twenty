// Labels and CSV for the Transactions page (shared by the page and the CSV
// download route).

import type { MoneyIn } from 'src/logic-functions/page-data/transactions-data';
import type { Expense } from 'src/logic-functions/page-data/expenses-data';
import { expenseCategory } from 'src/shared/expense-categories';
import { incomeCategoryLabel } from 'src/shared/income-categories';

export type TransactionsTab = 'in' | 'out' | 'receipts';

export const TYPE_LABEL: Record<string, string> = {
  RENT: 'Rent',
  DEPOSIT: 'Security deposit',
  UTILITY_DEPOSIT: 'Utility deposit',
  DEPOSIT_KEPT: 'Deposit kept',
  INCOME: 'Other income',
};

// "Rent", "Security deposit"... or the income's category ("Late fee").
export const typeLabel = (row: Pick<MoneyIn, 'type' | 'category'>) =>
  row.type === 'INCOME' ? incomeCategoryLabel(row.category) : TYPE_LABEL[row.type] ?? row.type;

export const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  DUITNOW: 'DuitNow',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
  FROM_DEPOSIT: 'Paid from deposit',
  EWALLET: 'E-wallet',
};

export const STATUS_LABEL: Record<string, string> = {
  ISSUED: 'Paid',
  SENT: 'Paid · sent',
  VOID: 'Void',
  KEPT: 'Kept',
  RECORDED: 'Recorded',
};

// Cash that actually came in: issued or sent receipts, kept deposits and recorded income.
// Rent paid from the deposit isn't new money (the deposit was counted when it came in).
export const countsAsReceived = (row: MoneyIn) => row.status !== 'VOID' && row.method !== 'FROM_DEPOSIT';

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
export const dmy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

const cell = (value: string | number) => {
  const text = String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csv = (rows: Array<Array<string | number>>) => rows.map((row) => row.map(cell).join(',')).join('\r\n');

export const moneyInCsv = (rows: MoneyIn[]) =>
  csv([
    ['Date', 'Receipt no.', 'Status', 'Type', 'Rent for', 'Tenant / from', 'Property', 'Workspace', 'Method', 'Amount (RM)', 'Notes'],
    ...rows.map((r) => [
      dmy(r.date),
      r.receiptNumber,
      STATUS_LABEL[r.status] ?? r.status,
      typeLabel(r),
      r.month ? r.month.slice(0, 7) : '',
      r.tenantName,
      r.propertyName,
      r.ownerName,
      r.method ? METHOD_LABEL[r.method] ?? r.method : '',
      r.amount.toFixed(2),
      r.notes,
    ]),
  ]);

export const moneyOutCsv = (rows: Expense[]) =>
  csv([
    ['Date', 'What', 'Category', 'Paid to', 'Property', 'Workspace', 'Currency', 'Amount', 'Bills attached'],
    ...rows.map((e) => [
      dmy(e.date),
      e.name,
      expenseCategory(e.category).label,
      e.paidTo,
      e.propertyName,
      e.ownerName,
      e.currency,
      e.amount.toFixed(2),
      e.files ? String(e.files) : e.noBillNeeded ? 'Not needed' : '0',
    ]),
  ]);

// The receipt register: every receipt by number, voided ones included.
export const receiptRows = (rows: MoneyIn[]) =>
  rows.filter((r) => r.receiptNumber).sort((a, b) => a.receiptNumber.localeCompare(b.receiptNumber, 'en', { numeric: true }));

export const receiptsCsv = (rows: MoneyIn[]) =>
  csv([
    ['Receipt no.', 'Receipt date', 'Paid on', 'Status', 'Type', 'Tenant', 'Property', 'Workspace', 'Amount (RM)', 'Notes'],
    ...receiptRows(rows).map((r) => [
      r.receiptNumber,
      dmy(r.receiptDate ?? r.date),
      dmy(r.date),
      STATUS_LABEL[r.status] ?? r.status,
      TYPE_LABEL[r.type] ?? r.type,
      r.tenantName,
      r.propertyName,
      r.ownerName,
      r.amount.toFixed(2),
      r.notes,
    ]),
  ]);
