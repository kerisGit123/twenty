// Excel files for the other Stock tabs: stock in hand, the order plan (as a
// purchase order per supplier), the in/out history grid and borrowed stock.
// Same look as the monthly 订货单 file.

import {
  type HistoryRow,
  type StockItem,
  type StockMovement,
  type StockStatus,
  cartonsAndUnits,
  expiryState,
  toCartons,
  unitPrice,
} from 'src/shared/stock';
import { CREAM, GROUP, HEAD, ORDER, PASAR, PASAR_LIGHT, TEAL, cell, dmy } from 'src/shared/stock-excel';
import { BORROW_STATUSES, STOCK_GROUPS } from 'src/shared/stock-types';
import { buildXlsx, type XlsxCell, type XlsxStyle } from 'src/shared/xlsx';

const RED = 'C00000';
const AMBER = '9C5700';
const GREEN_TEXT = '2E7D32';
const BLUE_TEXT = '1F4E79';
const IN_BAND = '375623';
const OUT_BAND = '1F4E79';
const IN_HEAD_FILL = 'C6E0B4';
const IN_LIGHT_FILL = 'E2EFDA';

type Heading = { title: string; company: string; generatedOn: string; period?: string };

const num = (value: number | null | undefined, style: XlsxStyle = {}) =>
  cell(value ? Math.round(value * 100) / 100 : null, { format: 'num', align: 'right', ...style });
const money = (value: number | null | undefined, style: XlsxStyle = {}) =>
  cell(value ? Math.round(value * 100) / 100 : null, { format: 'money', align: 'right', ...style });
const headerRow = (labels: string[], fill = HEAD) => labels.map((h) => cell(h, { fill, bold: true, align: 'center', wrap: true }));

// Title block (4 rows + a blank line); returns the rows.
const titleBlock = (h: Heading): XlsxCell[][] => [
  [{ value: h.title, style: { bold: true, size: 14 } }],
  [{ value: '公司名称 Company:', style: { bold: true } }, { value: h.company }],
  [{ value: h.period ? 'Period:' : 'As at:', style: { bold: true } }, { value: h.period ?? dmy(h.generatedOn) }],
  [{ value: 'Generated:', style: { italic: true, color: '808080' } }, { value: dmy(h.generatedOn), style: { italic: true, color: '808080' } }],
  [],
];

const groupRow = (label: string, width: number): XlsxCell[] => [cell(label, { fill: GROUP, bold: true }), ...Array.from({ length: width - 1 }, () => cell(null, { fill: GROUP }))];

const FLAG_LABEL: Record<string, string> = { ORDER: 'Order now', LOW: 'Low', OK: 'OK', NO_USE: 'Not used', EMPTY: 'Out of stock' };

// ---------------------------------------------------------------- Stock in hand

