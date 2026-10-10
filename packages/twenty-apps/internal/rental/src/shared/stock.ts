// Stock arithmetic for the F&B module (pure, shared by the page, the routes
// and the CSV): balances, the monthly sheet, the forecast and the order plan.
// Every quantity is in inner units (bag, bottle, pcs).

import { DEFAULT_ORDER_UP_TO_MONTHS, DEFAULT_REORDER_BELOW_MONTHS, isIn } from 'src/shared/stock-types';

export type StockItem = {
  id: string;
  code: string;
  name: string;
  specification: string;
  group: string;
  unit: string;
  unitsPerCarton: number;
  cartonPrice: number;
  supplier: string;
  status: string; // ACTIVE | DISCONTINUED
  reorderBelowMonths: number | null;
  notes: string;
  ownerId: string | null;
  ownerName: string;
};

export type StockMovement = {
  id: string;
  itemId: string;
  date: string;
  type: string;
  quantity: number;
  party: string;
  unitCost: number | null;
  expiryDate: string | null;
  reference: string;
  notes: string;
  borrowStatus: string | null;
  borrowId: string | null;
  batchId?: string | null; // lines saved together (one delivery)
  ownerId: string | null;
};

export type StockRule = { reorderBelow: number; orderUpTo: number };

export const DEFAULT_RULE: StockRule = { reorderBelow: DEFAULT_REORDER_BELOW_MONTHS, orderUpTo: DEFAULT_ORDER_UP_TO_MONTHS };

const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;

export const signedQuantity = (m: Pick<StockMovement, 'type' | 'quantity'>) => (isIn(m.type) ? m.quantity : -m.quantity);

export const unitPrice = (item: Pick<StockItem, 'cartonPrice' | 'unitsPerCarton'>) => item.cartonPrice / (item.unitsPerCarton || 1);

export const toCartons = (units: number, item: Pick<StockItem, 'unitsPerCarton'>) => round(units / (item.unitsPerCarton || 1), 2);

// 19 bags at 8 a carton -> "2 ctn 3 bag"
export const cartonsAndUnits = (units: number, item: Pick<StockItem, 'unitsPerCarton' | 'unit'>) => {
  const per = item.unitsPerCarton || 1;
  const sign = units < 0 ? '-' : '';
  const abs = Math.abs(round(units, 2));
  const ctn = Math.floor(abs / per);
  const rest = round(abs - ctn * per, 2);
  const unit = item.unit || 'unit';

  if (per === 1) return `${sign}${abs} ${unit}`;
  if (!ctn) return `${sign}${rest} ${unit}`;

  return `${sign}${ctn} ctn${rest ? ` ${rest} ${unit}` : ''}`;
};

const monthOf = (iso: string) => iso.slice(0, 7);

// Balance of one item from its movements, optionally only before a date.
export const balanceOf = (movements: StockMovement[], before?: string) =>
  round(movements.reduce((sum, m) => (before && m.date >= before ? sum : sum + signedQuantity(m)), 0));

// Units taken out per month (TAKE only: what Wawa used), oldest first.
export const monthlyTakes = (movements: StockMovement[]) => {
  const byMonth = new Map<string, number>();

  for (const m of movements) if (m.type === 'TAKE') byMonth.set(monthOf(m.date), (byMonth.get(monthOf(m.date)) ?? 0) + m.quantity);

  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
};

// Next month's consumption: the average of the last 3 months with takes
// recorded (the current, unfinished month only counts when it's all there is).
export const forecastNextMonth = (movements: StockMovement[], today: string) => {
  const months = monthlyTakes(movements);
  const finished = months.filter(([month]) => month < monthOf(today));
  const basis = (finished.length ? finished : months).slice(-3);

  if (!basis.length) return { forecast: 0, basis: [] as string[] };

  return { forecast: round(basis.reduce((sum, [, units]) => sum + units, 0) / basis.length, 2), basis: basis.map(([month]) => month) };
};

// The earliest expiry still on the shelf, assuming the oldest stock goes out
// first: the balance is made of the newest deliveries.
export const nearestExpiry = (movements: StockMovement[], balance: number) => {
  let left = balance;
  let nearest: string | null = null;
  // Newest first; on the same day, the one recorded later is the newer.
  const deliveries = movements
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => isIn(m.type) && m.quantity > 0)
    .sort((a, b) => b.m.date.localeCompare(a.m.date) || b.index - a.index)
    .map(({ m }) => m);

  for (const d of deliveries) {
    if (left <= 0) break;
    if (d.expiryDate && (!nearest || d.expiryDate < nearest)) nearest = d.expiryDate;
    left -= d.quantity;
  }

  return nearest;
};

export type StockFlag = 'ORDER' | 'LOW' | 'OK' | 'NO_USE' | 'EMPTY';

