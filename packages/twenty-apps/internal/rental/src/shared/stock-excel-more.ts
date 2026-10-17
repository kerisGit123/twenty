// Excel files for the other Stock tabs: stock in hand, the order plan (as a
// purchase order per supplier), the in/out history grid and borrowed stock.
// Same look as the monthly 订货单 file.

import {
  type Delivery,
  type MonthEndRow,
  type YearRow,
  type HistoryRow,
  type StockItem,
  type StockMovement,
  type StockStatus,
  cartonsAndUnits,
  expiryState,
  loanRemaining,
  toCartons,
  unitValue,
} from 'src/shared/stock';
import { BROWN, CREAM, GROUP, HEAD, ORDER, PASAR, PASAR_LIGHT, TEAL, cell, dmy } from 'src/shared/stock-excel';
import { type LineProgress, type StockOrder } from 'src/shared/stock-orders';
import { type StockRequest } from 'src/shared/stock-requests';
import { BORROW_STATUSES, STOCK_GROUPS, WASTE_REASONS } from 'src/shared/stock-types';
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

// ---------------------------------------------------------------- Delivery note for a branch request

export const deliveryNoteWorkbook = (request: StockRequest, items: Map<string, StockItem>, heading: { company: string; generatedOn: string }) => {
  const labels = ['Item code', 'Product name', 'Specification', 'Units / ctn', 'To send (ctn + units)', 'Units', 'Received\n(ctn)', 'Received\n(loose units)', 'Remarks'];
  const rows: XlsxCell[][] = [
    [{ value: 'Delivery note 送货单', style: { bold: true, size: 14 } }],
    [{ value: 'Request:', style: { bold: true } }, { value: request.number }, { value: '' }, { value: 'To:', style: { bold: true } }, { value: request.branch }],
    [{ value: '公司名称 Company:', style: { bold: true } }, { value: heading.company }, { value: '' }, { value: 'Date:', style: { bold: true } }, { value: dmy(request.issuedOn ?? heading.generatedOn) }],
    [{ value: request.status === 'REQUESTED' ? 'Picking list: quantities asked for, not issued yet.' : 'The branch counts what arrived in the green columns and signs below.', style: { italic: true, color: '808080' } }],
    [],
    headerRow(labels, PASAR),
  ];
  const input = { fill: PASAR_LIGHT, align: 'right' as const, format: 'num' as const };
  let total = 0;

  for (const line of request.lines) {
    const item = items.get(line.itemId);
    const units = line.issuedUnits ?? line.requestedUnits;

    if (!(units > 0)) continue;
    total += item ? (units / (item.unitsPerCarton || 1)) * item.cartonPrice : 0;
    rows.push([
      cell(item?.code ?? '', { align: 'center' }),
      cell(item?.name ?? 'Item removed'),
      cell(item?.specification ?? ''),
      num(item?.unitsPerCarton ?? 1),
      cell(item ? cartonsAndUnits(units, item) : String(units), { bold: true }),
      num(units),
      cell(null, input),
      cell(null, input),
      cell(null, { fill: PASAR_LIGHT }),
    ]);
  }
  rows.push([]);
  rows.push([{ value: 'Issued by: ______________________', style: { bold: true } }, { value: '' }, { value: '' }, { value: 'Received by: ______________________', style: { bold: true } }, { value: '' }, { value: 'Date: ____ / ____ / ________', style: { bold: true } }]);
  rows.push([{ value: `Stock value at list price: RM ${(Math.round(total * 100) / 100).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`, style: { italic: true, color: '808080' } }]);

  return buildXlsx({ name: 'Delivery note', rows, freeze: { rows: 6, cols: 2 }, heights: { 5: 30 }, widths: [9, 40, 24, 8, 20, 9, 11, 13, 26] });
};

// ---------------------------------------------------------------- Count sheet (blind: no expected quantities)

