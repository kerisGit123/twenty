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

  const wedrink = ['存货编码\nItem code', '产品名称\nProduct name', '规格型号\nSpecification', '数量\nOpening (ctn)', '单价 (RM)\nUnit price / ctn', '金额 (RM)\nAmount', 'Purchased\nthis month (ctn)', 'Total\n(ctn)', 'Item / ctn', 'Qty in hand\n(units)'];
  const pasar = [...dates.map((d) => dmy(d)), 'Monthly\nconsumption', 'Month consumption\ncost (RM)'];
  const order = ['Forecast next\nmonth (units)', 'Forecast\norder (ctn)', 'Balance\n(units)', 'Balance\n(ctn)', 'Lasts\n(months)', 'Forecast\ncost (RM)'];
  const width = wedrink.length + pasar.length + order.length;
  const pasarStart = wedrink.length;
  const orderStart = pasarStart + pasar.length;

  const out: XlsxCell[][] = [];
  const merges: Array<[number, number, number, number]> = [];

  out.push([{ value: '订货单 (RESTOCK ORDER LISTING)', style: { bold: true, size: 14 } }]);
  out.push([{ value: '日期 Date:', style: { bold: true } }, { value: `${month.slice(0, 4)}-${month.slice(5, 7)} (${dmy(`${month}-01`)} – ${dmy(new Date(Date.parse(`${asOf}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10))})` }]);
  out.push([{ value: '公司名称 Company:', style: { bold: true } }, { value: heading.company }]);
  out.push([{ value: 'Generated:', style: { italic: true, color: '808080' } }, { value: heading.generatedOn, style: { italic: true, color: '808080' } }]);
  out.push([]);

  // Band row: wedrink view / pasar view / wedrink order.
  const band = 5;
  const bandRow: XlsxCell[] = [];

  for (let c = 0; c < width; c++) {
    const fill = c < pasarStart ? TEAL : c < orderStart ? BROWN : TEAL;

    bandRow.push(cell(c === 0 ? 'wedrink view' : c === pasarStart ? 'pasar view' : c === orderStart ? 'wedrink order' : '', { fill, color: 'FFFFFF', bold: true, align: 'center' }));
  }
  out.push(bandRow);
  merges.push([band, 0, band, pasarStart - 1], [band, pasarStart, band, orderStart - 1], [band, orderStart, band, width - 1]);

  out.push([
    ...wedrink.map((h) => cell(h, { fill: HEAD, bold: true, align: 'center', wrap: true })),
    ...pasar.map((h, i) => cell(h, { fill: i < dates.length ? PASAR : CREAM, bold: true, align: 'center', wrap: true })),
    ...order.map((h) => cell(h, { fill: ORDER, bold: true, align: 'center', wrap: true })),
  ]);

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
        ...dates.map((d) => num(r.takes[d] ?? 0, { fill: PASAR_LIGHT })),
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

  // Totals.
  const totalRow: XlsxCell[] = Array.from({ length: width }, () => cell(null, { fill: HEAD }));

  totalRow[1] = cell('TOTAL', { fill: HEAD, bold: true });
  totalRow[5] = money(totals.amount, { fill: HEAD, bold: true });
  totalRow[pasarStart + dates.length + 1] = money(totals.cost, { fill: HEAD, bold: true });
  totalRow[width - 1] = money(totals.forecastCost, { fill: HEAD, bold: true });
  out.push(totalRow);

  out.push([]);
  out.push([{ value: 'Units are each item’s inner unit (bag, bottle, pcs). Opening/purchased in cartons; take-outs, consumption and balance in units.', style: { italic: true, color: '808080' } }]);
  out.push([{ value: `Forecast = average of the last 3 months with take-outs, as at ${dmy(asOf)}. Forecast order = cartons to reach the "order enough for" months when stock lasts less than the re-order level.`, style: { italic: true, color: '808080' } }]);

  return buildXlsx({
    name: `Stock ${month}`,
    rows: out,
    merges,
    freeze: { rows: 7, cols: 2 },
    heights: { 6: 30 },
    widths: [9, 36, 22, 9, 10, 11, 10, 8, 7, 10, ...dates.map(() => 8), 11, 13, 12, 10, 9, 9, 8, 11],
  });
};

export const stockMonthFileName = (month: string) => `stock-${month}.xlsx`;