export type StockStatus = {
  item: StockItem;
  balance: number;
  cartons: number;
  value: number;
  lastMonthTaken: number;
  forecast: number;
  forecastBasis: string[];
  monthsLeft: number | null; // null when nothing is being used
  reorderBelow: number;
  flag: StockFlag;
  suggestedUnits: number;
  suggestedCartons: number;
  suggestedCost: number;
  nearestExpiry: string | null;
  lentOut: number; // lent to branches, not yet settled
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const expiresSoon = (expiry: string | null, today: string, days = 60) => !!expiry && daysBetween(today, expiry) <= days;

// EXPIRED (past), SOON (within the warning days), OK, or null (no date).
export const expiryState = (expiry: string | null, today: string, days = 60): 'EXPIRED' | 'SOON' | 'OK' | null =>
  !expiry ? null : expiry < today ? 'EXPIRED' : daysBetween(today, expiry) <= days ? 'SOON' : 'OK';

// Where an item stands today and what to order.
export const stockStatus = (item: StockItem, movements: StockMovement[], rule: StockRule, today: string): StockStatus => {
  const balance = balanceOf(movements);
  const { forecast, basis } = forecastNextMonth(movements, today);
  const reorderBelow = item.reorderBelowMonths ?? rule.reorderBelow;
  const monthsLeft = forecast > 0 ? round(Math.max(balance, 0) / forecast, 2) : null;
  const lastMonth = monthOf(new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) - 86_400_000).toISOString());
  const lastMonthTaken = monthlyTakes(movements).find(([month]) => month === lastMonth)?.[1] ?? 0;
  const per = item.unitsPerCarton || 1;
  const active = item.status !== 'DISCONTINUED';

  let flag: StockFlag = 'OK';

  if (monthsLeft === null) flag = balance <= 0 ? 'EMPTY' : 'NO_USE';
  else if (monthsLeft < reorderBelow) flag = 'ORDER';
  else if (monthsLeft < reorderBelow + 0.5) flag = 'LOW';

  // Bring the item up to "order enough for" months of next month's use, in whole cartons.
  const shortBy = active && flag === 'ORDER' ? Math.max(0, forecast * Math.max(rule.orderUpTo, reorderBelow) - Math.max(balance, 0)) : 0;
  const suggestedCartons = shortBy > 0 ? Math.ceil(round(shortBy / per, 4)) : 0;

  return {
    item,
    balance,
    cartons: toCartons(balance, item),
    value: round(Math.max(balance, 0) * unitPrice(item), 2),
    lastMonthTaken,
    forecast,
    forecastBasis: basis,
    monthsLeft,
    reorderBelow,
    flag,
    suggestedUnits: suggestedCartons * per,
    suggestedCartons,
    suggestedCost: round(suggestedCartons * item.cartonPrice, 2),
    nearestExpiry: nearestExpiry(movements, balance),
    lentOut: round(
      movements.filter((m) => m.type === 'BORROW' && (m.borrowStatus ?? 'OUTSTANDING') === 'OUTSTANDING').reduce((sum, m) => sum + m.quantity, 0),
    ),
  };
};

export type MonthRow = {
  item: StockItem;
  opening: number;
  purchased: number;
  otherIn: number; // borrow returns, exchanges, stock-take surplus
  takes: Record<string, number>; // date -> units taken out
  ins: Record<string, number>; // date -> units in (purchases, returns, exchanges, stock-take surplus)
  consumption: number; // all takes this month
  lent: number;
  waste: number; // waste and stock-take shortfall
  closing: number;
  closingCartons: number;
  consumptionCost: number;
  monthsLeft: number | null; // closing / this month's consumption
};

// The month as the restock sheet shows it: opening, in, takes by date, closing.
export const monthSheet = (items: StockItem[], movementsByItem: Map<string, StockMovement[]>, month: string) => {
  const start = `${month}-01`;
  const next = monthOf(new Date(Date.parse(`${start}T00:00:00Z`) + 32 * 86_400_000).toISOString());
  const end = `${next}-01`;
  const dates = new Set<string>();
  const inDates = new Set<string>();

  const rows: MonthRow[] = items.map((item) => {
    const all = movementsByItem.get(item.id) ?? [];
    const inMonth = all.filter((m) => m.date >= start && m.date < end);
    const sum = (types: string[]) => round(inMonth.filter((m) => types.includes(m.type)).reduce((s, m) => s + m.quantity, 0));
    const takes: Record<string, number> = {};
    const ins: Record<string, number> = {};

    for (const m of inMonth) {
      if (m.type === 'TAKE') {
        takes[m.date] = round((takes[m.date] ?? 0) + m.quantity);
        dates.add(m.date);
      } else if (isIn(m.type)) {
        ins[m.date] = round((ins[m.date] ?? 0) + m.quantity);
        inDates.add(m.date);
      }
    }

    const opening = balanceOf(all, start);
    const purchased = sum(['PURCHASE']);
    const otherIn = sum(['RETURN', 'EXCHANGE_IN', 'ADJUST_IN']);
    const consumption = sum(['TAKE']);
    const lent = sum(['BORROW']);
    const waste = sum(['WASTE', 'ADJUST_OUT']);
    const closing = round(opening + purchased + otherIn - consumption - lent - waste);

    return {
      item,
      opening,
      purchased,
      otherIn,
      takes,
      ins,
      consumption,
      lent,
      waste,
      closing,
      closingCartons: toCartons(closing, item),
      consumptionCost: round(consumption * unitPrice(item), 2),
      monthsLeft: consumption > 0 ? round(Math.max(closing, 0) / consumption, 2) : null,
    };
  });

  return { month, dates: [...dates].sort(), inDates: [...inDates].sort(), rows };
};