export const countWorkbook = (items: StockItem[], heading: Heading) => {
  const labels = ['Item code', 'Product name', 'Specification', 'Unit', 'Units / ctn', 'Counted\n(ctn)', 'Counted\n(loose units)', 'Notes (damaged, expiry...)'];
  const rows: XlsxCell[][] = [
    ...titleBlock(heading),
    [{ value: 'Counted on:', style: { bold: true } }, { value: '____ / ____ / ________' }, { value: '' }, { value: 'Counted by:', style: { bold: true } }, { value: '______________________' }],
    [{ value: 'Count each product on the shelf: whole cartons in "Counted (ctn)", loose units in "Counted (loose units)". Leave blank what you did not count; type 0 for nothing left.', style: { italic: true, color: '808080' } }],
    [],
    headerRow(labels, PASAR),
  ];
  const merges: Array<[number, number, number, number]> = [];
  const input = { fill: PASAR_LIGHT, align: 'right' as const, format: 'num' as const };

  for (const group of STOCK_GROUPS) {
    const list = items.filter((i) => i.group === group.value && i.status !== 'DISCONTINUED').sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

    if (!list.length) continue;
    rows.push(groupRow(`${group.label} · ${list.length} items`, labels.length));
    merges.push([rows.length - 1, 0, rows.length - 1, labels.length - 1]);
    for (const item of list) {
      rows.push([
        cell(item.code, { align: 'center' }),
        cell(item.name),
        cell(item.specification),
        cell(item.unit, { align: 'center' }),
        num(item.unitsPerCarton),
        cell(null, input),
        cell(null, input),
        cell(null, { fill: PASAR_LIGHT }),
      ]);
    }
  }

  if (!items.some((i) => i.status !== 'DISCONTINUED')) {
    rows.push([{ value: 'No products in this business yet. Import your stock sheet (Stock › Import Excel) or add products first, then download the count sheet again.', style: { bold: true, color: 'C00000' } }]);
  }

  return buildXlsx({ name: 'Count sheet', rows, merges, freeze: { rows: 9, cols: 2 }, heights: { 8: 30 }, widths: [9, 40, 24, 7, 8, 11, 13, 30] });
};

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

// ---------------------------------------------------------------- Year: every product, opening/closing per month

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const yearWorkbook = (rows: YearRow[], year: number, lastMonth: number, heading: Heading) => {
  const fixed = ['Item code', 'Product name', 'Unit'];
  const width = fixed.length + 24;
  const out: XlsxCell[][] = [...titleBlock({ ...heading, period: String(year) })];
  const merges: Array<[number, number, number, number]> = [];
  const band = out.length;

  out.push([
    ...fixed.map((_, i) => cell(i === 0 ? 'Item' : '', { fill: TEAL, bold: true, color: 'FFFFFF' })),
    ...MONTH_NAMES.flatMap((m, i) => [cell(`${m} ${year}`, { fill: i % 2 ? TEAL : BROWN, bold: true, color: 'FFFFFF', align: 'center' }), cell('', { fill: i % 2 ? TEAL : BROWN })]),
  ]);
  merges.push([band, 0, band, fixed.length - 1]);
  MONTH_NAMES.forEach((_, i) => merges.push([band, fixed.length + i * 2, band, fixed.length + i * 2 + 1]));
  out.push([...headerRow(fixed), ...MONTH_NAMES.flatMap(() => [cell('Opening', { fill: HEAD, bold: true, align: 'center' }), cell('Closing', { fill: CREAM, bold: true, align: 'center' })])]);

  const visible = rows.filter((r) => r.months.some((m, i) => i < lastMonth && (m.opening || m.closing || m.in || m.used || m.waste)));

  for (const group of STOCK_GROUPS) {
    const list = visible.filter((r) => r.item.group === group.value);

    if (!list.length) continue;
    out.push(groupRow(group.label, width));
    merges.push([out.length - 1, 0, out.length - 1, width - 1]);
    for (const r of list) {
      out.push([
        cell(r.item.code, { align: 'center' }),
        cell(r.item.name),
        cell(r.item.unit, { align: 'center' }),
        ...r.months.flatMap((m, i) =>
          i < lastMonth ? [num(m.opening, { color: '808080' }), num(m.closing, { bold: true, fill: CREAM, color: m.waste ? RED : undefined })] : [cell(null), cell(null, { fill: CREAM })],
        ),
      ]);
    }
  }

  const total: XlsxCell[] = [cell(null, { fill: HEAD }), cell('Total value (RM)', { fill: HEAD, bold: true }), cell(null, { fill: HEAD })];

  for (let i = 0; i < 12; i++) {
    const value = (key: 'opening' | 'closing') => visible.reduce((sum, r) => sum + Math.max(r.months[i][key], 0) * unitValue(r.item), 0);

    total.push(i < lastMonth ? money(value('opening'), { fill: HEAD }) : cell(null, { fill: HEAD }), i < lastMonth ? money(value('closing'), { fill: HEAD, bold: true }) : cell(null, { fill: HEAD }));
  }
  out.push(total);
  out.push([]);
  out.push([{ value: 'Quantities in each item’s unit. Opening = stock on the 1st; Closing = after the last day (= next month’s opening). Red closing = waste that month.', style: { italic: true, color: '808080' } }]);

  return buildXlsx({ name: `Stock ${year}`, rows: out, merges, freeze: { rows: 7, cols: 2 }, widths: [9, 34, 7, ...MONTH_NAMES.flatMap(() => [8, 8])] });
};

// ---------------------------------------------------------------- Month end

