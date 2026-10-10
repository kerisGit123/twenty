// The month's restock sheet as an Excel file, laid out like the paper
// 订货单 (RESTOCK ORDER LISTING): "wedrink view" (item, price, opening,
// purchased), "pasar view" (take-outs by date, monthly consumption) and
// "wedrink order" (forecast, balance, months it lasts, forecast cost).

import { DEFAULT_RULE, monthSheet, type StockItem, type StockMovement, type StockRule, stockStatus, toCartons } from 'src/shared/stock';
import { STOCK_GROUPS } from 'src/shared/stock-types';
import { buildXlsx, type XlsxCell, type XlsxStyle } from 'src/shared/xlsx';

export const TEAL = '1F5F5B';
export const BROWN = '7B3F00';
export const HEAD = 'D9EEF0';
export const PASAR = 'B4C6E7';
export const PASAR_LIGHT = 'D9E1F2';
export const CREAM = 'FFF2CC';
export const ORDER = 'E2EFDA';
export const GROUP = 'EDEDED';
const IN_BAND = '375623';
const IN_HEAD = 'C6E0B4';
const IN_LIGHT = 'E2EFDA';

const s = (style: XlsxStyle): XlsxStyle => ({ border: true, ...style });
export const cell = (value: string | number | null, style: XlsxStyle = {}): XlsxCell => ({ value, style: s(style) });