// One delivery (stock that came in together): its date and who it came from.
export type Delivery = { key: string; date: string; party: string; reference: string };

export type HistoryRow = {
  item: StockItem;
  opening: number;
  days: Record<string, { in: number; out: number }>;
  deliveries: Record<string, number>; // delivery key -> units in
  totalIn: number;
  totalOut: number;
  closing: number;
};

// Any period as a grid, like the paper sheet: per item, the IN and OUT of
// each day that had movement (from and to both included).
// Lines saved together are one delivery; older lines without a save id are
// grouped by day, supplier and reference.
const deliveryKey = (m: StockMovement) => m.batchId || `${m.date}|${m.type}|${m.party}|${m.reference}`;

export const historySheet = (items: StockItem[], movementsByItem: Map<string, StockMovement[]>, from: string, to: string) => {
  const dates = new Set<string>();
  const deliveryList = new Map<string, Delivery>();

  const rows: HistoryRow[] = items.map((item) => {
    const all = movementsByItem.get(item.id) ?? [];
    const days: HistoryRow['days'] = {};
    const deliveries: HistoryRow['deliveries'] = {};
    let totalIn = 0;
    let totalOut = 0;

    for (const m of all) {
      if (m.date < from || m.date > to) continue;
      const day = (days[m.date] ??= { in: 0, out: 0 });

      if (isIn(m.type)) {
        const key = deliveryKey(m);

        day.in = round(day.in + m.quantity);
        deliveries[key] = round((deliveries[key] ?? 0) + m.quantity);
        if (!deliveryList.has(key)) deliveryList.set(key, { key, date: m.date, party: m.party, reference: m.reference });
        totalIn += m.quantity;
      } else {
        day.out = round(day.out + m.quantity);
        totalOut += m.quantity;
      }
      dates.add(m.date);
    }

    const opening = balanceOf(all, from);

    return { item, opening, days, deliveries, totalIn: round(totalIn), totalOut: round(totalOut), closing: round(opening + totalIn - totalOut) };
  });

  // Days with an IN and days with an OUT, for the two sections of the grid.
  const inDates = [...dates].filter((d) => rows.some((r) => r.days[d]?.in)).sort();
  const outDates = [...dates].filter((d) => rows.some((r) => r.days[d]?.out)).sort();

  // Each delivery is its own IN column, oldest first.
  const ins = [...deliveryList.values()].sort((a, b) => a.date.localeCompare(b.date));

  return { dates: [...dates].sort(), inDates, outDates, ins, rows };
};

export const groupMovements = (movements: StockMovement[]) => {
  const map = new Map<string, StockMovement[]>();

  for (const m of movements) map.set(m.itemId, [...(map.get(m.itemId) ?? []), m]);

  return map;
};

// CSV ------------------------------------------------------------------------

const cell = (value: string | number) => {
  const text = String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csv = (rows: Array<Array<string | number>>) => rows.map((row) => row.map(cell).join(',')).join('\r\n');

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const monthSheetCsv = (sheet: ReturnType<typeof monthSheet>) =>
  csv([
    [
      'Item code',
      'Product name',
      'Specification',
      'Unit',
      'Units/ctn',
      'Carton price (RM)',
      'Opening (units)',
      'Purchased',
      'Other in',
      ...sheet.dates.map((d) => `Taken ${dm(d)}`),
      'Monthly consumption',
      'Consumption cost (RM)',
      'Lent out',
      'Waste / short',
      'Closing (units)',
      'Closing (ctn)',
      'Months left',
    ],
    ...sheet.rows.map((r) => [
      r.item.code,
      r.item.name,
      r.item.specification,
      r.item.unit,
      r.item.unitsPerCarton,
      r.item.cartonPrice.toFixed(2),
      r.opening,
      r.purchased,
      r.otherIn,
      ...sheet.dates.map((d) => r.takes[d] ?? ''),
      r.consumption,
      r.consumptionCost.toFixed(2),
      r.lent,
      r.waste,
      r.closing,
      r.closingCartons,
      r.monthsLeft ?? '',
    ]),
  ]);

export const orderPlanCsv = (rows: StockStatus[]) =>
  csv([
    ['Item code', 'Product name', 'Specification', 'Balance (units)', 'Balance (ctn)', 'Forecast next month', 'Months left', 'Re-order below', 'Order (ctn)', 'Order (units)', 'Carton price (RM)', 'Order cost (RM)', 'Nearest expiry'],
    ...rows.map((s) => [
      s.item.code,
      s.item.name,
      s.item.specification,
      s.balance,
      s.cartons,
      s.forecast,
      s.monthsLeft ?? '',
      s.reorderBelow,
      s.suggestedCartons,
      s.suggestedUnits,
      s.item.cartonPrice.toFixed(2),
      s.suggestedCost.toFixed(2),
      s.nearestExpiry ?? '',
    ]),
  ]);