export const monthEndWorkbook = (rows: MonthEndRow[], lockedThrough: string | null, heading: Heading) => {
  const reasons = WASTE_REASONS.filter((r) => rows.some((x) => (x.reasons[r.value] ?? 0) > 0));
  const labels = ['Month', 'Opening (RM)', '+ Purchased (RM)', '+ Other in (RM)', '− Used (RM)', '− Waste (RM)', '− Lent / given back / count (RM)', 'Closing (RM)', 'Stock take', 'Status', ...reasons.map((r) => `Lost: ${r.label} (RM)`)];
  const out: XlsxCell[][] = [...titleBlock(heading), headerRow(labels)];
  const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

  for (const r of rows) {
    const closed = !!lockedThrough && monthEnd(r.month) <= lockedThrough;

    out.push([
      cell(r.month, { bold: true, align: 'center' }),
      money(r.openingValue),
      money(r.purchasedValue, { color: GREEN_TEXT }),
      money(r.otherInValue, { color: GREEN_TEXT }),
      money(r.usedValue, { color: BLUE_TEXT }),
      money(r.wasteValue, { color: RED }),
      money(r.otherOutValue, { color: BLUE_TEXT }),
      money(r.closingValue, { bold: true, fill: CREAM }),
      cell(r.counted ? 'counted' : 'not counted', { color: r.counted ? GREEN_TEXT : '808080' }),
      cell(closed ? 'CLOSED' : 'open', { bold: closed }),
      ...reasons.map((reason) => money(r.reasons[reason.value] ?? 0, { color: RED })),
    ]);
  }
  out.push([]);
  out.push([{ value: 'Values at each item’s carton price ÷ units. Opening = the previous month’s closing.', style: { italic: true, color: '808080' } }]);

  return buildXlsx({ name: 'Month end', rows: out, freeze: { rows: 6, cols: 1 }, heights: { 5: 30 }, widths: [10, 14, 15, 14, 14, 13, 15, 15, 12, 10, ...reasons.map(() => 16)] });
};

// ---------------------------------------------------------------- One order (to send to the supplier)

export const purchaseOrderWorkbook = (order: StockOrder, lines: LineProgress[], items: Map<string, StockItem>, heading: Heading) => {
  const labels = ['Item code', 'Product name', 'Specification', 'Units / ctn', 'Order (ctn)', 'Order (units)', 'Unit price / ctn (RM)', 'Amount (RM)', 'Arrived (units)', 'Still to come (units)'];
  const rows: XlsxCell[][] = [
    [{ value: '订货单 ORDER', style: { bold: true, size: 14 } }],
    [{ value: 'Our order no.:', style: { bold: true } }, { value: order.number }],
    [{ value: '供应商 Supplier:', style: { bold: true } }, { value: order.supplier }],
    [{ value: '日期 Order date:', style: { bold: true } }, { value: order.date ? dmy(order.date) : '' }],
    [{ value: '公司名称 Company:', style: { bold: true } }, { value: heading.company }],
    [{ value: "Supplier's PO no.:", style: { bold: true } }, { value: order.supplierRef || '(to be given by the supplier)' }],
    [],
    headerRow(labels, ORDER),
  ];
  let total = 0;
  let totalCtn = 0;

  for (const l of lines) {
    const item = items.get(l.itemId);
    const per = item?.unitsPerCarton || 1;
    const ctn = l.orderedUnits / per;

    total += ctn * l.cartonPrice;
    totalCtn += ctn;
    rows.push([
      cell(item?.code ?? '', { align: 'center' }),
      cell(item?.name ?? 'Item removed'),
      cell(item?.specification ?? ''),
      num(per),
      num(ctn, { bold: true, fill: ORDER }),
      num(l.orderedUnits),
      money(l.cartonPrice),
      money(ctn * l.cartonPrice, { bold: true }),
      num(l.received, { color: GREEN_TEXT }),
      cell(l.outstanding ? Math.round(l.outstanding * 100) / 100 : l.closed && l.received < l.orderedUnits ? 'not coming' : null, { align: 'right', color: l.outstanding ? AMBER : undefined, format: 'num' }),
    ]);
  }

  const totalRow = labels.map(() => cell(null, { fill: HEAD }));

  totalRow[1] = cell('TOTAL', { fill: HEAD, bold: true });
  totalRow[4] = num(totalCtn, { fill: HEAD, bold: true });
  totalRow[7] = money(total, { fill: HEAD, bold: true });
  rows.push(totalRow);

  return buildXlsx({ name: order.number || 'Order', rows, freeze: { rows: 8, cols: 2 }, heights: { 7: 30 }, widths: [9, 36, 22, 8, 9, 9, 12, 13, 11, 13] });
};

// ---------------------------------------------------------------- In / out history grid