export const stockHandWorkbook = (statuses: StockStatus[], today: string, heading: Heading) => {
  const labels = ['Item code', 'Product name', 'Specification', 'Unit', 'Units / ctn', 'In hand (units)', 'In hand (ctn)', 'Value (RM)', 'Lasts (months)', 'Need next month (units)', 'To order (ctn)', 'Order cost (RM)', 'Nearest expiry', 'Status'];
  const rows: XlsxCell[][] = [...titleBlock(heading), headerRow(labels)];
  const merges: Array<[number, number, number, number]> = [];
  let value = 0;
  let orderCost = 0;

  for (const group of STOCK_GROUPS) {
    const list = statuses.filter((s) => s.item.group === group.value && s.item.status !== 'DISCONTINUED');

    if (!list.length) continue;
    rows.push(groupRow(`${group.label} · ${list.length} items`, labels.length));
    merges.push([rows.length - 1, 0, rows.length - 1, labels.length - 1]);

    for (const s of list) {
      const expiry = s.balance > 0 ? expiryState(s.nearestExpiry, today) : null;
      const flagColor = s.flag === 'ORDER' ? RED : s.flag === 'LOW' ? AMBER : undefined;

      value += s.value;
      orderCost += s.suggestedCost;
      rows.push([
        cell(s.item.code, { align: 'center' }),
        cell(s.item.name),
        cell(s.item.specification),
        cell(s.item.unit, { align: 'center' }),
        num(s.item.unitsPerCarton),
        num(s.balance, { bold: true }),
        num(s.cartons),
        money(s.value),
        cell(s.monthsLeft === null ? null : Math.round(s.monthsLeft * 10) / 10, { format: 'months', align: 'right', color: flagColor }),
        num(s.forecast),
        num(s.suggestedCartons, { fill: s.suggestedCartons ? ORDER : undefined, bold: true, color: s.suggestedCartons ? RED : undefined }),
        money(s.suggestedCost),
        cell(s.nearestExpiry && s.balance > 0 ? `${expiry === 'EXPIRED' ? 'EXPIRED ' : ''}${dmy(s.nearestExpiry)}` : null, { color: expiry === 'EXPIRED' ? RED : expiry === 'SOON' ? AMBER : undefined }),
        cell(FLAG_LABEL[s.flag] ?? s.flag, { color: flagColor, bold: Boolean(flagColor) }),
      ]);
    }
  }

  const total = labels.map(() => cell(null, { fill: HEAD }));

  total[1] = cell('TOTAL', { fill: HEAD, bold: true });
  total[7] = money(value, { fill: HEAD, bold: true });
  total[11] = money(orderCost, { fill: HEAD, bold: true });
  rows.push(total);

  return buildXlsx({ name: 'Stock in hand', rows, merges, freeze: { rows: 6, cols: 2 }, heights: { 5: 30 }, widths: [9, 36, 22, 7, 7, 10, 9, 11, 9, 11, 9, 11, 14, 11] });
};

// ---------------------------------------------------------------- Order plan (purchase order)

export const orderWorkbook = (statuses: StockStatus[], cartonsOf: (s: StockStatus) => number, heading: Heading) => {
  const labels = ['Item code', 'Product name', 'Specification', 'Units / ctn', 'In hand', 'Lasts (months)', 'Need next month (units)', 'Order (ctn)', 'Order (units)', 'Unit price / ctn (RM)', 'Amount (RM)'];
  const rows: XlsxCell[][] = [...titleBlock(heading), headerRow(labels, ORDER)];
  const merges: Array<[number, number, number, number]> = [];
  const ordered = statuses.filter((s) => s.item.status !== 'DISCONTINUED' && cartonsOf(s) > 0);
  const suppliers = [...new Set(ordered.map((s) => s.item.supplier || 'No supplier'))].sort();
  let grand = 0;
  let grandCtn = 0;

  for (const supplier of suppliers) {
    const list = ordered.filter((s) => (s.item.supplier || 'No supplier') === supplier);
    const subtotal = list.reduce((sum, s) => sum + cartonsOf(s) * s.item.cartonPrice, 0);
    const subCtn = list.reduce((sum, s) => sum + cartonsOf(s), 0);

    rows.push(groupRow(`Supplier: ${supplier}`, labels.length));
    merges.push([rows.length - 1, 0, rows.length - 1, labels.length - 1]);
    for (const s of list) {
      const ctn = cartonsOf(s);

      rows.push([
        cell(s.item.code, { align: 'center' }),
        cell(s.item.name),
        cell(s.item.specification),
        num(s.item.unitsPerCarton),
        cell(s.balance ? cartonsAndUnits(s.balance, s.item) : 'none', { align: 'right' }),
        cell(s.monthsLeft === null ? null : Math.round(s.monthsLeft * 10) / 10, { format: 'months', align: 'right', color: s.flag === 'ORDER' ? RED : undefined }),
        num(s.forecast),
        num(ctn, { bold: true, fill: ORDER }),
        num(ctn * s.item.unitsPerCarton),
        money(s.item.cartonPrice),
        money(ctn * s.item.cartonPrice, { bold: true }),
      ]);
    }
    const sub = labels.map(() => cell(null, { fill: CREAM }));

    sub[1] = cell(`Subtotal ${supplier}`, { fill: CREAM, bold: true });
    sub[7] = num(subCtn, { fill: CREAM, bold: true });
    sub[10] = money(subtotal, { fill: CREAM, bold: true });
    rows.push(sub);
    grand += subtotal;
    grandCtn += subCtn;
  }

  const total = labels.map(() => cell(null, { fill: HEAD }));

  total[1] = cell(ordered.length ? 'ORDER TOTAL' : 'Nothing to order', { fill: HEAD, bold: true });
  total[7] = num(grandCtn, { fill: HEAD, bold: true });
  total[10] = money(grand, { fill: HEAD, bold: true });
  rows.push(total);

  return buildXlsx({ name: 'Order', rows, merges, freeze: { rows: 6, cols: 2 }, heights: { 5: 30 }, widths: [9, 36, 22, 7, 12, 9, 11, 9, 9, 12, 13] });
};