export const dmy = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}/${iso.slice(2, 4)}`;

const nextMonthStart = (month: string) => {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));

  return date.toISOString().slice(0, 10);
};

export const stockMonthWorkbook = (
  items: StockItem[],
  movementsByItem: Map<string, StockMovement[]>,
  month: string,
  ruleOf: (ownerId: string | null) => StockRule,
  heading: { company: string; generatedOn: string },
) => {
  const sheet = monthSheet(items, movementsByItem, month);
  const asOf = nextMonthStart(month);
  // The forecast as it stood at the end of the month.
  const statusOf = (item: StockItem) =>
    stockStatus(
      item,
      (movementsByItem.get(item.id) ?? []).filter((m) => m.date < asOf),
      ruleOf(item.ownerId) ?? DEFAULT_RULE,
      asOf,
    );
  const rows = sheet.rows.filter((r) => r.item.status !== 'DISCONTINUED' || r.opening || r.purchased || r.consumption || r.closing);
  const dates = sheet.dates;
  const inDates = sheet.inDates;
  // Empty date slots to write in by hand, as on the paper sheet.
  const outBlanks = Math.max(0, 7 - dates.length);
  const inBlanks = Math.max(0, 2 - inDates.length);
  const lastDay = new Date(Date.parse(`${asOf}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  type Column = { head: string; width: number; fill: string };
  type Section = { band: string; bandFill: string; columns: Column[] };
  const sections: Section[] = [
    {
      band: 'wedrink view',
      bandFill: TEAL,
      columns: [
        { head: '存货编码\nItem code', width: 9, fill: HEAD },
        { head: '产品名称\nProduct name', width: 36, fill: HEAD },
        { head: '规格型号\nSpecification', width: 22, fill: HEAD },
        { head: '数量\nOpening (ctn)', width: 9, fill: HEAD },
        { head: '单价 (RM)\nUnit price / ctn', width: 10, fill: HEAD },
        { head: '金额 (RM)\nAmount', width: 11, fill: HEAD },
        { head: 'Purchased\nthis month (ctn)', width: 10, fill: HEAD },
        { head: 'Total\n(ctn)', width: 8, fill: HEAD },
        { head: 'Item / ctn', width: 7, fill: HEAD },
        { head: 'Qty in hand\n(units)', width: 10, fill: HEAD },
        { head: 'Expire date', width: 11, fill: HEAD },
      ],
    },
    {
      band: 'purchase (tarikh masuk)',
      bandFill: IN_BAND,
      columns: [...inDates.map((d) => ({ head: `IN ${dmy(d)}`, width: 8, fill: IN_HEAD })), ...Array.from({ length: inBlanks }, () => ({ head: 'tarikh masuk', width: 8, fill: IN_HEAD }))],
    },
    {
      band: 'pasar view',
      bandFill: BROWN,
      columns: [
        ...dates.map((d) => ({ head: dmy(d), width: 8, fill: PASAR })),
        ...Array.from({ length: outBlanks }, () => ({ head: 'tarikh ambil', width: 8, fill: PASAR })),
        { head: 'Monthly\nconsumption', width: 11, fill: CREAM },
        { head: 'Month consumption\ncost (RM)', width: 13, fill: CREAM },
      ],
    },
    {
      band: 'wedrink order',
      bandFill: TEAL,
      columns: [
        { head: 'Forecast next\nmonth (units)', width: 12, fill: ORDER },
        { head: 'Forecast\norder (ctn)', width: 10, fill: ORDER },
        { head: 'Balance\n(units)', width: 9, fill: ORDER },
        { head: 'Balance\n(ctn)', width: 9, fill: ORDER },
        { head: 'Lasts\n(months)', width: 8, fill: ORDER },
        { head: 'Forecast\ncost (RM)', width: 11, fill: ORDER },
      ],
    },
  ];
  const columns = sections.flatMap((section) => section.columns);
  const width = columns.length;

  const out: XlsxCell[][] = [];
  const merges: Array<[number, number, number, number]> = [];

  out.push([{ value: '订货单 (RESTOCK ORDER LISTING)', style: { bold: true, size: 14 } }]);
  out.push([{ value: '日期 Date:', style: { bold: true } }, { value: `${month.slice(0, 4)}-${month.slice(5, 7)} (${dmy(`${month}-01`)} – ${dmy(lastDay)})` }]);
  out.push([{ value: '公司名称 Company:', style: { bold: true } }, { value: heading.company }]);
  out.push([{ value: 'Generated:', style: { italic: true, color: '808080' } }, { value: heading.generatedOn, style: { italic: true, color: '808080' } }]);
  out.push([]);

  // Band row: wedrink view / purchase / pasar view / wedrink order.
  const band = 5;
  const bandRow: XlsxCell[] = [];
  let at = 0;

  for (const section of sections) {
    section.columns.forEach((_, i) => bandRow.push(cell(i === 0 ? section.band : '', { fill: section.bandFill, color: 'FFFFFF', bold: true, align: 'center' })));
    if (section.columns.length > 1) merges.push([band, at, band, at + section.columns.length - 1]);
    at += section.columns.length;
  }
  out.push(bandRow);
  out.push(columns.map((col) => cell(col.head, { fill: col.fill, bold: true, align: 'center', wrap: true })));

  const num = (value: number, style: XlsxStyle = {}) => cell(value ? Math.round(value * 100) / 100 : null, { format: 'num', align: 'right', ...style });
  const money = (value: number, style: XlsxStyle = {}) => cell(value ? Math.round(value * 100) / 100 : null, { format: 'money', align: 'right', ...style });
  const totals = { amount: 0, cost: 0, forecastCost: 0 };

  for (const group of STOCK_GROUPS) {
    const groupRows = rows.filter((r) => r.item.group === group.value);

    if (!groupRows.length) continue;
    out.push([cell(group.label, { fill: GROUP, bold: true }), ...Array.from({ length: width - 1 }, () => cell(null, { fill: GROUP }))]);
    merges.push([out.length - 1, 0, out.length - 1, width - 1]);

    for (const r of groupRows) {
      const item = r.item;
      const status = statusOf(item);
      const openingCtn = toCartons(r.opening, item);
      const purchasedCtn = toCartons(r.purchased + r.otherIn, item);
      const amount = openingCtn * item.cartonPrice;
      const expiry = r.closing > 0 ? status.nearestExpiry : null;
      const expiryColor = expiry && expiry < heading.generatedOn ? 'C00000' : expiry && Date.parse(expiry) - Date.parse(heading.generatedOn) <= 60 * 86_400_000 ? '9C5700' : undefined;

      totals.amount += amount;
      totals.cost += r.consumptionCost;
      totals.forecastCost += status.suggestedCost;
      out.push([
        cell(item.code, { align: 'center' }),
        cell(item.name),
        cell(item.specification, { wrap: true }),
        num(openingCtn),
        money(item.cartonPrice),
        money(amount),
        num(purchasedCtn),
        num(openingCtn + purchasedCtn),
        num(item.unitsPerCarton),
        num(r.opening + r.purchased + r.otherIn),
        cell(expiry ? dmy(expiry) : null, { align: 'center', color: expiryColor, bold: Boolean(expiryColor) }),
        ...inDates.map((d) => num(r.ins[d] ?? 0, { fill: IN_LIGHT, color: '2E7D32', bold: true })),
        ...Array.from({ length: inBlanks }, () => cell(null, { fill: IN_LIGHT })),
        ...dates.map((d) => num(r.takes[d] ?? 0, { fill: PASAR_LIGHT })),
        ...Array.from({ length: outBlanks }, () => cell(null, { fill: PASAR_LIGHT })),
        num(r.consumption, { fill: CREAM, bold: true }),
        money(r.consumptionCost, { fill: CREAM }),
        num(status.forecast, { fill: ORDER }),
        num(status.suggestedCartons, { fill: ORDER, bold: true }),
        num(r.closing, { fill: ORDER }),
        num(r.closingCartons, { fill: ORDER }),
        cell(r.monthsLeft === null ? null : Math.round(r.monthsLeft * 10) / 10, { fill: ORDER, format: 'months', align: 'right', color: r.monthsLeft !== null && r.monthsLeft < (item.reorderBelowMonths ?? ruleOf(item.ownerId).reorderBelow) ? 'C00000' : undefined }),
        money(status.suggestedCost, { fill: ORDER }),
      ]);
    }
  }

  // Totals: amount, consumption cost and forecast cost.
  const totalRow: XlsxCell[] = Array.from({ length: width }, () => cell(null, { fill: HEAD }));
  const costCol = columns.findIndex((col) => col.head.startsWith('Month consumption'));

  totalRow[1] = cell('TOTAL', { fill: HEAD, bold: true });
  totalRow[5] = money(totals.amount, { fill: HEAD, bold: true });
  totalRow[costCol] = money(totals.cost, { fill: HEAD, bold: true });
  totalRow[width - 1] = money(totals.forecastCost, { fill: HEAD, bold: true });
  out.push(totalRow);

  out.push([]);
  out.push([{ value: 'Units are each item’s inner unit (bag, bottle, pcs). Opening/purchased in cartons; IN, take-outs, consumption and balance in units. Blank date columns are for writing in by hand.', style: { italic: true, color: '808080' } }]);
  out.push([{ value: `Expire date = the earliest expiry still in stock (red: expired, amber: within 60 days). Forecast = average of the last 3 months with take-outs, as at ${dmy(asOf)}.`, style: { italic: true, color: '808080' } }]);

  return buildXlsx({
    name: `Stock ${month}`,
    rows: out,
    merges,
    freeze: { rows: 7, cols: 2 },
    heights: { 6: 30 },
    widths: columns.map((col) => col.width),
  });
};

export const stockMonthFileName = (month: string) => `stock-${month}.xlsx`;