// Two sections, as on the page: IN (one column per day something came in,
// then the total) and OUT (one column per day something went out, then the total).
export const historyWorkbook = (sheet: { ins: Delivery[]; outDates: string[]; rows: HistoryRow[] }, heading: Heading) => {
  const fixed = ['Item code', 'Product name', 'Unit', 'Opening'];
  const inCols = sheet.ins.length + 1;
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
    ...sheet.ins.map((d) => cell(`${dmy(d.date)}${d.reference || d.party ? `\n${d.reference || d.party}` : ''}`, { fill: IN_HEAD_FILL, bold: true, align: 'center', color: GREEN_TEXT, wrap: true })),
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
        ...sheet.ins.map((d) => num(r.deliveries[d.key], { color: GREEN_TEXT, fill: IN_LIGHT_FILL })),
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
    heights: { 6: 30 },
    widths: [9, 36, 7, 9, ...sheet.ins.map(() => 11), 9, ...sheet.outDates.map(() => 8), 9, 11, 10],
  });
};

// ---------------------------------------------------------------- Loans

// Loans between shops: lent out (a shop borrowed from us) and borrowed in (we
// borrowed from a shop), each with what is still open and how it was settled.
export const borrowWorkbook = (items: StockItem[], movements: StockMovement[], today: string, heading: Heading) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  const labels = ['Direction', 'Shop', 'Date', 'Item code', 'Product name', 'Quantity', 'Still open', 'Value open (RM)', 'Days out', 'Status', 'Settled with', 'Notes'];
  const rows: XlsxCell[][] = [...titleBlock(heading), headerRow(labels)];
  const loans = movements
    .filter((m) => m.type === 'BORROW' || m.type === 'BORROW_IN')
    .sort((a, b) => a.type.localeCompare(b.type) || (a.party || '').localeCompare(b.party || '') || a.date.localeCompare(b.date));
  const settlements = new Map<string, StockMovement[]>();

  for (const m of movements) if (m.borrowId) settlements.set(m.borrowId, [...(settlements.get(m.borrowId) ?? []), m]);
  const owed = { BORROW: 0, BORROW_IN: 0 };

  for (const m of loans) {
    const item = byId.get(m.itemId);
    const status = m.borrowStatus ?? 'OUTSTANDING';
    const open = status === 'OUTSTANDING';
    const left = open ? loanRemaining(m, movements) : 0;
    const part = open && left < m.quantity;
    const value = item ? left * unitValue(item) : 0;
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${m.date}T00:00:00Z`)) / 86_400_000);
    const parts = [...(settlements.get(m.id) ?? [])]
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((s) => {
        // The line an exchange leaves on this item: the other item's line already shows it.
        if (s.type === 'LOAN_SETTLED') return s.amount ? [`${dmy(s.date)}: paid RM ${s.amount.toFixed(2)}${s.notes ? ` (${s.notes})` : ''}`] : [];
        const other = byId.get(s.itemId);

        return [`${dmy(s.date)}: ${other ? cartonsAndUnits(s.quantity, other) : s.quantity}${other && other.id !== m.itemId ? ` ${other.name}` : ''}`];
      });
    const settled = parts.length ? parts.join('; ') : status === 'PAID' ? 'Paid in money' : '';

    if (open) owed[m.type as 'BORROW' | 'BORROW_IN'] += value;
    rows.push([
      cell(m.type === 'BORROW_IN' ? 'Borrowed in' : 'Lent out', { bold: open }),
      cell(m.party || 'Unknown shop', { bold: open }),
      cell(dmy(m.date)),
      cell(item?.code ?? ''),
      cell(item?.name ?? 'Item removed'),
      cell(item ? cartonsAndUnits(m.quantity, item) : String(m.quantity), { align: 'right' }),
      cell(open ? (item ? cartonsAndUnits(left, item) : String(left)) : '', { align: 'right', bold: open }),
      money(value),
      cell(open ? days : null, { align: 'right', color: open && days > 30 ? RED : open && days > 14 ? AMBER : undefined }),
      cell(part ? 'Part settled' : (BORROW_STATUSES.find((b) => b.value === status)?.label ?? status), { color: open ? AMBER : undefined, bold: open }),
      cell(settled),
      cell(m.notes),
    ]);
  }

  const total = (label: string, amount: number) => {
    const row = labels.map(() => cell(null, { fill: HEAD }));

    row[0] = cell(label, { fill: HEAD, bold: true });
    row[7] = money(amount, { fill: HEAD, bold: true });

    return row;
  };

  rows.push(total(loans.length ? 'STILL OWED TO YOU (lent out)' : 'Nothing lent or borrowed', owed.BORROW), total('STILL OWED BY YOU (borrowed in)', owed.BORROW_IN));

  return buildXlsx({ name: 'Loans', rows, freeze: { rows: 6, cols: 2 }, widths: [12, 18, 10, 9, 34, 12, 12, 14, 8, 12, 34, 24] });
};