// ---------------------------------------------------------------- In / out history grid

// Two sections, as on the page: IN (one column per day something came in,
// then the total) and OUT (one column per day something went out, then the total).
export const historyWorkbook = (sheet: { inDates: string[]; outDates: string[]; rows: HistoryRow[] }, heading: Heading) => {
  const fixed = ['Item code', 'Product name', 'Unit', 'Opening'];
  const inCols = sheet.inDates.length + 1;
  const outCols = sheet.outDates.length + 1;
  const tail = ['Balance (units)', 'Balance (ctn)'];
  const width = fixed.length + inCols + outCols + tail.length;
  const inStart = fixed.length;
  const outStart = inStart + inCols;
  const tailStart = outStart + outCols;
  const rows: XlsxCell[][] = [...titleBlock(heading)];
  const merges: Array<[number, number, number, number]> = [];
  const bandRow = rows.length;
  const band: XlsxCell[] = [];

  for (let col = 0; col < width; col++) {
    if (col < inStart) band.push(cell(col === 0 ? 'Item' : '', { fill: TEAL, bold: true, color: 'FFFFFF' }));
    else if (col < outStart) band.push(cell(col === inStart ? 'IN · purchases, returns (tarikh masuk)' : '', { fill: IN_BAND, bold: true, color: 'FFFFFF', align: 'center' }));
    else if (col < tailStart) band.push(cell(col === outStart ? 'OUT · taken out, lent, waste (tarikh ambil)' : '', { fill: OUT_BAND, bold: true, color: 'FFFFFF', align: 'center' }));
    else band.push(cell(col === tailStart ? 'Balance' : '', { fill: TEAL, bold: true, color: 'FFFFFF', align: 'center' }));
  }
  rows.push(band);
  merges.push([bandRow, 0, bandRow, inStart - 1], [bandRow, tailStart, bandRow, width - 1]);
  if (inCols > 1) merges.push([bandRow, inStart, bandRow, outStart - 1]);
  if (outCols > 1) merges.push([bandRow, outStart, bandRow, tailStart - 1]);

  rows.push([
    ...headerRow(fixed),
    ...sheet.inDates.map((d) => cell(dmy(d), { fill: IN_HEAD_FILL, bold: true, align: 'center', color: GREEN_TEXT })),
    cell('Total in', { fill: IN_HEAD_FILL, bold: true, align: 'center', color: GREEN_TEXT }),
    ...sheet.outDates.map((d) => cell(dmy(d), { fill: PASAR, bold: true, align: 'center', color: BLUE_TEXT })),
    cell('Total out', { fill: PASAR, bold: true, align: 'center', color: BLUE_TEXT }),
    ...headerRow(tail),
  ]);

  const moved = sheet.rows.filter((r) => r.totalIn || r.totalOut);

  for (const group of STOCK_GROUPS) {
    const list = moved.filter((r) => r.item.group === group.value);

    if (!list.length) continue;
    rows.push(groupRow(group.label, width));
    merges.push([rows.length - 1, 0, rows.length - 1, width - 1]);
    for (const r of list) {
      rows.push([
        cell(r.item.code, { align: 'center' }),
        cell(r.item.name),
        cell(r.item.unit, { align: 'center' }),
        num(r.opening),
        ...sheet.inDates.map((d) => num(r.days[d]?.in, { color: GREEN_TEXT, fill: IN_LIGHT_FILL })),
        num(r.totalIn, { color: GREEN_TEXT, bold: true, fill: IN_HEAD_FILL }),
        ...sheet.outDates.map((d) => num(r.days[d]?.out, { color: BLUE_TEXT, fill: PASAR_LIGHT })),
        num(r.totalOut, { color: BLUE_TEXT, bold: true, fill: PASAR }),
        num(r.closing, { bold: true }),
        num(toCartons(r.closing, r.item)),
      ]);
    }
  }

  return buildXlsx({
    name: 'In-out history',
    rows,
    merges,
    freeze: { rows: 7, cols: 2 },
    widths: [9, 36, 7, 9, ...sheet.inDates.map(() => 8), 9, ...sheet.outDates.map(() => 8), 9, 11, 10],
  });
};

// ---------------------------------------------------------------- Borrowed

export const borrowWorkbook = (items: StockItem[], movements: StockMovement[], today: string, heading: Heading) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  const labels = ['Branch', 'Lent on', 'Item code', 'Product name', 'Quantity', 'Value at cost (RM)', 'Days out', 'Status', 'Settled with', 'Notes'];
  const rows: XlsxCell[][] = [...titleBlock(heading), headerRow(labels)];
  const lent = movements.filter((m) => m.type === 'BORROW').sort((a, b) => (a.party || '').localeCompare(b.party || '') || a.date.localeCompare(b.date));
  const settlements = new Map<string, StockMovement[]>();

  for (const m of movements) if (m.borrowId) settlements.set(m.borrowId, [...(settlements.get(m.borrowId) ?? []), m]);
  let owed = 0;

  for (const m of lent) {
    const item = byId.get(m.itemId);
    const status = m.borrowStatus ?? 'OUTSTANDING';
    const open = status === 'OUTSTANDING';
    const value = item ? m.quantity * unitPrice(item) : 0;
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${m.date}T00:00:00Z`)) / 86_400_000);
    const settled =
      status === 'PAID'
        ? 'Paid in money'
        : (settlements.get(m.id) ?? [])
            .map((s) => {
              const other = byId.get(s.itemId);

              return `${dmy(s.date)}: ${other ? cartonsAndUnits(s.quantity, other) : s.quantity}${other && other.id !== m.itemId ? ` ${other.name}` : ''}`;
            })
            .join('; ');

    if (open) owed += value;
    rows.push([
      cell(m.party || 'Unknown branch', { bold: open }),
      cell(dmy(m.date)),
      cell(item?.code ?? ''),
      cell(item?.name ?? 'Item removed'),
      cell(item ? cartonsAndUnits(m.quantity, item) : String(m.quantity), { align: 'right' }),
      money(value),
      cell(open ? days : null, { align: 'right', color: open && days > 30 ? RED : open && days > 14 ? AMBER : undefined }),
      cell(BORROW_STATUSES.find((b) => b.value === status)?.label ?? status, { color: open ? AMBER : undefined, bold: open }),
      cell(settled),
      cell(m.notes),
    ]);
  }

  const total = labels.map(() => cell(null, { fill: HEAD }));

  total[0] = cell(lent.length ? 'STILL OWED' : 'Nothing lent', { fill: HEAD, bold: true });
  total[5] = money(owed, { fill: HEAD, bold: true });
  rows.push(total);

  return buildXlsx({ name: 'Borrowed', rows, freeze: { rows: 6, cols: 1 }, widths: [18, 10, 9, 34, 12, 12, 8, 12, 30, 24] });
};
